import type { RowDataPacket } from 'mysql2';
import {
  assetIdNewestYearFirstSql,
  compareAssetIdNewestYearFirst,
} from '@/hooks/assetid-generator';
import type { AssetKind, AssetTrailEvent } from '@shared/lib/inventory-schema';
import { ASSET_KIND_LABEL, formatStatusLabel } from '@shared/lib/inventory-schema';
import { STATUS_ID } from '@shared/lib/asset-status-actions';
import { formatIsoToDdMmYy } from '@shared/lib/date-format';
import {
  REQUEST_STATUS_ACTIVE,
  REQUEST_STATUS_BOOKED,
  REQUEST_STATUS_CHECKOUT,
} from '@shared/lib/request-schema';
import type {
  TechnicianAssetExportKind,
  TechnicianReportPdfFilters,
} from '@shared/lib/technician-export-schema';
import { REPORT_PDF_COLUMNS } from '@shared/lib/technician-export-schema';
import { getAssetTrailEvents } from '@backend/server/assets/assets-repo.server';
import { attachDisplayNames } from '@backend/server/core/azure-directory.server';
import { escapeCsvCell } from '@backend/server/admin/csv-cell';
import { getDbPool } from '@backend/server/core/db';

export type TechnicianExportResult = {
  filename: string;
  contentType: string;
  body: string;
};

const REQUEST_STATUS_IDS = [
  REQUEST_STATUS_ACTIVE,
  REQUEST_STATUS_BOOKED,
  REQUEST_STATUS_CHECKOUT,
] as const;

const HISTORY_STATUS_IDS = new Set<number>([
  STATUS_ID.NEW,
  STATUS_ID.RETURN,
  STATUS_ID.PRE_DISPOSED,
  STATUS_ID.DISPOSED,
]);

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\r\n');
}

export async function exportTechnicianAssetCsv(
  kind: TechnicianAssetExportKind,
): Promise<TechnicianExportResult> {
  const pool = getDbPool();
  const stamp = new Date().toISOString().slice(0, 10);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${kind}\` ORDER BY ${assetIdNewestYearFirstSql()}`,
  );

  if (rows.length === 0) {
    return {
      filename: `nims-${kind}-${stamp}.csv`,
      contentType: 'text/csv;charset=utf-8',
      body: '',
    };
  }

  const headers = Object.keys(rows[0]);
  return {
    filename: `nims-${kind}-${stamp}.csv`,
    contentType: 'text/csv;charset=utf-8',
    body: toCsv(
      headers,
      rows.map((r) => headers.map((h) => r[h])),
    ),
  };
}

export type AssetReportRow = {
  kind: AssetKind;
  assetId: number;
  brand: string | null;
  model: string | null;
  category: string | null;
  serialNum: string | null;
  statusId: number;
  createdAt: string | null;
  handledBy: string | null;
  handoverTo: string | null;
  location: string | null;
  history: string | null;
  request: string | null;
};

function trailAt(val: Date | string | null | undefined): string | null {
  if (val == null) return null;
  return val instanceof Date ? val.toISOString() : String(val);
}

function formatTrailDate(at: string): string {
  const iso = at.slice(0, 10);
  return formatIsoToDdMmYy(iso) ?? iso;
}

function formatHistorySummary(trails: AssetTrailEvent[]): string {
  if (!trails.length) return '—';
  return trails
    .map((event) => {
      const date = event.at ? formatTrailDate(event.at) : '';
      const detail = event.detail ? ` — ${event.detail}` : '';
      return `${date} ${event.title}${detail}`.trim();
    })
    .join('; ');
}

function requestFilterSql(
  kind: AssetKind,
  requestFilter: TechnicianReportPdfFilters['requestFilter'],
  alias: string,
): { clause: string; params: unknown[] } {
  if (requestFilter === 'all') return { clause: '', params: [] };

  const openAssignment = `EXISTS (
    SELECT 1 FROM request_assignment ra
    WHERE ra.asset_id = ${alias}.asset_id AND ra.returned_at IS NULL
  )`;

  if (requestFilter === 'request-only') {
    return {
      clause: ` AND (${alias}.status_id IN (?, ?, ?) OR ${openAssignment})`,
      params: [...REQUEST_STATUS_IDS],
    };
  }

  return {
    clause: ` AND ${alias}.status_id NOT IN (?, ?, ?) AND NOT ${openAssignment}`,
    params: [...REQUEST_STATUS_IDS],
  };
}

