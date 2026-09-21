import type { RowDataPacket } from 'mysql2';
import {
  DASHBOARD_REQUEST_WORKFLOW_LABEL,
  type TechnicianDashboardStats,
} from '@shared/lib/dashboard-schema';
import {
  extractAssetIdCandidates,
  extractMacCandidates,
  extractSerialCandidates,
} from '@shared/lib/admin-prompt-context';
import {
  ASSET_KIND_LABEL,
  formatStatusLabel,
  INVENTORY_STATUSES,
  parseAssetKindParam,
  type AssetDetailResponse,
  type AssetKind,
} from '@shared/lib/inventory-schema';
import { sqlDateToIso as formatDate } from '@shared/lib/date-format';
import { attachDisplayNames } from '@backend/server/core/azure-directory.server';
import { getDbPool } from '@backend/server/core/db';

const DEFAULT_LIST_LIMIT = 10;
const MAX_LIST_LIMIT = 15;
const MAX_OVERDUE_LIMIT = 20;

export type AdminPromptOpsPulse = {
  generatedAt: string;
  checkedOutAssets: number;
  overdueReturns: number;
  openRepairs: number;
  activeRequests: number;
};

export function clampPromptLimit(
  value: number | undefined,
  fallback = DEFAULT_LIST_LIMIT,
  max = MAX_LIST_LIMIT,
) {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(value)));
}

function isMacLike(value: string) {
  const hex = value.replace(/[^0-9A-Fa-f]/g, '');
  return hex.length >= 8 && hex.length <= 12;
}

export function summarizeInventory(stats: TechnicianDashboardStats) {
  const kinds = ['laptop', 'av', 'network'] as const;
  return kinds.map((kind) => {
    const row = stats[kind];
    return {
      kind: ASSET_KIND_LABEL[kind],
      inStore: row.store,
      deployed: row.deploy,
      total: row.total,
      registeredTotal: row.registeredTotal,
      byStatus: row.byStatus.map((status) => ({
        status: formatStatusLabel(status.statusId),
        count: status.count,
      })),
    };
  });
}

export function summarizeRequestStats(stats: TechnicianDashboardStats) {
  return {
    activeTotal: stats.totalRequest.total,
    byWorkflow: stats.totalRequest.byWorkflow.map((row) => ({
      status: DASHBOARD_REQUEST_WORKFLOW_LABEL[row.key],
      count: row.count,
    })),
    poolAvailableByKind: stats.totalRequest.poolByKind.map((row) => ({
      kind: ASSET_KIND_LABEL[row.kind],
      count: row.count,
    })),
    requestPoolTotal: stats.requestPoolCount,
  };
}

export function getAssetStatusReference() {
  return {
    note: 'These meanings apply to assets. Request workflow statuses are separate.',
    statuses: INVENTORY_STATUSES.map((status) => ({
      statusId: status.statusId,
      meaning: status.name,
    })),
  };
}

