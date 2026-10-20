import type { RowDataPacket } from 'mysql2';
import type {
  AdminDashboardData,
  AdminDashboardStats,
  AdminPeriodDays,
  AssetKindDetail,
  LifecycleSnapshot,
  ProgramCountSlice,
  RecentRejectionRow,
  RoleCountSlice,
  TopRequesterRow,
} from '@shared/lib/admin-dashboard-schema';
import { ROLE_USER } from '@shared/lib/auth-session';
import { sqlDateToIso as formatDate } from '@shared/lib/date-format';
import { formatStatusLabel } from '@shared/lib/inventory-schema';
import { attachDisplayNames } from '@backend/server/core/azure-directory.server';
import { getDbPool } from '@backend/server/core/db';
import { loadDashboardCharts } from '@backend/server/operations/dashboard-charts.server';

function formatDateTime(val: Date | string | null | undefined): string {
  if (val == null) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 16).replace('T', ' ');
  return String(val).slice(0, 16);
}

function periodStartIso(periodDays: AdminPeriodDays): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (periodDays - 1));
  return formatDate(d);
}

export async function getAdminDashboard(periodDays: AdminPeriodDays): Promise<AdminDashboardData> {
  const pool = getDbPool();
  const rangeStart = periodStartIso(periodDays);
  const charts = await loadDashboardCharts(pool, periodDays);

  const [statRows] = await pool.query<
    (RowDataPacket & {
      laptop_total: number;
      av_total: number;
      network_total: number;
      registered_users: number;
      requests_in_period: number;
      checked_out: number;
    })[]
  >(
    `SELECT
      (SELECT COUNT(*) FROM laptop) AS laptop_total,
      (SELECT COUNT(*) FROM av) AS av_total,
      (SELECT COUNT(*) FROM network) AS network_total,
      (SELECT COUNT(*) FROM users WHERE role_id = ?) AS registered_users,
      (SELECT COUNT(*) FROM request
       WHERE rejected_at IS NULL AND created_at >= ?) AS requests_in_period,
      (SELECT COUNT(*) FROM request_assignment ra
       INNER JOIN request r ON r.request_id = ra.request_id
       WHERE ra.checkout_at IS NOT NULL AND ra.returned_at IS NULL AND r.rejected_at IS NULL) AS checked_out`,
    [ROLE_USER, rangeStart],
  );
  const statRow = statRows[0];

  const [rejectedRows] = await pool.query<(RowDataPacket & { cnt: number })[]>(
    `SELECT COUNT(*) AS cnt FROM request
     WHERE rejected_at IS NOT NULL AND created_at >= ?`,
    [rangeStart],
  );

  const todayIso = formatDate(new Date());
  const dueSoonEnd = formatDate(new Date(new Date().setDate(new Date().getDate() + 7)));
  const [loanRows] = await pool.query<(RowDataPacket & { due_soon: number; overdue: number })[]>(
    `SELECT
      COALESCE(SUM(r.return_date >= ? AND r.return_date <= ?), 0) AS due_soon,
      COALESCE(SUM(r.return_date < ?), 0) AS overdue
     FROM request_assignment ra
     INNER JOIN request r ON r.request_id = ra.request_id
     WHERE ra.checkout_at IS NOT NULL AND ra.returned_at IS NULL AND r.rejected_at IS NULL`,
    [todayIso, dueSoonEnd, todayIso],
  );

  const [programRows] = await pool.query<(RowDataPacket & { program_type: string; cnt: number })[]>(
    `SELECT program_type, COUNT(*) AS cnt
     FROM request
     WHERE rejected_at IS NULL AND created_at >= ?
     GROUP BY program_type
     ORDER BY cnt DESC`,
    [rangeStart],
  );
  const programBreakdown: ProgramCountSlice[] = programRows.map((r) => ({
    programType: r.program_type,
    count: Number(r.cnt),
  }));

  const loan = loanRows[0];
  const stats: AdminDashboardStats = {
    totalAssets:
      Number(statRow?.laptop_total ?? 0) +
      Number(statRow?.av_total ?? 0) +
      Number(statRow?.network_total ?? 0),
    registeredUsers: Number(statRow?.registered_users ?? 0),
    requestsInPeriod: Number(statRow?.requests_in_period ?? 0),
    rejectedInPeriod: Number(rejectedRows[0]?.cnt ?? 0),
    onLoanNow: Number(statRow?.checked_out ?? 0),
    onLoanDueSoon: Number(loan?.due_soon ?? 0),
    onLoanOverdue: Number(loan?.overdue ?? 0),
  };

  const assetsByKind = await Promise.all(
    (['laptop', 'av', 'network'] as const).map(async (kind): Promise<AssetKindDetail> => {
      const [rows] = await pool.query<(RowDataPacket & { status_id: number; cnt: number })[]>(
        `SELECT status_id, COUNT(*) AS cnt FROM \`${kind}\` GROUP BY status_id ORDER BY status_id`,
      );
      const byStatus = rows.map((r) => ({
        statusName: formatStatusLabel(Number(r.status_id)),
        count: Number(r.cnt),
      }));
      const total = byStatus.reduce((sum, r) => sum + r.count, 0);
      return { kind, total, byStatus };
    }),
  );

  const [roleRows] = await pool.query<(RowDataPacket & { role_name: string; cnt: number })[]>(
    `SELECT r.name AS role_name, COUNT(*) AS cnt
     FROM users u
     INNER JOIN role r ON r.id = u.role_id
     GROUP BY r.name
     ORDER BY r.name`,
  );
  const usersByRole: RoleCountSlice[] = roleRows.map((r) => ({
    roleName: r.role_name,
    count: Number(r.cnt),
  }));

  const [topRows] = await pool.query<
    (RowDataPacket & { id: number; oid: string | null; full_name: string; cnt: number })[]
  >(
    `SELECT u.id, u.oid, COUNT(*) AS cnt
     FROM request r
     INNER JOIN users u ON u.id = r.requested_by
     WHERE r.created_at >= ?
     GROUP BY u.id, u.oid
     ORDER BY cnt DESC
     LIMIT 10`,
    [rangeStart],
  );
  await attachDisplayNames(topRows, 'oid', 'full_name');
  const topRequesters: TopRequesterRow[] = topRows.map((r) => ({
    staffId: String(r.id),
    fullName: r.full_name,
    requestCount: Number(r.cnt),
  }));

  const [rejectRows] = await pool.query<
    (RowDataPacket & {
      request_id: number;
      rejected_at: Date | string;
      requester_oid: string | null;
      requester_name: string;
      program_type: string;
      rejection_reason: string | null;
    })[]
  >(
    `SELECT r.request_id, r.rejected_at, u.oid AS requester_oid,
            r.program_type, r.rejection_reason
     FROM request r
     INNER JOIN users u ON u.id = r.requested_by
     WHERE r.rejected_at IS NOT NULL
     ORDER BY r.rejected_at DESC
     LIMIT 10`,
  );
  await attachDisplayNames(rejectRows, 'requester_oid', 'requester_name');
  const recentRejections: RecentRejectionRow[] = rejectRows.map((r) => ({
    requestId: r.request_id,
    rejectedAt: formatDateTime(r.rejected_at),
    requesterName: r.requester_name,
    programType: r.program_type,
    rejectionReason: (r.rejection_reason ?? '').slice(0, 120) || '—',
  }));

  const today = formatDate(new Date());
  const warrantyEnd = formatDate(
    new Date(new Date().setDate(new Date().getDate() + 30)),
  );

  const [lifecycleRows] = await pool.query<
    (RowDataPacket & {
      deployed: number;
      available: number;
      pre_disposed: number;
      warranties_expiring: number;
    })[]
  >(
    `SELECT
      (SELECT COUNT(*) FROM laptop WHERE status_id = 3) +
      (SELECT COUNT(*) FROM av WHERE status_id = 3) +
      (SELECT COUNT(*) FROM network WHERE status_id = 3) AS deployed,
      (SELECT COUNT(*) FROM laptop WHERE status_id IN (1,2)) +
      (SELECT COUNT(*) FROM av WHERE status_id IN (1,2)) +
      (SELECT COUNT(*) FROM network WHERE status_id IN (1,2)) AS available,
      (SELECT COUNT(*) FROM laptop WHERE status_id = 4) +
      (SELECT COUNT(*) FROM av WHERE status_id = 4) +
      (SELECT COUNT(*) FROM network WHERE status_id = 4) AS pre_disposed,
      (SELECT COUNT(*) FROM warranty
       WHERE warranty_end_date >= ? AND warranty_end_date <= ?) AS warranties_expiring`,
    [today, warrantyEnd],
  );
  const lc = lifecycleRows[0];
  const lifecycle: LifecycleSnapshot = {
    deployedAssets: Number(lc?.deployed ?? 0),
    availableAssets: Number(lc?.available ?? 0),
    preDisposedAssets: Number(lc?.pre_disposed ?? 0),
    warrantiesExpiringSoon: Number(lc?.warranties_expiring ?? 0),
  };

  return {
    periodDays,
    stats,
    charts,
    assetsByKind,
    programBreakdown,
    usersByRole,
    topRequesters,
    recentRejections,
    lifecycle,
  };
}