type BaseReportQueryRow = RowDataPacket & {
  asset_id: number;
  brand: string | null;
  model: string | null;
  category?: string | null;
  serial_num: string | null;
  status_id: number;
  created_at?: Date | string | null;
};

function mapBaseRow(kind: AssetKind, row: BaseReportQueryRow): AssetReportRow {
  return {
    kind,
    assetId: row.asset_id,
    brand: row.brand,
    model: row.model,
    category: row.category ?? null,
    serialNum: row.serial_num,
    statusId: row.status_id,
    createdAt: trailAt(row.created_at),
    handledBy: null,
    handoverTo: null,
    location: null,
    history: null,
    request: null,
  };
}

async function fetchLaptopReportRows(
  filters: TechnicianReportPdfFilters,
): Promise<AssetReportRow[]> {
  const pool = getDbPool();
  const params: unknown[] = [];
  let sql = `
    SELECT asset_id, brand, model, category, serial_num, status_id, created_at
    FROM laptop l
    WHERE 1=1`;

  if (filters.statusIds.length > 0) {
    sql += ` AND l.status_id IN (${filters.statusIds.map(() => '?').join(', ')})`;
    params.push(...filters.statusIds);
  }

  const requestClause = requestFilterSql('laptop', filters.requestFilter, 'l');
  sql += requestClause.clause;
  params.push(...requestClause.params);
  sql += ` ORDER BY ${assetIdNewestYearFirstSql('l.asset_id')}`;

  const [rows] = await pool.query<BaseReportQueryRow[]>(sql, params);
  return rows.map((row) => mapBaseRow('laptop', row));
}

async function fetchAvReportRows(filters: TechnicianReportPdfFilters): Promise<AssetReportRow[]> {
  const pool = getDbPool();
  const params: unknown[] = [];
  let sql = `
    SELECT asset_id, brand, model, category, serial_num, status_id, created_at
    FROM av a
    WHERE 1=1`;

  if (filters.statusIds.length > 0) {
    sql += ` AND a.status_id IN (${filters.statusIds.map(() => '?').join(', ')})`;
    params.push(...filters.statusIds);
  }

  const requestClause = requestFilterSql('av', filters.requestFilter, 'a');
  sql += requestClause.clause;
  params.push(...requestClause.params);
  sql += ` ORDER BY ${assetIdNewestYearFirstSql('a.asset_id')}`;

  const [rows] = await pool.query<BaseReportQueryRow[]>(sql, params);
  return rows.map((row) => mapBaseRow('av', row));
}

async function fetchNetworkReportRows(
  filters: TechnicianReportPdfFilters,
): Promise<AssetReportRow[]> {
  const pool = getDbPool();
  const params: unknown[] = [];
  let sql = `
    SELECT asset_id, brand, model, serial_num, status_id, created_at
    FROM network n
    WHERE 1=1`;

  if (filters.statusIds.length > 0) {
    sql += ` AND n.status_id IN (${filters.statusIds.map(() => '?').join(', ')})`;
    params.push(...filters.statusIds);
  }

  const requestClause = requestFilterSql('network', filters.requestFilter, 'n');
  sql += requestClause.clause;
  params.push(...requestClause.params);
  sql += ` ORDER BY ${assetIdNewestYearFirstSql('n.asset_id')}`;

  const [rows] = await pool.query<BaseReportQueryRow[]>(sql, params);
  return rows.map((row) => mapBaseRow('network', row));
}

type DeployContext = {
  handledBy: string | null;
  handoverTo: string | null;
  location: string | null;
};

