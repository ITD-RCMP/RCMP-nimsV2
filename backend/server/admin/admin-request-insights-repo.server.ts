import type { RowDataPacket } from 'mysql2';
import type { AdminRequestInsights } from '@shared/lib/admin-request-insights-schema';
import { sqlDateToIso as formatDate } from '@shared/lib/date-format';
import { attachDisplayNames } from '@backend/server/core/azure-directory.server';
import { getDbPool } from '@backend/server/core/db';

function formatDateTime(val: Date | string | null | undefined): string {
  if (val == null) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 16).replace('T', ' ');
  return String(val).slice(0, 16);
}

export type AdminRequestInsightsMonth = {
  year?: number;
  month?: number;
};

function resolveMonth(calendar?: AdminRequestInsightsMonth) {
  const now = new Date();
  const year = calendar?.year ?? now.getFullYear();
  const month = calendar?.month ?? now.getMonth() + 1;
  return { year, month };
}

function monthStartIso(calendar?: AdminRequestInsightsMonth): string {
  const { year, month } = resolveMonth(calendar);
  return formatDate(new Date(year, month - 1, 1));
}

function monthLabel(calendar?: AdminRequestInsightsMonth): string {
  const { year, month } = resolveMonth(calendar);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export async function getAdminRequestInsights(
  calendar?: AdminRequestInsightsMonth,
): Promise<AdminRequestInsights> {
  const pool = getDbPool();
  const monthStart = monthStartIso(calendar);

  const [topRows] = await pool.query<
    (RowDataPacket & { id: number; oid: string | null; full_name: string; cnt: number })[]
  >(
    `SELECT u.id, u.oid, COUNT(*) AS cnt
     FROM request r
     INNER JOIN users u ON u.id = r.requested_by
     WHERE r.created_at >= ?
     GROUP BY u.id, u.oid
     ORDER BY cnt DESC
     LIMIT 5`,
    [monthStart],
  );
  await attachDisplayNames(topRows, 'oid', 'full_name');

  const [programRows] = await pool.query<
    (RowDataPacket & { program_type: string; cnt: number })[]
  >(
    `SELECT program_type, COUNT(*) AS cnt
     FROM request
     WHERE created_at >= ? AND rejected_at IS NULL
     GROUP BY program_type
     ORDER BY cnt DESC, program_type ASC`,
    [monthStart],
  );

  const [recentRows] = await pool.query<
    (RowDataPacket & {
      request_id: number;
      created_at: Date | string;
      program_type: string;
      borrow_date: Date | string;
      return_date: Date | string;
      requester_oid: string | null;
      requester_name: string;
    })[]
  >(
    `SELECT r.request_id, r.created_at, r.program_type, r.borrow_date, r.return_date,
            u.oid AS requester_oid
     FROM request r
     INNER JOIN users u ON u.id = r.requested_by
     WHERE r.rejected_at IS NULL
     ORDER BY r.created_at DESC
     LIMIT 5`,
  );
  await attachDisplayNames(recentRows, 'requester_oid', 'requester_name');

  return {
    monthLabel: monthLabel(calendar),
    topRequesters: topRows.map((row) => ({
      staffId: String(row.id),
      fullName: row.full_name,
      requestCount: Number(row.cnt),
    })),
    programTypes: programRows.map((row) => ({
      programType: row.program_type,
      count: Number(row.cnt),
    })),
    recentRequests: recentRows.map((row) => ({
      requestId: row.request_id,
      requesterName: row.requester_name,
      programType: row.program_type,
      borrowDate: formatDate(row.borrow_date),
      returnDate: formatDate(row.return_date),
      createdAt: formatDateTime(row.created_at),
    })),
  };
}