export async function loadCheckedOutCount() {
  const pool = getDbPool();
  const [rows] = await pool.query<(RowDataPacket & { cnt: number })[]>(
    `SELECT COUNT(*) AS cnt
     FROM request_assignment ra
     INNER JOIN request r ON r.request_id = ra.request_id
     WHERE ra.checkout_at IS NOT NULL
       AND ra.returned_at IS NULL
       AND ra.asset_id IS NOT NULL
       AND r.rejected_at IS NULL`,
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function countOverdueReturns() {
  const pool = getDbPool();
  const today = formatDate(new Date());
  const [rows] = await pool.query<(RowDataPacket & { cnt: number })[]>(
    `SELECT COUNT(DISTINCT r.request_id) AS cnt
     FROM request r
     INNER JOIN request_assignment ra ON ra.request_id = r.request_id
     WHERE r.rejected_at IS NULL
       AND r.return_date < ?
       AND ra.checkout_at IS NOT NULL
       AND ra.returned_at IS NULL
       AND ra.asset_id IS NOT NULL`,
    [today],
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function countOpenRepairs() {
  const pool = getDbPool();
  const [rows] = await pool.query<(RowDataPacket & { cnt: number })[]>(
    `SELECT COUNT(*) AS cnt FROM repair WHERE completed_date IS NULL`,
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function countActiveRequests() {
  const pool = getDbPool();
  const [rows] = await pool.query<(RowDataPacket & { cnt: number })[]>(
    `SELECT COUNT(*) AS cnt FROM request WHERE rejected_at IS NULL`,
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function buildAdminPromptOpsPulse(): Promise<AdminPromptOpsPulse> {
  const [checkedOutAssets, overdueReturns, openRepairs, activeRequests] = await Promise.all([
    loadCheckedOutCount(),
    countOverdueReturns(),
    countOpenRepairs(),
    countActiveRequests(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    checkedOutAssets,
    overdueReturns,
    openRepairs,
    activeRequests,
  };
}

export async function loadOverdueReturns(limit?: number) {
  const pool = getDbPool();
  const today = formatDate(new Date());
  const rowLimit = clampPromptLimit(limit, DEFAULT_LIST_LIMIT, MAX_OVERDUE_LIMIT);
  const [rows] = await pool.query<
    (RowDataPacket & {
      request_id: number;
      return_date: Date | string;
      requester_oid: string | null;
      requester_name: string;
      assets_out: number;
    })[]
  >(
    `SELECT r.request_id, r.return_date, u.oid AS requester_oid, COUNT(*) AS assets_out
     FROM request r
     INNER JOIN request_assignment ra ON ra.request_id = r.request_id
     INNER JOIN users u ON u.id = r.requested_by
     WHERE r.rejected_at IS NULL
       AND r.return_date < ?
       AND ra.checkout_at IS NOT NULL
       AND ra.returned_at IS NULL
       AND ra.asset_id IS NOT NULL
     GROUP BY r.request_id, r.return_date, u.oid
     ORDER BY r.return_date ASC
     LIMIT ?`,
    [today, rowLimit],
  );
  await attachDisplayNames(rows, 'requester_oid', 'requester_name');

  return rows.map((row) => ({
    requestId: row.request_id,
    requesterOid: row.requester_oid,
    requesterName: row.requester_name,
    returnDate: formatDate(row.return_date),
    assetsOut: Number(row.assets_out),
    daysOverdue: Math.max(
      0,
      Math.round(
        (new Date(today).getTime() - new Date(formatDate(row.return_date)).getTime()) /
          86_400_000,
      ),
    ),
  }));
}

function summarizeAssetLookup(detail: AssetDetailResponse) {
  const { asset } = detail;
  const location =
    asset.kind === 'laptop'
      ? [asset.recipientName, asset.recipientDivision, asset.placeHandler].filter(Boolean).join(' · ') ||
        null
      : [asset.building, asset.level, asset.zone].filter(Boolean).join(' · ') || null;

  return {
    assetId: asset.assetId,
    kind: ASSET_KIND_LABEL[asset.kind],
    serialNum: asset.serialNum,
    status: asset.statusName,
    brand: asset.brand,
    model: asset.model,
    locationOrHandover: location,
    macAddress: asset.kind === 'network' ? asset.macAddress : null,
  };
}

async function findAssetIdsBySerial(serial: string): Promise<{ kind: AssetKind; assetId: number }[]> {
  const pool = getDbPool();
  const pattern = `%${serial.trim()}%`;
  const [rows] = await pool.query<(RowDataPacket & { kind: AssetKind; asset_id: number })[]>(
    `SELECT 'laptop' AS kind, asset_id FROM laptop WHERE serial_num LIKE ? LIMIT 3
     UNION ALL
     SELECT 'av' AS kind, asset_id FROM av WHERE serial_num LIKE ? LIMIT 3
     UNION ALL
     SELECT 'network' AS kind, asset_id FROM network WHERE serial_num LIKE ? LIMIT 3`,
    [pattern, pattern, pattern],
  );
  return rows.map((row) => ({ kind: row.kind, assetId: Number(row.asset_id) }));
}

async function findAssetIdsByMac(mac: string): Promise<{ kind: AssetKind; assetId: number }[]> {
  const pool = getDbPool();
  const normalized = mac.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();
  if (normalized.length < 8) return [];

  const [rows] = await pool.query<(RowDataPacket & { kind: AssetKind; asset_id: number })[]>(
    `SELECT 'network' AS kind, asset_id
     FROM network
     WHERE REPLACE(REPLACE(REPLACE(LOWER(mac_address), ':', ''), '-', ''), '.', '') LIKE ?
     LIMIT 3`,
    [`%${normalized}%`],
  );
  return rows.map((row) => ({ kind: row.kind, assetId: Number(row.asset_id) }));
}

export async function lookupAssetsForPrompt(query: string, limit = DEFAULT_LIST_LIMIT) {
  const trimmed = query.trim();
  const cap = clampPromptLimit(limit);
  if (!trimmed) {
    return { query: trimmed, matches: [], notFound: true };
  }

  const { findAssetByAnyId, findAssetByCode } = await import('@backend/server/assets/assets-repo.server');
  const matches: ReturnType<typeof summarizeAssetLookup>[] = [];
  const seen = new Set<string>();

  const addDetail = (detail: AssetDetailResponse | null) => {
    if (!detail || matches.length >= cap) return;
    const key = `${detail.asset.kind}:${detail.asset.assetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(summarizeAssetLookup(detail));
  };

  addDetail(await findAssetByCode(trimmed));

  for (const assetId of extractAssetIdCandidates(trimmed)) {
    if (matches.length >= cap) break;
    addDetail(await findAssetByAnyId(assetId));
  }

  const serials = new Set<string>([trimmed, ...extractSerialCandidates(trimmed)]);
  for (const serial of serials) {
    if (matches.length >= cap) break;
    if (serial.length < 3) continue;
    const found = await findAssetIdsBySerial(serial);
    for (const match of found) {
      if (matches.length >= cap) break;
      addDetail(await findAssetByAnyId(match.assetId));
    }
  }

  const macQueries = new Set<string>([...extractMacCandidates(trimmed), ...extractMacCandidates(`mac ${trimmed}`)]);
  if (isMacLike(trimmed)) macQueries.add(trimmed);
  for (const mac of macQueries) {
    if (matches.length >= cap) break;
    const found = await findAssetIdsByMac(mac);
    for (const match of found) {
      if (matches.length >= cap) break;
      addDetail(await findAssetByAnyId(match.assetId));
    }
  }

  return {
    query: trimmed,
    matches,
    notFound: matches.length === 0,
  };
}

export async function summarizeRequestForPrompt(requestId: number) {
  const pool = getDbPool();
  const [headers] = await pool.query<
    (RowDataPacket & {
      request_id: number;
      requester_oid: string | null;
      requester_name: string;
      borrow_date: Date | string;
      return_date: Date | string;
      program_type: string;
      usage_location: string;
      remarks: string | null;
      created_at: Date | string;
      rejected_at: Date | string | null;
    })[]
  >(
    `SELECT r.request_id, u.oid AS requester_oid, r.borrow_date, r.return_date,
            r.program_type, r.usage_location, r.remarks, r.created_at, r.rejected_at
     FROM request r
     INNER JOIN users u ON u.id = r.requested_by
     WHERE r.request_id = ?`,
    [requestId],
  );
  const header = headers[0];
  if (!header) return null;

  await attachDisplayNames([header], 'requester_oid', 'requester_name');

  const [items] = await pool.query<(RowDataPacket & { asset_type: string; quantity: number })[]>(
    `SELECT asset_type, quantity FROM request_item WHERE request_id = ?`,
    [requestId],
  );

  const [assignments] = await pool.query<
    (RowDataPacket & {
      asset_id: number | null;
      asset_type: string | null;
      assigned_at: Date | string | null;
      checkout_at: Date | string | null;
      returned_at: Date | string | null;
      return_condition: string | null;
      brand: string | null;
      model: string | null;
      kind: AssetKind | null;
    })[]
  >(
    `SELECT ra.asset_id, ri.asset_type, ra.assigned_at, ra.checkout_at, ra.returned_at,
            ra.return_condition,
            COALESCE(l.brand, av.brand, n.brand) AS brand,
            COALESCE(l.model, av.model, n.model) AS model,
            CASE
              WHEN l.asset_id IS NOT NULL THEN 'laptop'
              WHEN av.asset_id IS NOT NULL THEN 'av'
              WHEN n.asset_id IS NOT NULL THEN 'network'
              ELSE NULL
            END AS kind
     FROM request_assignment ra
     LEFT JOIN request_item ri ON ri.request_item_id = ra.request_item_id
     LEFT JOIN laptop l ON l.asset_id = ra.asset_id
     LEFT JOIN av ON av.asset_id = ra.asset_id
     LEFT JOIN network n ON n.asset_id = ra.asset_id
     WHERE ra.request_id = ?
     ORDER BY ra.assignment_id`,
    [requestId],
  );

  const today = formatDate(new Date());
  const returnDate = formatDate(header.return_date);
  let workflowStatus = 'preparing';
  if (header.rejected_at) {
    workflowStatus = 'rejected';
  } else if (assignments.some((row) => row.returned_at)) {
    workflowStatus = assignments.every((row) => row.returned_at || !row.asset_id)
      ? 'completed'
      : 'in_use';
  } else if (assignments.some((row) => row.checkout_at)) {
    workflowStatus = returnDate < today ? 'due_return' : 'in_use';
  } else if (assignments.some((row) => row.assigned_at)) {
    workflowStatus = 'checkout';
  }

  return {
    requestId: header.request_id,
    requesterOid: header.requester_oid,
    requesterName: header.requester_name,
    programType: header.program_type,
    usageLocation: header.usage_location,
    borrowDate: formatDate(header.borrow_date),
    returnDate,
    remarks: header.remarks,
    createdAt: formatDate(header.created_at),
    workflowStatus,
    items: items.map((row) => ({
      assetType: row.asset_type,
      quantity: Number(row.quantity),
    })),
    assignments: assignments.map((row) => ({
      assetId: row.asset_id,
      kind: row.kind ? ASSET_KIND_LABEL[row.kind] : row.asset_type,
      brand: row.brand,
      model: row.model,
      bookedAt: row.assigned_at ? formatDate(row.assigned_at) : null,
      checkoutAt: row.checkout_at ? formatDate(row.checkout_at) : null,
      returnedAt: row.returned_at ? formatDate(row.returned_at) : null,
      returnCondition: row.return_condition,
    })),
  };
}

export async function lookupRequestForPrompt(requestIdInput: number | string) {
  const requestId =
    typeof requestIdInput === 'number'
      ? requestIdInput
      : Number(String(requestIdInput).replace(/\D/g, ''));
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return { requestId: requestIdInput, found: false as const, request: null };
  }

  const request = await summarizeRequestForPrompt(requestId);
  return {
    requestId,
    found: Boolean(request),
    request,
  };
}

export async function loadOpenRepairs(options?: {
  limit?: number;
  assetKind?: string;
  assetId?: number;
}) {
  const pool = getDbPool();
  const rowLimit = clampPromptLimit(options?.limit);
  const kind = options?.assetKind ? parseAssetKindParam(options.assetKind) : null;
  const assetId =
    options?.assetId != null && Number.isInteger(options.assetId) && options.assetId > 0
      ? options.assetId
      : null;

  const filters = ['r.completed_date IS NULL'];
  const params: Array<string | number> = [];
  if (kind) {
    filters.push('r.asset_type = ?');
    params.push(kind);
  }
  if (assetId != null) {
    filters.push('r.asset_id = ?');
    params.push(assetId);
  }
  params.push(rowLimit);

  const [rows] = await pool.query<
    (RowDataPacket & {
      asset_id: number;
      asset_type: AssetKind;
      repair_date: Date | string;
      issue_summary: string;
      brand: string | null;
      model: string | null;
    })[]
  >(
    `SELECT r.asset_id, r.asset_type, r.repair_date, r.issue_summary,
            COALESCE(l.brand, av.brand, n.brand) AS brand,
            COALESCE(l.model, av.model, n.model) AS model
     FROM repair r
     LEFT JOIN laptop l ON l.asset_id = r.asset_id AND r.asset_type = 'laptop'
     LEFT JOIN av ON av.asset_id = r.asset_id AND r.asset_type = 'av'
     LEFT JOIN network n ON n.asset_id = r.asset_id AND r.asset_type = 'network'
     WHERE ${filters.join(' AND ')}
     ORDER BY r.repair_date ASC
     LIMIT ?`,
    params,
  );

  return rows.map((row) => ({
    assetId: row.asset_id,
    kind: ASSET_KIND_LABEL[row.asset_type],
    brand: row.brand,
    model: row.model,
    repairDate: formatDate(row.repair_date),
    issueSummary: row.issue_summary,
  }));
}

export async function loadExpiringWarranties(options?: { withinDays?: number; limit?: number }) {
  const pool = getDbPool();
  const withinDays = clampPromptLimit(options?.withinDays, 90, 365);
  const rowLimit = clampPromptLimit(options?.limit);
  const today = formatDate(new Date());
  const horizon = formatDate(new Date(Date.now() + withinDays * 86_400_000));
  const [rows] = await pool.query<
    (RowDataPacket & {
      asset_id: number;
      asset_type: AssetKind;
      warranty_end_date: Date | string;
      brand: string | null;
      model: string | null;
    })[]
  >(
    `SELECT w.asset_id, w.asset_type, w.warranty_end_date,
            COALESCE(l.brand, av.brand, n.brand) AS brand,
            COALESCE(l.model, av.model, n.model) AS model
     FROM warranty w
     LEFT JOIN laptop l ON l.asset_id = w.asset_id AND w.asset_type = 'laptop'
     LEFT JOIN av ON av.asset_id = w.asset_id AND w.asset_type = 'av'
     LEFT JOIN network n ON n.asset_id = w.asset_id AND w.asset_type = 'network'
     WHERE w.warranty_end_date >= ? AND w.warranty_end_date <= ?
     ORDER BY w.warranty_end_date ASC
     LIMIT ?`,
    [today, horizon, rowLimit],
  );

  return rows.map((row) => ({
    assetId: row.asset_id,
    kind: ASSET_KIND_LABEL[row.asset_type],
    brand: row.brand,
    model: row.model,
    warrantyEnds: formatDate(row.warranty_end_date),
  }));
}