async function fetchLaptopDeployContext(assetIds: number[]): Promise<Map<number, DeployContext>> {
  const map = new Map<number, DeployContext>();
  if (!assetIds.length) return map;

  const pool = getDbPool();
  const placeholders = assetIds.map(() => '?').join(', ');
  const [rows] = await pool.query<
    (RowDataPacket & {
      asset_id: number;
      handler_oid: string | null;
      handler_name: string;
      recipient_name: string | null;
    })[]
  >(
    `SELECT h.asset_id, tech.oid AS handler_oid, s.full_name AS recipient_name
     FROM handover h
     INNER JOIN (
       SELECT h2.asset_id, MAX(h2.handover_id) AS handover_id
       FROM handover h2
       LEFT JOIN handover_staff hs2 ON hs2.handover_id = h2.handover_id
       LEFT JOIN handover_return hr_staff ON hr_staff.handover_staff_id = hs2.handover_staff_id
       LEFT JOIN handover_return hr_place ON hr_place.handover_id = h2.handover_id AND hs2.handover_staff_id IS NULL
       WHERE h2.asset_id IN (${placeholders})
         AND (
           (hs2.handover_staff_id IS NOT NULL AND hr_staff.return_id IS NULL)
           OR (hs2.handover_staff_id IS NULL AND hr_place.return_id IS NULL)
         )
       GROUP BY h2.asset_id
     ) open_h ON open_h.handover_id = h.handover_id
     INNER JOIN users tech ON tech.id = h.user_id
     LEFT JOIN handover_staff hs ON hs.handover_id = h.handover_id
     LEFT JOIN staff s ON s.employee_no = hs.employee_no`,
    assetIds,
  );

  await attachDisplayNames(rows, 'handler_oid', 'handler_name');

  for (const row of rows) {
    map.set(row.asset_id, {
      handledBy: row.handler_name?.trim() || null,
      handoverTo: row.recipient_name?.trim() || 'Place / room',
      location: null,
    });
  }

  return map;
}

async function fetchPlaceDeployContext(
  kind: 'av' | 'network',
  assetIds: number[],
): Promise<Map<number, DeployContext>> {
  const map = new Map<number, DeployContext>();
  if (!assetIds.length) return map;

  const pool = getDbPool();
  const placeholders = assetIds.map(() => '?').join(', ');

  const [rows] = await pool.query<
    (RowDataPacket & {
      asset_id: number;
      handler_oid: string | null;
      handler_name: string;
      building: string;
      level: string;
      zone: string;
    })[]
  >(
    `SELECT d.asset_id, u.oid AS handler_oid, d.building, d.level, d.zone
     FROM it_deploy d
     INNER JOIN (
       SELECT d2.asset_id, MAX(d2.deployment_id) AS deployment_id
       FROM it_deploy d2
       WHERE d2.asset_type = ?
         AND d2.asset_id IN (${placeholders})
         AND NOT EXISTS (
           SELECT 1 FROM it_return r WHERE r.deployment_id = d2.deployment_id
         )
       GROUP BY d2.asset_id
     ) open_d ON open_d.deployment_id = d.deployment_id
     INNER JOIN users u ON u.id = d.user_id
     WHERE d.asset_type = ?`,
    [kind, ...assetIds, kind],
  );

  await attachDisplayNames(rows, 'handler_oid', 'handler_name');

  for (const row of rows) {
    const location = [row.building, row.level, row.zone].filter(Boolean).join(' · ');
    map.set(row.asset_id, {
      handledBy: row.handler_name?.trim() || null,
      handoverTo: location || 'Deployed location',
      location: location || null,
    });
  }

  return map;
}

async function fetchOpenRequestContext(
  assetIds: number[],
): Promise<Map<number, { request: string; requester: string | null; bookedBy: string | null }>> {
  const map = new Map<number, { request: string; requester: string | null; bookedBy: string | null }>();
  if (!assetIds.length) return map;

  const pool = getDbPool();
  const placeholders = assetIds.map(() => '?').join(', ');
  const [rows] = await pool.query<
    (RowDataPacket & {
      asset_id: number;
      request_id: number;
      requester_oid: string | null;
      requester_name: string;
      booked_oid: string | null;
      booked_by: string | null;
    })[]
  >(
    `SELECT ra.asset_id, ra.request_id, u.oid AS requester_oid, ub.oid AS booked_oid
     FROM request_assignment ra
     INNER JOIN request r ON r.request_id = ra.request_id AND r.rejected_at IS NULL
     INNER JOIN users u ON u.id = r.requested_by
     LEFT JOIN users ub ON ub.id = ra.assigned_by
     WHERE ra.asset_id IN (${placeholders}) AND ra.returned_at IS NULL`,
    assetIds,
  );

  await attachDisplayNames(rows, 'requester_oid', 'requester_name');
  await attachDisplayNames(rows, 'booked_oid', 'booked_by');

  for (const row of rows) {
    map.set(row.asset_id, {
      request: `#${row.request_id}`,
      requester: row.requester_name?.trim() || null,
      bookedBy: row.booked_by?.trim() || null,
    });
  }

  return map;
}

async function enrichHistory(rows: AssetReportRow[]): Promise<void> {
  const chunkSize = 12;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (row) => {
        const trails = await getAssetTrailEvents(row.kind, row.assetId, row.createdAt);
        row.history = formatHistorySummary(trails);
      }),
    );
  }
}

