import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { AssetId, AssetKind } from '@shared/lib/inventory-schema';
import type {
  CreatePmLogInput,
  CreatePmLogResult,
  PmAssetCondition,
  PmLocationTree,
  PmLogAsset,
  PmLogListFilters,
  PmLogListRow,
  PmLogStatus,
  PmPlaceAsset,
  PmStats,
  UpdatePmLogAssetsInput,
} from '@shared/lib/pm-schema';
import { derivePmLogStatus, pmAssetKey } from '@shared/lib/pm-schema';
import { sqlDateToIso as toIsoDate } from '@shared/lib/date-format';
import { getDbPool } from '@backend/server/core/db';

function monthBounds(now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

function placeKey(building: string, level: string) {
  return `${building}\0${level}`;
}

function assetLabelOf(brand: string | null, model: string | null, assetId: AssetId): string {
  return [brand, model].filter(Boolean).join(' ') || `Asset #${assetId}`;
}

type PlaceRow = RowDataPacket & {
  asset_type: AssetKind;
  asset_id: AssetId;
  category: string | null;
  brand: string | null;
  model: string | null;
  serial_num: string | null;
  building: string;
  level: string;
  zone: string;
};

async function listOpenPlaceAssets(): Promise<PlaceRow[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<PlaceRow[]>(
    `SELECT 'av' AS asset_type, a.asset_id, a.category, a.brand, a.model, a.serial_num,
            d.building, d.level, d.zone
     FROM av_deployment d
     INNER JOIN (
       SELECT d2.asset_id, MAX(d2.deployment_id) AS deployment_id
       FROM av_deployment d2
       WHERE NOT EXISTS (
         SELECT 1 FROM av_return r WHERE r.deployment_id = d2.deployment_id
       )
       GROUP BY d2.asset_id
     ) open_d ON open_d.deployment_id = d.deployment_id
     INNER JOIN av a ON a.asset_id = d.asset_id
     WHERE TRIM(d.building) <> '' AND TRIM(d.level) <> '' AND TRIM(d.zone) <> ''

     UNION ALL

     SELECT 'network' AS asset_type, a.asset_id, a.category, a.brand, a.model, a.serial_num,
            d.building, d.level, d.zone
     FROM network_deployment d
     INNER JOIN (
       SELECT d2.asset_id, MAX(d2.deployment_id) AS deployment_id
       FROM network_deployment d2
       WHERE NOT EXISTS (
         SELECT 1 FROM network_return r WHERE r.deployment_id = d2.deployment_id
       )
       GROUP BY d2.asset_id
     ) open_d ON open_d.deployment_id = d.deployment_id
     INNER JOIN network a ON a.asset_id = d.asset_id
     WHERE TRIM(d.building) <> '' AND TRIM(d.level) <> '' AND TRIM(d.zone) <> ''

     UNION ALL

     SELECT 'laptop' AS asset_type, a.asset_id, a.category, a.brand, a.model, a.serial_num,
            h.building, h.level, h.zone
     FROM handover h
     LEFT JOIN handover_staff hs ON hs.handover_id = h.handover_id
     LEFT JOIN handover_return hr ON hr.handover_id = h.handover_id
     INNER JOIN (
       SELECT h2.asset_id, MAX(h2.handover_id) AS handover_id
       FROM handover h2
       LEFT JOIN handover_staff hs2 ON hs2.handover_id = h2.handover_id
       LEFT JOIN handover_return hr2 ON hr2.handover_id = h2.handover_id
       WHERE hs2.handover_staff_id IS NULL AND hr2.return_id IS NULL
       GROUP BY h2.asset_id
     ) open_p ON open_p.handover_id = h.handover_id AND open_p.asset_id = h.asset_id
     INNER JOIN laptop a ON a.asset_id = h.asset_id
     WHERE hs.handover_staff_id IS NULL AND hr.return_id IS NULL
       AND h.building IS NOT NULL AND TRIM(h.building) <> ''
       AND h.level IS NOT NULL AND TRIM(h.level) <> ''
       AND h.zone IS NOT NULL AND TRIM(h.zone) <> ''`,
  );
  return rows;
}

export async function getPmLocationTree(): Promise<PmLocationTree> {
  const rows = await listOpenPlaceAssets();
  const buildingSet = new Set<string>();
  const levelsByBuilding: Record<string, Set<string>> = {};
  const zonesByBuildingLevel: Record<string, Set<string>> = {};

  for (const row of rows) {
    const building = row.building.trim();
    const level = row.level.trim();
    const zone = row.zone.trim();
    buildingSet.add(building);
    if (!levelsByBuilding[building]) levelsByBuilding[building] = new Set();
    levelsByBuilding[building].add(level);
    const zk = placeKey(building, level);
    if (!zonesByBuildingLevel[zk]) zonesByBuildingLevel[zk] = new Set();
    zonesByBuildingLevel[zk].add(zone);
  }

  const buildings = [...buildingSet].sort((a, b) => a.localeCompare(b));
  return {
    buildings,
    levelsByBuilding: Object.fromEntries(
      Object.entries(levelsByBuilding).map(([b, set]) => [
        b,
        [...set].sort((a, b) => a.localeCompare(b)),
      ]),
    ),
    zonesByBuildingLevel: Object.fromEntries(
      Object.entries(zonesByBuildingLevel).map(([k, set]) => [
        k.replace('\0', '||'),
        [...set].sort((a, b) => a.localeCompare(b)),
      ]),
    ),
  };
}

type OpenFaultRow = RowDataPacket & {
  asset_type: AssetKind;
  asset_id: AssetId;
  remarks: string | null;
  pm_date: Date | string;
};

async function openFaultsByAsset(): Promise<Map<string, { date: string; remarks: string | null }>> {
  const pool = getDbPool();
  const [rows] = await pool.query<OpenFaultRow[]>(
    `SELECT a.asset_type, a.asset_id, a.remarks, l.pm_date
     FROM pm_log_asset a
     INNER JOIN pm_log l ON l.pm_log_id = a.pm_log_id
     WHERE a.follow_up_required = 1 AND a.resolved_at IS NULL
     ORDER BY l.pm_date ASC, a.pm_log_asset_id ASC`,
  );

  const map = new Map<string, { date: string; remarks: string | null }>();
  for (const row of rows) {
    map.set(pmAssetKey(row.asset_type, row.asset_id), {
      date: toIsoDate(row.pm_date),
      remarks: row.remarks,
    });
  }
  return map;
}

export async function listPmAssetsAtPlace(input: {
  building: string;
  level: string;
  zone: string;
}): Promise<PmPlaceAsset[]> {
  const building = input.building.trim();
  const level = input.level.trim();
  const zone = input.zone.trim();
  if (!building || !level || !zone) return [];

  const [rows, openFaults] = await Promise.all([listOpenPlaceAssets(), openFaultsByAsset()]);

  return rows
    .filter(
      (r) =>
        r.building.trim() === building && r.level.trim() === level && r.zone.trim() === zone,
    )
    .map((r) => {
      const fault = openFaults.get(pmAssetKey(r.asset_type, r.asset_id));
      return {
        kind: r.asset_type,
        assetId: r.asset_id,
        category: r.category?.trim() || null,
        brand: r.brand,
        model: r.model,
        serialNum: r.serial_num,
        building: r.building,
        level: r.level,
        zone: r.zone,
        pendingFollowUp: fault != null,
        lastFaultDate: fault?.date ?? null,
        lastFaultRemarks: fault?.remarks ?? null,
      };
    });
}

export async function createPmLog(input: CreatePmLogInput): Promise<CreatePmLogResult> {
  const building = input.building.trim();
  const level = input.level.trim();
  const zone = input.zone.trim();
  if (!building || !level || !zone) throw new Error('Building, level and room are required.');

  const pmDate = input.pmDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pmDate)) throw new Error('Maintenance date is required.');

  const performedBy = Number(input.performedBy);
  if (!Number.isFinite(performedBy) || performedBy <= 0) {
    throw new Error('Your technician session could not be verified. Sign out and sign in again.');
  }

  const expected = await listPmAssetsAtPlace({ building, level, zone });
  if (expected.length === 0) throw new Error('No assets are currently placed in this room.');

  const expectedByKey = new Map(expected.map((a) => [pmAssetKey(a.kind, a.assetId), a]));
  const provided = new Map<string, { condition: PmAssetCondition; remarks: string | null }>();

  for (const item of input.assets) {
    if (item.condition !== 'good' && item.condition !== 'faulty') {
      throw new Error('Invalid asset condition.');
    }
    const key = pmAssetKey(item.assetType, item.assetId);
    if (!expectedByKey.has(key)) {
      throw new Error('One of the submitted assets is no longer placed in this room.');
    }
    const remarks = item.remarks?.trim() || null;
    if (item.condition === 'faulty' && !remarks) {
      throw new Error('Add remarks for every asset that is not in good condition.');
    }
    provided.set(key, { condition: item.condition, remarks });
  }

  if (provided.size !== expectedByKey.size) {
    throw new Error('Confirm every asset in this room before saving.');
  }

  const status = derivePmLogStatus([...provided.values()].map((v) => v.condition));
  const faultyCount = [...provided.values()].filter((v) => v.condition === 'faulty').length;

  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [logResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO pm_log (building, level, zone, performed_by, pm_date, status, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [building, level, zone, performedBy, pmDate, status, input.remarks?.trim() || null],
    );
    const pmLogId = logResult.insertId;
    let clearedCount = 0;

    for (const [key, value] of provided) {
      const asset = expectedByKey.get(key)!;
      await conn.execute(
        `INSERT INTO pm_log_asset
          (pm_log_id, asset_type, asset_id, asset_category, asset_label, serial_num,
           \`condition\`, remarks, follow_up_required)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pmLogId,
          asset.kind,
          asset.assetId,
          asset.category,
          assetLabelOf(asset.brand, asset.model, asset.assetId),
          asset.serialNum,
          value.condition,
          value.remarks,
          value.condition === 'faulty' ? 1 : 0,
        ],
      );

      if (value.condition === 'good') {
        const [cleared] = await conn.execute<ResultSetHeader>(
          `UPDATE pm_log_asset
           SET resolved_at = CURRENT_TIMESTAMP, resolved_pm_log_id = ?
           WHERE asset_type = ? AND asset_id = ? AND follow_up_required = 1 AND resolved_at IS NULL`,
          [pmLogId, asset.kind, asset.assetId],
        );
        clearedCount += cleared.affectedRows;
      }
    }

    await conn.commit();
    return { pmLogId, status, assetsTotal: provided.size, faultyCount, clearedCount };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function updatePmLogAssets(input: UpdatePmLogAssetsInput): Promise<CreatePmLogResult> {
  const pmLogId = Number(input.pmLogId);
  if (!Number.isFinite(pmLogId) || pmLogId <= 0) throw new Error('Maintenance visit is required.');
  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    throw new Error('Confirm every asset in this visit before saving.');
  }

  const pool = getDbPool();
  const [existing] = await pool.query<LogAssetRow[]>(
    `SELECT pm_log_asset_id, pm_log_id, asset_type, asset_id, asset_category, asset_label,
            serial_num, \`condition\`, remarks, follow_up_required, resolved_at
     FROM pm_log_asset
     WHERE pm_log_id = ?
     ORDER BY pm_log_asset_id ASC`,
    [pmLogId],
  );
  if (existing.length === 0) throw new Error('This maintenance visit could not be found.');

  const byId = new Map(existing.map((row) => [row.pm_log_asset_id, row]));
  const provided = new Map<number, { condition: PmAssetCondition; remarks: string | null }>();

  for (const item of input.assets) {
    if (item.condition !== 'good' && item.condition !== 'faulty') {
      throw new Error('Invalid asset condition.');
    }
    const id = Number(item.pmLogAssetId);
    if (!byId.has(id)) throw new Error('One of the assets is not part of this visit.');
    const remarks = item.remarks?.trim() || null;
    if (item.condition === 'faulty' && !remarks) {
      throw new Error('Add remarks for every asset that is not in good condition.');
    }
    provided.set(id, { condition: item.condition, remarks });
  }

  if (provided.size !== byId.size) {
    throw new Error('Confirm every asset in this visit before saving.');
  }

  const conditions = [...provided.values()].map((v) => v.condition);
  const status = derivePmLogStatus(conditions);
  const faultyCount = conditions.filter((c) => c === 'faulty').length;
  let clearedCount = 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [id, value] of provided) {
      const prev = byId.get(id)!;
      const wasFaulty = prev.condition === 'faulty' && Number(prev.follow_up_required) === 1 && prev.resolved_at == null;
      const nowGood = value.condition === 'good';
      const resolveNow = wasFaulty && nowGood;
      if (resolveNow) clearedCount += 1;

      await conn.execute(
        `UPDATE pm_log_asset
         SET \`condition\` = ?, remarks = ?, follow_up_required = ?,
             resolved_at = CASE
               WHEN ? = 1 THEN CURRENT_TIMESTAMP
               WHEN ? = 'faulty' THEN NULL
               ELSE resolved_at
             END,
             resolved_pm_log_id = CASE
               WHEN ? = 1 THEN ?
               WHEN ? = 'faulty' THEN NULL
               ELSE resolved_pm_log_id
             END
         WHERE pm_log_asset_id = ? AND pm_log_id = ?`,
        [
          value.condition,
          value.condition === 'faulty' ? value.remarks : prev.remarks,
          nowGood ? 0 : 1,
          resolveNow ? 1 : 0,
          value.condition,
          resolveNow ? 1 : 0,
          pmLogId,
          value.condition,
          id,
          pmLogId,
        ],
      );
    }

    await conn.execute(`UPDATE pm_log SET status = ? WHERE pm_log_id = ?`, [status, pmLogId]);
    await conn.commit();
    return { pmLogId, status, assetsTotal: provided.size, faultyCount, clearedCount };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

type LogRow = RowDataPacket & {
  pm_log_id: number;
  pm_date: Date | string;
  building: string;
  level: string;
  zone: string;
  status: PmLogStatus;
  remarks: string | null;
  performed_by: number;
  performed_email: string | null;
  assets_total: number;
  good_count: number;
  faulty_count: number;
};

type LogAssetRow = RowDataPacket & {
  pm_log_asset_id: number;
  pm_log_id: number;
  asset_type: AssetKind;
  asset_id: AssetId;
  asset_category: string | null;
  asset_label: string | null;
  serial_num: string | null;
  condition: PmAssetCondition;
  remarks: string | null;
  follow_up_required: number;
  resolved_at: Date | string | null;
};

function mapLogAsset(row: LogAssetRow): PmLogAsset {
  return {
    pmLogAssetId: row.pm_log_asset_id,
    assetType: row.asset_type,
    assetId: row.asset_id,
    assetCategory: row.asset_category,
    assetLabel: row.asset_label?.trim() || `Asset #${row.asset_id}`,
    serialNum: row.serial_num,
    condition: row.condition,
    remarks: row.remarks,
    followUpRequired: Number(row.follow_up_required) === 1,
    resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
  };
}

export async function listPmLogs(filters: PmLogListFilters = {}): Promise<PmLogListRow[]> {
  const pool = getDbPool();
  const where: string[] = ['1=1'];
  const params: unknown[] = [];

  if (filters.dateFrom?.trim()) {
    where.push('l.pm_date >= ?');
    params.push(filters.dateFrom.trim().slice(0, 10));
  }
  if (filters.dateTo?.trim()) {
    where.push('l.pm_date <= ?');
    params.push(filters.dateTo.trim().slice(0, 10));
  }
  if (filters.status && filters.status !== 'all') {
    where.push('l.status = ?');
    params.push(filters.status);
  }
  if (filters.building && filters.building !== 'all') {
    where.push('l.building = ?');
    params.push(filters.building);
  }

  const [rows] = await pool.query<LogRow[]>(
    `SELECT l.pm_log_id, l.pm_date, l.building, l.level, l.zone, l.status, l.remarks,
            l.performed_by, u.email AS performed_email,
            COUNT(a.pm_log_asset_id) AS assets_total,
            SUM(CASE WHEN a.\`condition\` = 'good' THEN 1 ELSE 0 END) AS good_count,
            SUM(CASE WHEN a.\`condition\` = 'faulty' THEN 1 ELSE 0 END) AS faulty_count
     FROM pm_log l
     INNER JOIN users u ON u.id = l.performed_by
     LEFT JOIN pm_log_asset a ON a.pm_log_id = l.pm_log_id
     WHERE ${where.join(' AND ')}
     GROUP BY l.pm_log_id, l.pm_date, l.building, l.level, l.zone, l.status, l.remarks,
              l.performed_by, u.email
     ORDER BY l.pm_date DESC, l.pm_log_id DESC`,
    params,
  );

  if (rows.length === 0) return [];

  const logIds = rows.map((r) => r.pm_log_id);
  const [assetRows] = await pool.query<LogAssetRow[]>(
    `SELECT pm_log_asset_id, pm_log_id, asset_type, asset_id, asset_category, asset_label,
            serial_num, \`condition\`, remarks, follow_up_required, resolved_at
     FROM pm_log_asset
     WHERE pm_log_id IN (?)
     ORDER BY \`condition\` DESC, pm_log_asset_id ASC`,
    [logIds],
  );

  const assetsByLog = new Map<number, PmLogAsset[]>();
  for (const row of assetRows) {
    const list = assetsByLog.get(row.pm_log_id) ?? [];
    list.push(mapLogAsset(row));
    assetsByLog.set(row.pm_log_id, list);
  }

  let mapped = rows.map((row): PmLogListRow => {
    const email = row.performed_email?.trim() || null;
    return {
      pmLogId: row.pm_log_id,
      pmDate: toIsoDate(row.pm_date),
      building: row.building,
      level: row.level,
      zone: row.zone,
      status: row.status,
      remarks: row.remarks,
      performedBy: email ?? `User #${row.performed_by}`,
      performedByEmail: email,
      assetsTotal: Number(row.assets_total) || 0,
      goodCount: Number(row.good_count) || 0,
      faultyCount: Number(row.faulty_count) || 0,
      assets: assetsByLog.get(row.pm_log_id) ?? [],
    };
  });

  const q = filters.search?.trim().toLowerCase();
  if (q) {
    mapped = mapped.filter((r) =>
      [
        r.building,
        r.level,
        r.zone,
        r.performedBy,
        r.performedByEmail,
        r.remarks,
        ...r.assets.flatMap((a) => [a.assetLabel, a.serialNum, a.assetCategory, a.remarks]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }

  return mapped;
}

export async function listPmLogBuildings(): Promise<string[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<(RowDataPacket & { building: string })[]>(
    `SELECT DISTINCT building FROM pm_log ORDER BY building`,
  );
  return rows.map((r) => r.building);
}

export async function getPmStats(): Promise<PmStats> {
  const { from, to } = monthBounds();
  const pool = getDbPool();

  const [monthRows] = await pool.query<
    (RowDataPacket & { visits: number; assets_checked: number; faulty: number })[]
  >(
    `SELECT COUNT(DISTINCT l.pm_log_id) AS visits,
            COUNT(DISTINCT CONCAT(a.asset_type, ':', a.asset_id)) AS assets_checked,
            SUM(CASE WHEN a.\`condition\` = 'faulty' THEN 1 ELSE 0 END) AS faulty
     FROM pm_log l
     LEFT JOIN pm_log_asset a ON a.pm_log_id = l.pm_log_id
     WHERE l.pm_date BETWEEN ? AND ?`,
    [from, to],
  );

  const [pendingRows] = await pool.query<(RowDataPacket & { pending: number })[]>(
    `SELECT COUNT(DISTINCT CONCAT(asset_type, ':', asset_id)) AS pending
     FROM pm_log_asset
     WHERE follow_up_required = 1 AND resolved_at IS NULL`,
  );

  return {
    visitsThisMonth: Number(monthRows[0]?.visits) || 0,
    assetsChecked: Number(monthRows[0]?.assets_checked) || 0,
    faultyThisMonth: Number(monthRows[0]?.faulty) || 0,
    pendingFollowUp: Number(pendingRows[0]?.pending) || 0,
  };
}