async function enrichReportRows(
  rows: AssetReportRow[],
  filters: TechnicianReportPdfFilters,
): Promise<void> {
  const wantsDeployFields = filters.columns.some((c) =>
    ['handledBy', 'handoverTo', 'location'].includes(c),
  );
  const wantsHistory = filters.columns.includes('history');
  const wantsRequest = filters.columns.includes('request');

  if (wantsDeployFields) {
    const laptopDeployIds = rows
      .filter((r) => r.kind === 'laptop' && r.statusId === STATUS_ID.DEPLOY)
      .map((r) => r.assetId);
    const avDeployIds = rows
      .filter((r) => r.kind === 'av' && r.statusId === STATUS_ID.DEPLOY)
      .map((r) => r.assetId);
    const networkDeployIds = rows
      .filter((r) => r.kind === 'network' && r.statusId === STATUS_ID.DEPLOY)
      .map((r) => r.assetId);

    const [laptopCtx, avCtx, networkCtx] = await Promise.all([
      fetchLaptopDeployContext(laptopDeployIds),
      fetchPlaceDeployContext('av', avDeployIds),
      fetchPlaceDeployContext('network', networkDeployIds),
    ]);

    for (const row of rows) {
      if (row.statusId !== STATUS_ID.DEPLOY) continue;
      const ctx =
        row.kind === 'laptop'
          ? laptopCtx.get(row.assetId)
          : row.kind === 'av'
            ? avCtx.get(row.assetId)
            : networkCtx.get(row.assetId);
      if (!ctx) continue;
      row.handledBy = ctx.handledBy;
      row.handoverTo = ctx.handoverTo;
      row.location = ctx.location;
    }
  }

  if (wantsHistory) {
    const historyRows = rows.filter((r) => HISTORY_STATUS_IDS.has(r.statusId));
    await enrichHistory(historyRows);
  }

  if (wantsRequest) {
    const requestAssetIds = rows
      .filter(
        (r) =>
          (r.kind === 'laptop' || r.kind === 'av') &&
          REQUEST_STATUS_IDS.includes(r.statusId as (typeof REQUEST_STATUS_IDS)[number]),
      )
      .map((r) => r.assetId);

    const requestCtx = await fetchOpenRequestContext(requestAssetIds);
    for (const row of rows) {
      const ctx = requestCtx.get(row.assetId);
      if (!ctx) continue;
      row.request = ctx.requester ? `${ctx.request} · ${ctx.requester}` : ctx.request;
      if (!row.handledBy && ctx.bookedBy) {
        row.handledBy = ctx.bookedBy;
      }
      if (!row.handoverTo && ctx.requester) {
        row.handoverTo = ctx.requester;
      }
    }
  }
}

export async function fetchFilteredAssetReportRows(
  filters: TechnicianReportPdfFilters,
): Promise<AssetReportRow[]> {
  const rows: AssetReportRow[] = [];
  if (filters.kinds.includes('laptop')) {
    rows.push(...(await fetchLaptopReportRows(filters)));
  }
  if (filters.kinds.includes('av')) {
    rows.push(...(await fetchAvReportRows(filters)));
  }
  if (filters.kinds.includes('network')) {
    rows.push(...(await fetchNetworkReportRows(filters)));
  }

  const sorted = rows.sort((a, b) => {
    const kindOrder = { laptop: 0, av: 1, network: 2 } as const;
    if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
    return compareAssetIdNewestYearFirst(a.assetId, b.assetId);
  });

  await enrichReportRows(sorted, filters);
  return sorted;
}

export function describeReportFilters(filters: TechnicianReportPdfFilters): string {
  const kinds =
    filters.kinds.length === 3
      ? 'All asset types'
      : filters.kinds.map((k) => ASSET_KIND_LABEL[k]).join(', ');
  const statuses =
    filters.statusIds.length === 0
      ? 'All statuses'
      : filters.statusIds.map((id) => formatStatusLabel(id)).join(', ');
  const requestLabel =
    filters.requestFilter === 'all'
      ? 'All assets'
      : filters.requestFilter === 'request-only'
        ? 'Request-related only'
        : 'Non-request only';
  const columnLabels = filters.columns
    .map((key) => REPORT_PDF_COLUMNS.find((c) => c.key === key)?.label ?? key)
    .join(', ');
  return `Types: ${kinds} | Status: ${statuses} | Request: ${requestLabel} | Columns: ${columnLabels}`;
}
