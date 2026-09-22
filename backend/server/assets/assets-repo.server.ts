import type { RowDataPacket } from 'mysql2';
import {
  isValidAccCode,
  sameAssetId,
  type AssetDetail,
  type AssetDetailResponse,
  type AssetId,
  type AssetKind,
  type AssetTrailEvent,
  type AvAsset,
  type BulkLaptopHandoverImport,
  type BulkPlaceDeploymentImport,
  type CreateAvInput,
  type CreateLaptopInput,
  type CreateNetworkInput,
  type LaptopAsset,
  type NetworkAsset,
  type PurchaseFields,
  type UpdateAssetInput,
  type UpdateAvInput,
  type UpdateLaptopInput,
  type UpdateNetworkInput,
} from '@shared/lib/inventory-schema';
import {
  isPredisposalReason,
  type DisposalDashboardStats,
  type MarkPredisposedAssetInput,
  type PreDisposedAsset,
  type PredisposalEligibleAsset,
  type PredisposalReason,
} from '@shared/lib/disposal-schema';
import {
  isAllowedStatusTransition,
  isPredisposalEligibleStatus,
  isPreDisposedStatus,
  PREDISPOSAL_ELIGIBLE_STATUS_IDS,
  STATUS_ID,
} from '@shared/lib/asset-status-actions';
import { coerceToIsoDate, formatIsoToDdMmYy, sqlDateToIso } from '@shared/lib/date-format';
import { purchaseSqlParams } from '@shared/lib/purchase-field-utils';
import {
  assetIdNewestYearFirstSql,
  assetIdNumericCore,
  canonicalizeLaptopCategory,
  composeAssetId,
  normalizeAssetTag,
} from '@/hooks/assetid-generator';
import { allocateAssetIdsFromDb } from '@backend/server/assets/asset-id.server';
import {
  getDisposalDashboardStatsFromTables,
  recordAssetPredisposed,
  recordAssetPredisposalRemoved,
  reasonFromAssetDates,
  sqlUtf8AssetId,
  withAssetPredisposalTransaction,
} from '@backend/server/assets/disposal-repo.server';
import { attachDisplayNames, getDisplayNameByOid, getDisplayNamesByOids } from '@backend/server/core/azure-directory.server';
import { getDbPool } from '@backend/server/core/db';
import { insertWarranty } from '@backend/server/requests/warranty-repair-repo.server';

export type BulkLaptopImportRow = Omit<CreateLaptopInput, 'assetId'> & {
  assetId?: string | number;
  tagging?: string | null;
  handover?: BulkLaptopHandoverImport;
};

function hasProvidedAssetId(assetId: string | number | undefined): assetId is string | number {
  if (assetId == null) return false;
  if (typeof assetId === 'number') return Number.isFinite(assetId) && assetId > 0;
  return assetId.trim().length > 0;
}

function storedAssetId(assetId: string | number, tagging?: string | null): string {
  const raw = String(assetId).trim();
  const tag = normalizeAssetTag(tagging);
  if (!tag) return raw;
  const core = assetIdNumericCore(raw);
  return composeAssetId(core ?? raw, tag);
}

export type BulkAvImportRow = Omit<CreateAvInput, 'assetId'> & {
  assetId?: string | number;
  tagging?: string | null;
  deployment?: BulkPlaceDeploymentImport;
};

export type BulkNetworkImportRow = Omit<CreateNetworkInput, 'assetId'> & {
  assetId?: string | number;
  tagging?: string | null;
  deployment?: BulkPlaceDeploymentImport;
};

async function fillLaptopAssetIds(rows: BulkLaptopImportRow[]): Promise<BulkLaptopImportRow[]> {
  const normalized = rows.map((row) => {
    const category = canonicalizeLaptopCategory(row.category);
    if (!category) throw new Error('Category is required.');
    return { ...row, category };
  });
  const autoCategories = normalized.filter((r) => !hasProvidedAssetId(r.assetId)).map((r) => r.category);
  const generated =
    autoCategories.length > 0
      ? await allocateAssetIdsFromDb({ kind: 'laptop', laptopCategories: autoCategories })
      : [];
  let genIdx = 0;
  return normalized.map((row) => {
    if (hasProvidedAssetId(row.assetId)) {
      return { ...row, assetId: storedAssetId(row.assetId, row.tagging) };
    }
    const assetId = generated[genIdx++];
    if (assetId == null) {
      throw new Error(
        'A new asset ID could not be generated for this laptop. Try again, or contact support if this keeps happening.',
      );
    }
    return { ...row, assetId: storedAssetId(assetId, row.tagging) };
  });
}

async function fillAvAssetIds(rows: BulkAvImportRow[]): Promise<BulkAvImportRow[]> {
  const needCount = rows.filter((r) => !hasProvidedAssetId(r.assetId)).length;
  const generated =
    needCount > 0 ? await allocateAssetIdsFromDb({ kind: 'av', count: needCount }) : [];
  let genIdx = 0;
  return rows.map((row) => {
    if (hasProvidedAssetId(row.assetId)) {
      return { ...row, assetId: storedAssetId(row.assetId, row.tagging) };
    }
    const assetId = generated[genIdx++];
    if (assetId == null) {
      throw new Error(
        'A new asset ID could not be generated for this AV item. Try again, or contact support if this keeps happening.',
      );
    }
    return { ...row, assetId: storedAssetId(assetId, row.tagging) };
  });
}

async function fillNetworkAssetIds(rows: BulkNetworkImportRow[]): Promise<BulkNetworkImportRow[]> {
  const needCount = rows.filter((r) => !hasProvidedAssetId(r.assetId)).length;
  const generated =
    needCount > 0 ? await allocateAssetIdsFromDb({ kind: 'network', count: needCount }) : [];
  let genIdx = 0;
  return rows.map((row) => {
    if (hasProvidedAssetId(row.assetId)) {
      return { ...row, assetId: storedAssetId(row.assetId, row.tagging) };
    }
    const assetId = generated[genIdx++];
    if (assetId == null) {
      throw new Error(
        'A new asset ID could not be generated for this network item. Try again, or contact support if this keeps happening.',
      );
    }
    return { ...row, assetId: storedAssetId(assetId, row.tagging) };
  });
}

async function resolveUserIdByEmail(
  conn: Awaited<ReturnType<ReturnType<typeof getDbPool>['getConnection']>>,
  email: string,
): Promise<number> {
  const [rows] = await conn.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email.trim().toLowerCase()],
  );
  if (!rows[0]) {
    throw new Error(
      `No user account matches the email "${email}". Use an email that is registered in the system.`,
    );
  }
  return rows[0].id;
}

async function assertEmployeeNo(
  conn: Awaited<ReturnType<ReturnType<typeof getDbPool>['getConnection']>>,
  employeeNo: string,
) {
  const [rows] = await conn.query<(RowDataPacket & { employee_no: string })[]>(
    'SELECT employee_no FROM staff WHERE employee_no = ? LIMIT 1',
    [employeeNo],
  );
  if (!rows[0]) {
    throw new Error(
      `No staff member matches employee number "${employeeNo}". Check the number or add the person to the staff directory first.`,
    );
  }
}

async function insertLaptopHandover(
  conn: Awaited<ReturnType<ReturnType<typeof getDbPool>['getConnection']>>,
  assetId: string | number,
  handover: BulkLaptopHandoverImport,
) {
  const userId = await resolveUserIdByEmail(conn, handover.handoverStaffEmail);
  if (handover.employeeNo) {
    await assertEmployeeNo(conn, handover.employeeNo);
  }

  const [handoverResult] = await conn.execute(
    `INSERT INTO handover (asset_id, user_id, building, level, zone, handler, handover_date, handover_remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      assetId,
      userId,
      handover.building ?? null,
      handover.level ?? null,
      handover.zone ?? null,
      handover.handler ?? null,
      handover.handoverDate,
      handover.handoverRemarks,
    ],
  );
  const handoverId = (handoverResult as { insertId: number }).insertId;
  if (handover.employeeNo) {
    await conn.execute(`INSERT INTO handover_staff (employee_no, handover_id) VALUES (?, ?)`, [
      handover.employeeNo,
      handoverId,
    ]);
  }
}

async function insertPlaceDeployment(
  conn: Awaited<ReturnType<ReturnType<typeof getDbPool>['getConnection']>>,
  kind: 'av' | 'network',
  assetId: AssetId,
  deployment: BulkPlaceDeploymentImport,
) {
  const userId = await resolveUserIdByEmail(conn, deployment.deploymentStaffEmail);
  const table = kind === 'av' ? 'av_deployment' : 'network_deployment';
  await conn.execute(
    `INSERT INTO \`${table}\`
      (asset_id, building, level, zone, deployment_date, deployment_remarks, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      assetId,
      deployment.building,
      deployment.level,
      deployment.zone,
      deployment.deploymentDate,
      deployment.deploymentRemarks,
      userId,
    ],
  );
}

type PurchaseRow = {
  PO_DATE: Date | string | null;
  PO_NUM: string | null;
  DO_DATE: Date | string | null;
  DO_NUM: string | null;
  INVOICE_DATE: Date | string | null;
  INVOICE_NUM: string | null;
  PURCHASE_COST: string | number | null;
};

type LaptopRow = RowDataPacket &
  PurchaseRow & {
    asset_id: AssetId;
    acc_code: string | null;
    serial_num: string | null;
    brand: string | null;
    model: string | null;
    supplier: string | null;
    category: string | null;
    part_number: string | null;
    processor: string | null;
    memory: string | null;
    os: string | null;
    storage: string | null;
    gpu: string | null;
    status_id: number;
    remarks: string | null;
    recipient_division?: string | null;
    recipient_name?: string | null;
    place_handler?: string | null;
    place_building?: string | null;
    place_level?: string | null;
    place_zone?: string | null;
    place_handover_remarks?: string | null;
    created_at?: Date | string | null;
    registered_by_name?: string | null;
    proposed_at?: Date | string | null;
    proposed_oid?: string | null;
    proposed_email?: string | null;
    proposed_name?: string | null;
  };

type AvRow = RowDataPacket &
  PurchaseRow & {
    asset_id: number;
    acc_code: string | null;
    asset_id_old: string | null;
    category: string | null;
    brand: string | null;
    model: string | null;
    supplier: string | null;
    serial_num: string | null;
    status_id: number;
    remarks: string | null;
  };

type NetworkRow = RowDataPacket &
  PurchaseRow & {
    asset_id: number;
    acc_code: string | null;
    category: string | null;
    serial_num: string | null;
    brand: string | null;
    model: string | null;
    supplier: string | null;
    mac_address: string | null;
    ip_address: string | null;
    status_id: number;
    remarks: string | null;
  };

function formatDate(val: Date | string | null | undefined): string | null {
  if (val == null) return null;
  const iso = sqlDateToIso(val);
  if (!iso) return null;
  return formatIsoToDdMmYy(iso) ?? iso;
}

function mapPurchase(row: PurchaseRow): PurchaseFields {
  return {
    poDate: formatDate(row.PO_DATE),
    poNum: row.PO_NUM,
    doDate: formatDate(row.DO_DATE),
    doNum: row.DO_NUM,
    invoiceDate: formatDate(row.INVOICE_DATE),
    invoiceNum: row.INVOICE_NUM,
    purchaseCost: row.PURCHASE_COST != null ? Number(row.PURCHASE_COST) : null,
  };
}

function mapLaptop(row: LaptopRow): LaptopAsset {
  return {
    kind: 'laptop',
    assetId: row.asset_id,
    accCode: row.acc_code,
    serialNum: row.serial_num,
    brand: row.brand,
    model: row.model,
    supplier: row.supplier,
    category: row.category,
    partNumber: row.part_number,
    processor: row.processor,
    memory: row.memory,
    os: row.os,
    storage: row.storage,
    gpu: row.gpu,
    statusId: row.status_id,
    remarks: row.remarks,
    recipientDivision: row.recipient_division ?? null,
    recipientName: row.recipient_name?.trim() || null,
    placeHandler: row.place_handler?.trim() || null,
    placeBuilding: row.place_building?.trim() || null,
    placeLevel: row.place_level?.trim() || null,
    placeZone: row.place_zone?.trim() || null,
    placeHandoverRemarks: row.place_handover_remarks?.trim() || null,
    registeredAt: trailAt(row.created_at) || null,
    registeredBy: row.registered_by_name?.trim() || null,
    proposedAt: trailAt(row.proposed_at) || null,
    proposedBy: row.proposed_name?.trim() || row.proposed_email?.trim() || null,
    ...mapPurchase(row),
  };
}

const EMPTY_PLACE = { building: null, level: null, zone: null } as const;

function mapAv(row: AvRow): AvAsset {
  return {
    kind: 'av',
    assetId: row.asset_id,
    accCode: row.acc_code,
    assetIdOld: row.asset_id_old,
    category: row.category,
    brand: row.brand,
    model: row.model,
    supplier: row.supplier,
    serialNum: row.serial_num,
    statusId: row.status_id,
    remarks: row.remarks,
    ...EMPTY_PLACE,
    ...mapPurchase(row),
  };
}

function mapNetwork(row: NetworkRow): NetworkAsset {
  return {
    kind: 'network',
    assetId: row.asset_id,
    accCode: row.acc_code,
    category: row.category,
    serialNum: row.serial_num,
    brand: row.brand,
    model: row.model,
    supplier: row.supplier,
    macAddress: row.mac_address,
    ipAddress: row.ip_address,
    statusId: row.status_id,
    remarks: row.remarks,
    ...EMPTY_PLACE,
    ...mapPurchase(row),
  };
}

async function fetchOpenPlaceDeployments(
  kind: 'av' | 'network',
): Promise<Map<AssetId, { building: string; level: string; zone: string }>> {
  const pool = getDbPool();
  const deployTable = kind === 'av' ? 'av_deployment' : 'network_deployment';
  const returnTable = kind === 'av' ? 'av_return' : 'network_return';
  const map = new Map<AssetId, { building: string; level: string; zone: string }>();

  const [rows] = await pool.query<
    (RowDataPacket & { asset_id: AssetId; building: string; level: string; zone: string })[]
  >(
    `SELECT d.asset_id, d.building, d.level, d.zone
     FROM \`${deployTable}\` d
     INNER JOIN (
       SELECT d2.asset_id, MAX(d2.deployment_id) AS deployment_id
       FROM \`${deployTable}\` d2
       WHERE NOT EXISTS (
         SELECT 1 FROM \`${returnTable}\` r WHERE r.deployment_id = d2.deployment_id
       )
       GROUP BY d2.asset_id
     ) open_d ON open_d.deployment_id = d.deployment_id`,
  );

  for (const row of rows) {
    map.set(row.asset_id, {
      building: row.building,
      level: row.level,
      zone: row.zone,
    });
  }

  return map;
}

function attachOpenPlace<T extends AvAsset | NetworkAsset>(
  assets: T[],
  placeMap: Map<AssetId, { building: string; level: string; zone: string }>,
): T[] {
  return assets.map((asset) => {
    const place = placeMap.get(asset.assetId);
    if (!place) return asset;
    return {
      ...asset,
      building: place.building,
      level: place.level,
      zone: place.zone,
    };
  });
}

let laptopRegisteredByReady: Promise<void> | null = null;

async function ensureLaptopRegisteredByColumn() {
  if (!laptopRegisteredByReady) {
    laptopRegisteredByReady = (async () => {
      const pool = getDbPool();
      try {
        await pool.query('ALTER TABLE laptop ADD COLUMN registered_by_name VARCHAR(255) NULL');
      } catch (e) {
        const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
        const msg = e instanceof Error ? e.message : '';
        if (code !== 'ER_DUP_FIELDNAME' && !msg.toLowerCase().includes('duplicate column')) {
          throw e;
        }
      }
    })();
  }
  await laptopRegisteredByReady;
}

const LAPTOP_INSERT = `INSERT INTO laptop (
  asset_id, acc_code, serial_num, brand, model, supplier, category, part_number,
  processor, memory, os, storage, gpu,
  PO_DATE, PO_NUM, DO_DATE, DO_NUM, INVOICE_DATE, INVOICE_NUM, PURCHASE_COST,
  status_id, remarks, registered_by_name
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const AV_INSERT = `INSERT INTO av (
  asset_id, acc_code, asset_id_old, category, brand, model, supplier, serial_num,
  PO_DATE, PO_NUM, DO_DATE, DO_NUM, INVOICE_DATE, INVOICE_NUM, PURCHASE_COST,
  status_id, remarks
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const NETWORK_INSERT = `INSERT INTO network (
  asset_id, acc_code, category, serial_num, brand, model, supplier, mac_address, ip_address,
  PO_DATE, PO_NUM, DO_DATE, DO_NUM, INVOICE_DATE, INVOICE_NUM, PURCHASE_COST,
  status_id, remarks
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function laptopParams(input: CreateLaptopInput, registeredByName: string | null = null) {
  const category = canonicalizeLaptopCategory(input.category);
  if (!category) throw new Error('Category is required.');
  const purchase = normalizePurchaseForUpdate(input);
  return [
    input.assetId,
    input.accCode ?? null,
    input.serialNum,
    input.brand ?? null,
    input.model ?? null,
    input.supplier ?? null,
    category,
    input.partNumber ?? null,
    input.processor ?? null,
    input.memory ?? null,
    input.os ?? null,
    input.storage ?? null,
    input.gpu ?? null,
    ...purchaseSqlParams(purchase),
    input.statusId,
    input.remarks ?? null,
    registeredByName?.trim() || null,
  ];
}

function avParams(input: CreateAvInput) {
  const purchase = normalizePurchaseForUpdate(input);
  return [
    input.assetId,
    input.accCode ?? null,
    input.assetIdOld ?? null,
    input.category ?? null,
    input.brand ?? null,
    input.model ?? null,
    input.supplier ?? null,
    input.serialNum ?? null,
    ...purchaseSqlParams(purchase),
    input.statusId,
    input.remarks ?? null,
  ];
}

function networkParams(input: CreateNetworkInput) {
  const purchase = normalizePurchaseForUpdate(input);
  return [
    input.assetId,
    input.accCode ?? null,
    input.category ?? null,
    input.serialNum ?? null,
    input.brand ?? null,
    input.model ?? null,
    input.supplier ?? null,
    input.macAddress ?? null,
    input.ipAddress ?? null,
    ...purchaseSqlParams(purchase),
    input.statusId,
    input.remarks ?? null,
  ];
}

export async function listAssets(kind: AssetKind) {
  const pool = getDbPool();
  if (kind === 'laptop') {
    await ensureLaptopRegisteredByColumn();
    const [rows] = await pool.query<LaptopRow[]>(
      `SELECT l.*, ho.recipient_division, ho.recipient_name, hp.place_handler, hp.place_building, hp.place_level, hp.place_zone,
              hp.place_handover_remarks, pd.proposed_at, pd.proposed_oid, pd.proposed_email
       FROM laptop l
       LEFT JOIN (
         SELECT h.asset_id, s.division AS recipient_division, s.full_name AS recipient_name
         FROM handover h
         INNER JOIN handover_staff hs ON hs.handover_id = h.handover_id
         INNER JOIN staff s ON s.employee_no = hs.employee_no
         LEFT JOIN handover_return hr ON hr.handover_staff_id = hs.handover_staff_id
         INNER JOIN (
           SELECT h2.asset_id, MAX(h2.handover_id) AS handover_id
           FROM handover h2
           INNER JOIN handover_staff hs2 ON hs2.handover_id = h2.handover_id
           LEFT JOIN handover_return hr2 ON hr2.handover_staff_id = hs2.handover_staff_id
           WHERE hr2.return_id IS NULL
           GROUP BY h2.asset_id
         ) open_h ON open_h.handover_id = h.handover_id AND open_h.asset_id = h.asset_id
         WHERE hr.return_id IS NULL
       ) ho ON ho.asset_id = l.asset_id
       LEFT JOIN (
         SELECT h.asset_id, h.handler AS place_handler, h.building AS place_building,
                h.level AS place_level, h.zone AS place_zone,
                h.handover_remarks AS place_handover_remarks
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
         WHERE hs.handover_staff_id IS NULL AND hr.return_id IS NULL
           AND h.handler IS NOT NULL AND TRIM(h.handler) <> ''
       ) hp ON hp.asset_id = l.asset_id
       LEFT JOIN (
         SELECT p.asset_id, p.marked_at AS proposed_at, u.oid AS proposed_oid, u.email AS proposed_email
         FROM pre_disposal p
         LEFT JOIN users u ON u.id = p.marked_by
         INNER JOIN (
           SELECT asset_id, MAX(pre_disposal_id) AS pre_disposal_id
           FROM pre_disposal
           WHERE asset_type = 'laptop' AND status = 'pending'
           GROUP BY asset_id
         ) latest ON latest.pre_disposal_id = p.pre_disposal_id
       ) pd ON ${sqlUtf8AssetId('pd.asset_id')} = ${sqlUtf8AssetId('l.asset_id')}
       ORDER BY ${assetIdNewestYearFirstSql('l.asset_id')}`,
    );
    const fallbackByOid = new Map<string, string>();
    for (const row of rows) {
      const oid = row.proposed_oid?.trim();
      const email = row.proposed_email?.trim();
      if (oid && email) fallbackByOid.set(oid, email);
    }
    const names = await getDisplayNamesByOids(
      rows.map((row) => row.proposed_oid),
      fallbackByOid,
    );
    for (const row of rows) {
      const oid = row.proposed_oid?.trim();
      row.proposed_name = oid ? names.get(oid) ?? null : null;
    }
    return rows.map(mapLaptop);
  }
  if (kind === 'av') {
    const [rows] = await pool.query<AvRow[]>(
      `SELECT * FROM av ORDER BY ${assetIdNewestYearFirstSql()}`,
    );
    const assets = rows.map(mapAv);
    const placeMap = await fetchOpenPlaceDeployments('av');
    return attachOpenPlace(assets, placeMap);
  }
  const [rows] = await pool.query<NetworkRow[]>(
    `SELECT * FROM network ORDER BY ${assetIdNewestYearFirstSql()}`,
  );
  const assets = rows.map(mapNetwork);
  const placeMap = await fetchOpenPlaceDeployments('network');
  return attachOpenPlace(assets, placeMap);
}

async function maybeInsertWarranty(
  kind: AssetKind,
  assetId: string | number,
  warranty: CreateLaptopInput['warranty'],
  conn?: import('mysql2/promise').PoolConnection,
) {
  if (warranty?.startDate && warranty.endDate) {
    await insertWarranty(kind, assetId, warranty, conn);
  }
}

export async function createLaptop(input: CreateLaptopInput, registeredByName: string | null = null) {
  await ensureLaptopRegisteredByColumn();
  const pool = getDbPool();
  const { warranty, ...laptop } = input;
  await pool.execute(LAPTOP_INSERT, laptopParams({ ...laptop, assetId: input.assetId }, registeredByName));
  await maybeInsertWarranty('laptop', input.assetId, warranty);
  const [rows] = await pool.query<LaptopRow[]>('SELECT * FROM laptop WHERE asset_id = ?', [input.assetId]);
  if (!rows[0]) {
    throw new Error('The laptop was saved but could not be loaded. Refresh the page to see it.');
  }
  return mapLaptop(rows[0]);
}

export async function createAv(input: CreateAvInput) {
  const pool = getDbPool();
  const { warranty, ...av } = input;
  await pool.execute(AV_INSERT, avParams({ ...av, assetId: input.assetId }));
  await maybeInsertWarranty('av', input.assetId, warranty);
  const [rows] = await pool.query<AvRow[]>('SELECT * FROM av WHERE asset_id = ?', [input.assetId]);
  if (!rows[0]) {
    throw new Error('The AV asset was saved but could not be loaded. Refresh the page to see it.');
  }
  return mapAv(rows[0]);
}

export async function createNetwork(input: CreateNetworkInput) {
  const pool = getDbPool();
  const { warranty, ...network } = input;
  await pool.execute(NETWORK_INSERT, networkParams({ ...network, assetId: input.assetId }));
  await maybeInsertWarranty('network', input.assetId, warranty);
  const [rows] = await pool.query<NetworkRow[]>('SELECT * FROM network WHERE asset_id = ?', [input.assetId]);
  if (!rows[0]) {
    throw new Error('The network asset was saved but could not be loaded. Refresh the page to see it.');
  }
  return mapNetwork(rows[0]);
}

export async function bulkCreateLaptops(rows: BulkLaptopImportRow[], registeredByName: string | null = null) {
  await ensureLaptopRegisteredByColumn();
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      const { handover, assetId, warranty, ...laptop } = row;
      if (!hasProvidedAssetId(assetId)) {
        throw new Error(
          'An asset ID could not be assigned after generation. Try saving again, or contact support if this keeps happening.',
        );
      }
      await conn.execute(LAPTOP_INSERT, laptopParams({ ...laptop, assetId }, registeredByName));
      await maybeInsertWarranty('laptop', assetId, warranty, conn);
      if (handover) {
        await insertLaptopHandover(conn, assetId, handover);
      }
    }
    await conn.commit();
    return rows.length;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function bulkCreateAv(rows: BulkAvImportRow[]) {
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      const { deployment, assetId, warranty, ...av } = row;
      if (!hasProvidedAssetId(assetId)) {
        throw new Error(
          'An asset ID could not be assigned after generation. Try saving again, or contact support if this keeps happening.',
        );
      }
      await conn.execute(AV_INSERT, avParams({ ...av, assetId }));
      await maybeInsertWarranty('av', assetId, warranty, conn);
      if (deployment) {
        await insertPlaceDeployment(conn, 'av', assetId, deployment);
      }
    }
    await conn.commit();
    return rows.length;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function bulkCreateNetwork(rows: BulkNetworkImportRow[]) {
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      const { deployment, assetId, warranty, ...network } = row;
      if (!hasProvidedAssetId(assetId)) {
        throw new Error(
          'An asset ID could not be assigned after generation. Try saving again, or contact support if this keeps happening.',
        );
      }
      await conn.execute(NETWORK_INSERT, networkParams({ ...network, assetId }));
      await maybeInsertWarranty('network', assetId, warranty, conn);
      if (deployment) {
        await insertPlaceDeployment(conn, 'network', assetId, deployment);
      }
    }
    await conn.commit();
    return rows.length;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function bulkCreateLaptopsWithGeneratedIds(
  rows: BulkLaptopImportRow[],
  registeredByName: string | null = null,
) {
  return bulkCreateLaptops(await fillLaptopAssetIds(rows), registeredByName);
}

export async function bulkCreateAvWithGeneratedIds(rows: BulkAvImportRow[]) {
  return bulkCreateAv(await fillAvAssetIds(rows));
}

export async function bulkCreateNetworkWithGeneratedIds(rows: BulkNetworkImportRow[]) {
  return bulkCreateNetwork(await fillNetworkAssetIds(rows));
}

const TABLE_BY_KIND: Record<AssetKind, string> = {
  laptop: 'laptop',
  av: 'av',
  network: 'network',
};

export async function updateAssetStatus(kind: AssetKind, assetId: AssetId, statusId: number) {
  const items = await listAssets(kind);
  const asset = items.find((a) => sameAssetId(a.assetId, assetId));
  if (!asset) {
    throw new Error('This asset could not be found. Refresh the page and check the asset ID.');
  }
  if (!isAllowedStatusTransition(kind, asset.statusId, statusId)) {
    throw new Error(
      'This status change is not allowed from the asset\'s current state. Choose a valid next status.',
    );
  }

  const pool = getDbPool();
  const table = TABLE_BY_KIND[kind];
  const [result] = await pool.execute(
    `UPDATE \`${table}\` SET status_id = ? WHERE asset_id = ?`,
    [statusId, assetId],
  );
  const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
  if (affected === 0) {
    throw new Error('This asset could not be found. Refresh the page and check the asset ID.');
  }

  const updated = (await listAssets(kind)).find((a) => a.assetId === assetId);
  if (!updated) {
    throw new Error('The asset was updated but could not be loaded. Refresh the page to see the latest details.');
  }
  return updated;
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAccCode(value: string | null | undefined): string | null {
  const code = trimOrNull(value);
  if (code && !isValidAccCode(code)) {
    throw new Error('Choose a valid account code from the list.');
  }
  return code;
}

function normalizeOptionalDate(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const iso = coerceToIsoDate(raw);
  if (!iso) {
    throw new Error('A purchase date is not valid. Pick a date from the calendar.');
  }
  return iso;
}

function normalizePurchaseForUpdate(input: PurchaseFields): PurchaseFields {
  const cost = input.purchaseCost;
  if (cost != null && (!Number.isFinite(Number(cost)) || Number(cost) < 0)) {
    throw new Error('Purchase cost must be a valid amount of 0 or more.');
  }
  return {
    poDate: normalizeOptionalDate(input.poDate),
    poNum: trimOrNull(input.poNum),
    doDate: normalizeOptionalDate(input.doDate),
    doNum: trimOrNull(input.doNum),
    invoiceDate: normalizeOptionalDate(input.invoiceDate),
    invoiceNum: trimOrNull(input.invoiceNum),
    purchaseCost: cost == null ? null : Number(cost),
  };
}

async function assertAssetExists(kind: AssetKind, assetId: AssetId) {
  const pool = getDbPool();
  const table = TABLE_BY_KIND[kind];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT asset_id FROM \`${table}\` WHERE asset_id = ? LIMIT 1`,
    [assetId],
  );
  if (!rows[0]) {
    throw new Error('This asset could not be found. Refresh the page and check the asset ID.');
  }
}

const PURCHASE_SET = `PO_DATE = ?, PO_NUM = ?, DO_DATE = ?, DO_NUM = ?, INVOICE_DATE = ?, INVOICE_NUM = ?, PURCHASE_COST = ?`;

async function updateLaptopDetails(assetId: AssetId, input: UpdateLaptopInput) {
  const serialNum = input.serialNum.trim();
  const category = canonicalizeLaptopCategory(input.category);
  if (!serialNum) throw new Error('Serial number is required.');
  if (!category) throw new Error('Category is required.');
  const purchase = normalizePurchaseForUpdate(input);
  await assertAssetExists('laptop', assetId);
  const pool = getDbPool();
  await pool.execute(
    `UPDATE laptop SET
      acc_code = ?, serial_num = ?, brand = ?, model = ?, supplier = ?, category = ?,
      part_number = ?, processor = ?, memory = ?, os = ?, storage = ?, gpu = ?,
      ${PURCHASE_SET}, remarks = ?
     WHERE asset_id = ?`,
    [
      normalizeAccCode(input.accCode),
      serialNum,
      trimOrNull(input.brand),
      trimOrNull(input.model),
      trimOrNull(input.supplier),
      category,
      trimOrNull(input.partNumber),
      trimOrNull(input.processor),
      trimOrNull(input.memory),
      trimOrNull(input.os),
      trimOrNull(input.storage),
      trimOrNull(input.gpu),
      ...purchaseSqlParams(purchase),
      trimOrNull(input.remarks),
      assetId,
    ],
  );
}

async function updateAvDetails(assetId: AssetId, input: UpdateAvInput) {
  const purchase = normalizePurchaseForUpdate(input);
  await assertAssetExists('av', assetId);
  const pool = getDbPool();
  await pool.execute(
    `UPDATE av SET
      acc_code = ?, asset_id_old = ?, category = ?, brand = ?, model = ?, supplier = ?, serial_num = ?,
      ${PURCHASE_SET}, remarks = ?
     WHERE asset_id = ?`,
    [
      normalizeAccCode(input.accCode),
      trimOrNull(input.assetIdOld),
      trimOrNull(input.category),
      trimOrNull(input.brand),
      trimOrNull(input.model),
      trimOrNull(input.supplier),
      trimOrNull(input.serialNum),
      ...purchaseSqlParams(purchase),
      trimOrNull(input.remarks),
      assetId,
    ],
  );
}

async function updateNetworkDetails(assetId: AssetId, input: UpdateNetworkInput) {
  const purchase = normalizePurchaseForUpdate(input);
  await assertAssetExists('network', assetId);
  const pool = getDbPool();
  await pool.execute(
    `UPDATE network SET
      acc_code = ?, category = ?, serial_num = ?, brand = ?, model = ?, supplier = ?,
      mac_address = ?, ip_address = ?,
      ${PURCHASE_SET}, remarks = ?
     WHERE asset_id = ?`,
    [
      normalizeAccCode(input.accCode),
      trimOrNull(input.category),
      trimOrNull(input.serialNum),
      trimOrNull(input.brand),
      trimOrNull(input.model),
      trimOrNull(input.supplier),
      trimOrNull(input.macAddress),
      trimOrNull(input.ipAddress),
      ...purchaseSqlParams(purchase),
      trimOrNull(input.remarks),
      assetId,
    ],
  );
}

export async function updateAssetDetails(input: UpdateAssetInput) {
  if (input.kind === 'laptop') {
    await updateLaptopDetails(input.assetId, input);
  } else if (input.kind === 'av') {
    await updateAvDetails(input.assetId, input);
  } else {
    await updateNetworkDetails(input.assetId, input);
  }
  const detail = await getAssetDetail(input.kind, input.assetId);
  if (!detail) {
    throw new Error('The asset was updated but could not be loaded. Refresh the page to see the latest details.');
  }
  return detail;
}

type PredisposalRow = RowDataPacket & {
  asset_id: string | number;
  asset_id_old?: string | null;
  model: string | null;
  brand: string | null;
  category: string | null;
  serial_num: string | null;
  status_id: number;
  PO_DATE: Date | string | null;
  DO_DATE: Date | string | null;
};

async function queryPredisposalEligible(
  kind: AssetKind,
  extraSelect = '',
): Promise<PredisposalEligibleAsset[]> {
  const pool = getDbPool();
  const table = TABLE_BY_KIND[kind];
  const placeholders = PREDISPOSAL_ELIGIBLE_STATUS_IDS.map(() => '?').join(', ');
  const [rows] = await pool.query<PredisposalRow[]>(
    `SELECT asset_id, ${extraSelect} model, brand, category, serial_num, status_id, PO_DATE, DO_DATE
     FROM \`${table}\`
     WHERE status_id IN (${placeholders})
       AND NOT EXISTS (
         SELECT 1 FROM pre_disposal pd
         WHERE pd.asset_type = ?
           AND ${sqlUtf8AssetId('pd.asset_id')} = ${sqlUtf8AssetId(`\`${table}\`.asset_id`)}
           AND pd.status IN ('pending', 'in_disposal')
       )
     ORDER BY ${assetIdNewestYearFirstSql()}`,
    [...PREDISPOSAL_ELIGIBLE_STATUS_IDS, kind],
  );
  return rows.map((r) => ({
    kind,
    assetId: r.asset_id,
    assetIdOld: r.asset_id_old ?? null,
    model: r.model,
    brand: r.brand,
    category: r.category,
    serialNum: r.serial_num,
    statusId: r.status_id,
    poDate: formatDate(r.PO_DATE),
    doDate: formatDate(r.DO_DATE),
  }));
}

export async function listPredisposalEligibleAssets(): Promise<PredisposalEligibleAsset[]> {
  const [laptop, av, network] = await Promise.all([
    queryPredisposalEligible('laptop'),
    queryPredisposalEligible('av', 'asset_id_old,'),
    queryPredisposalEligible('network'),
  ]);
  return [...laptop, ...av, ...network];
}

type PreDisposedQueryRow = PredisposalRow & {
  pre_disposal_id: number;
  acc_code: string | null;
  reason: string;
  predisposed_at: Date | string | null;
  predisposed_email: string | null;
  predisposed_oid: string | null;
  predisposed_name?: string | null;
};

function formatDateTimeIso(val: Date | string | null | undefined): string | null {
  if (val == null) return null;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapPredisposalReason(value: string): PredisposalReason {
  return isPredisposalReason(value) ? value : 'manual';
}

async function queryPreDisposedAssets(
  kind: AssetKind,
  extraSelect = '',
): Promise<(PreDisposedQueryRow & { kind: AssetKind })[]> {
  const pool = getDbPool();
  const table = TABLE_BY_KIND[kind];
  const [rows] = await pool.query<PreDisposedQueryRow[]>(
    `SELECT a.asset_id, ${extraSelect} a.acc_code, a.model, a.brand, a.category, a.serial_num, a.status_id, a.PO_DATE, a.DO_DATE,
            pd.pre_disposal_id, pd.reason, pd.marked_at AS predisposed_at,
            u.email AS predisposed_email, u.oid AS predisposed_oid
     FROM \`${table}\` a
     INNER JOIN pre_disposal pd
       ON pd.asset_type = ?
      AND ${sqlUtf8AssetId('pd.asset_id')} = ${sqlUtf8AssetId('a.asset_id')}
      AND pd.status = 'pending'
     LEFT JOIN users u ON u.id = pd.marked_by
     ORDER BY pd.marked_at DESC, ${assetIdNewestYearFirstSql('a.asset_id')}`,
    [kind],
  );
  return rows.map((r) => ({ ...r, kind }));
}

function mapPreDisposedRow(r: PreDisposedQueryRow & { kind: AssetKind }): PreDisposedAsset {
  return {
    kind: r.kind,
    assetId: r.asset_id,
    assetIdOld: r.asset_id_old ?? null,
    model: r.model,
    brand: r.brand,
    category: r.category,
    serialNum: r.serial_num,
    statusId: r.status_id,
    poDate: formatDate(r.PO_DATE),
    doDate: formatDate(r.DO_DATE),
    preDisposalId: r.pre_disposal_id,
    accCode: r.acc_code ?? null,
    reason: mapPredisposalReason(r.reason),
    predisposedAt: formatDateTimeIso(r.predisposed_at),
    predisposedBy: r.predisposed_name?.trim() || r.predisposed_email?.trim() || null,
    imageWholeAsset: null,
    imageSerialNumber: null,
  };
}

export async function listPreDisposedAssets(): Promise<PreDisposedAsset[]> {
  const [laptop, av, network] = await Promise.all([
    queryPreDisposedAssets('laptop'),
    queryPreDisposedAssets('av', 'a.asset_id_old,'),
    queryPreDisposedAssets('network'),
  ]);
  const rows = [...laptop, ...av, ...network];
  await attachDisplayNames(rows, 'predisposed_oid', 'predisposed_name');
  const { attachPredisposedPictures } = await import('@backend/server/assets/predisposed-picture.server');
  return attachPredisposedPictures(rows.map(mapPreDisposedRow));
}

export async function getDisposalDashboardStats(): Promise<DisposalDashboardStats> {
  return getDisposalDashboardStatsFromTables();
}

async function markAssetPredisposed(
  input: MarkPredisposedAssetInput,
  staffId: string,
): Promise<void> {
  await withAssetPredisposalTransaction(async (conn) => {
    const table = TABLE_BY_KIND[input.kind];
    const [rows] = await conn.execute<
      (RowDataPacket & { status_id: number; PO_DATE: Date | string | null; DO_DATE: Date | string | null })[]
    >(`SELECT status_id, PO_DATE, DO_DATE FROM \`${table}\` WHERE asset_id = ?`, [input.assetId]);
    const row = rows[0];
    if (!row) {
      throw new Error('This asset could not be found. Refresh the page and check the asset ID.');
    }
    if (!isPredisposalEligibleStatus(row.status_id)) {
      throw new Error(
        'Only return assets can be marked as pre-disposed. Return deployed assets first, or choose a different asset.',
      );
    }

    await recordAssetPredisposed(conn, {
      kind: input.kind,
      assetId: input.assetId,
      staffId,
      reason: reasonFromAssetDates(formatDate(row.PO_DATE), formatDate(row.DO_DATE), 'manual'),
    });

    await conn.execute(`UPDATE \`${table}\` SET status_id = ? WHERE asset_id = ?`, [
      STATUS_ID.PRE_DISPOSED,
      input.assetId,
    ]);
  });
}

export async function markAssetsPredisposed(
  assets: MarkPredisposedAssetInput[],
  staffId: string,
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  for (const asset of assets) {
    try {
      await markAssetPredisposed(asset, staffId);
      updated += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'This asset could not be marked as pre-disposed.';
      errors.push(`${asset.kind} #${asset.assetId}: ${msg}`);
    }
  }
  return { updated, errors };
}

async function removeAssetFromPredisposal(
  input: MarkPredisposedAssetInput,
  staffId: string,
): Promise<void> {
  await withAssetPredisposalTransaction(async (conn) => {
    const table = TABLE_BY_KIND[input.kind];
    const [rows] = await conn.execute<(RowDataPacket & { status_id: number })[]>(
      `SELECT status_id FROM \`${table}\` WHERE asset_id = ?`,
      [input.assetId],
    );
    const row = rows[0];
    if (!row) {
      throw new Error('This asset could not be found. Refresh the page and check the asset ID.');
    }
    if (!isPreDisposedStatus(row.status_id)) {
      throw new Error('Only pre-disposed assets can be removed from the disposal queue.');
    }

    await recordAssetPredisposalRemoved(conn, {
      kind: input.kind,
      assetId: input.assetId,
      staffId,
    });

    await conn.execute(`UPDATE \`${table}\` SET status_id = ? WHERE asset_id = ?`, [
      STATUS_ID.RETURN,
      input.assetId,
    ]);
  });
}

export async function removeAssetsFromPredisposal(
  assets: MarkPredisposedAssetInput[],
  staffId: string,
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  for (const asset of assets) {
    try {
      await removeAssetFromPredisposal(asset, staffId);
      updated += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'This asset could not be removed from the queue.';
      errors.push(`${asset.kind} #${asset.assetId}: ${msg}`);
    }
  }
  return { updated, errors };
}

type TimedRow = { created_at?: Date | string | null; updated_at?: Date | string | null };

function trailSortKey(val: Date | string | null | undefined): number {
  if (val == null) return 0;
  const d = val instanceof Date ? val : new Date(val);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function trailAt(val: Date | string | null | undefined): string {
  if (val == null) return '';
  return val instanceof Date ? val.toISOString() : String(val);
}

function pushTrail(events: AssetTrailEvent[], event: Omit<AssetTrailEvent, 'sortKey'> & { sortKey?: number }) {
  const sortKey = event.sortKey ?? trailSortKey(event.at);
  events.push({ ...event, sortKey, at: event.at || new Date(sortKey).toISOString() });
}

async function listRequestTrails(assetId: AssetId): Promise<AssetTrailEvent[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<
    (RowDataPacket & {
      assignment_id: number;
      assigned_at: Date | string | null;
      checkout_at: Date | string | null;
      returned_at: Date | string | null;
      return_condition: string | null;
      request_id: number;
      requester_oid: string | null;
      requester_name: string;
      asset_type: string | null;
      booked_oid: string | null;
      booked_by: string | null;
      created_at: Date | string;
    })[]
  >(
    `SELECT ra.assignment_id, ra.assigned_at, ra.checkout_at, ra.returned_at, ra.return_condition,
            ra.created_at, r.request_id, u.oid AS requester_oid, ri.asset_type,
            ub.oid AS booked_oid
     FROM request_assignment ra
     INNER JOIN request r ON r.request_id = ra.request_id
     INNER JOIN users u ON u.id = r.requested_by
     LEFT JOIN users ub ON ub.id = ra.assigned_by
     LEFT JOIN request_item ri ON ri.request_item_id = ra.request_item_id
     WHERE ra.asset_id = ?
     ORDER BY ra.assignment_id`,
    [assetId],
  );
  await attachDisplayNames(rows, 'requester_oid', 'requester_name');
  await attachDisplayNames(rows, 'booked_oid', 'booked_by');

  const events: AssetTrailEvent[] = [];
  for (const row of rows) {
    const base = `Request #${row.request_id} · ${row.requester_name}${row.asset_type ? ` · ${row.asset_type}` : ''}`;
    if (row.assigned_at) {
      pushTrail(events, {
        at: trailAt(row.assigned_at),
        category: 'Borrow request',
        title: 'Booked',
        detail: [base, row.booked_by ? `by ${row.booked_by}` : null].filter(Boolean).join(' · '),
        requestId: row.request_id,
      });
    }
    if (row.checkout_at) {
      pushTrail(events, {
        at: trailAt(row.checkout_at),
        category: 'Borrow request',
        title: 'Checked out',
        detail: base,
        requestId: row.request_id,
      });
    }
    if (row.returned_at) {
      pushTrail(events, {
        at: trailAt(row.returned_at),
        category: 'Borrow request',
        title: 'Returned',
        detail: [base, row.return_condition].filter(Boolean).join(' · '),
        requestId: row.request_id,
      });
    }
  }
  return events;
}

async function listLaptopTrails(assetId: AssetId): Promise<AssetTrailEvent[]> {
  const pool = getDbPool();
  const events: AssetTrailEvent[] = [];

  const [handovers] = await pool.query<
    (RowDataPacket & {
      handover_id: number;
      handover_date: Date | string;
      handover_remarks: string | null;
      building: string | null;
      level: string | null;
      zone: string | null;
      handler: string | null;
      created_at: Date | string;
      technician_oid: string | null;
      technician_name: string;
      recipients: string | null;
    })[]
  >(
    `SELECT h.handover_id, h.handover_date, h.handover_remarks, h.building, h.level, h.zone, h.handler,
            h.created_at, tech.oid AS technician_oid,
            GROUP_CONCAT(DISTINCT s.full_name ORDER BY s.full_name SEPARATOR ', ') AS recipients
     FROM handover h
     INNER JOIN users tech ON tech.id = h.user_id
     LEFT JOIN handover_staff hs ON hs.handover_id = h.handover_id
     LEFT JOIN staff s ON s.employee_no = hs.employee_no
     WHERE h.asset_id = ?
     GROUP BY h.handover_id, h.handover_date, h.handover_remarks, h.building, h.level, h.zone, h.handler,
              h.created_at, tech.oid
     ORDER BY h.handover_id`,
    [assetId],
  );
  await attachDisplayNames(handovers, 'technician_oid', 'technician_name');

  for (const h of handovers) {
    const when = trailAt(h.handover_date) || trailAt(h.created_at);
    const loc = [h.building, h.level, h.zone].filter(Boolean).join(' · ');
    const to = h.recipients?.trim()
      ? `To ${h.recipients}`
      : loc
        ? `Place · ${loc}`
        : 'Place / room handover';
    pushTrail(events, {
      at: when,
      category: 'Handover',
      title: 'Handed over',
      detail: [
        to,
        h.handler ? `handler ${h.handler}` : null,
        h.technician_name ? `by ${h.technician_name}` : null,
        h.handover_remarks,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  const [returns] = await pool.query<
    (RowDataPacket & {
      return_date: Date | string;
      return_time: string | null;
      return_place: string | null;
      condition: string | null;
      return_remarks: string | null;
      created_at: Date | string;
      returned_oid: string | null;
      returned_by: string;
      recipient_label: string | null;
    })[]
  >(
    `SELECT hr.return_date, hr.return_time, hr.return_place, hr.\`condition\`, hr.return_remarks, hr.created_at,
            ub.oid AS returned_oid,
            COALESCE(s.full_name, 'Place handover') AS recipient_label
     FROM handover_return hr
     INNER JOIN users ub ON ub.id = hr.returned_by
     LEFT JOIN handover_staff hs ON hs.handover_staff_id = hr.handover_staff_id
     LEFT JOIN staff s ON s.employee_no = hs.employee_no
     LEFT JOIN handover h ON h.handover_id = COALESCE(hs.handover_id, hr.handover_id)
     WHERE h.asset_id = ?
     ORDER BY hr.return_id`,
    [assetId],
  );
  await attachDisplayNames(returns, 'returned_oid', 'returned_by');

  for (const r of returns) {
    const at = sqlDateToIso(r.return_date) || trailAt(r.created_at);
    pushTrail(events, {
      at,
      category: 'Handover',
      title: 'Returned',
      detail: [
        r.recipient_label,
        r.return_place,
        r.condition,
        r.return_remarks,
        `by ${r.returned_by}`,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  return events;
}

async function listPlaceDeployTrails(
  kind: 'av' | 'network',
  assetId: AssetId,
): Promise<AssetTrailEvent[]> {
  const pool = getDbPool();
  const deployTable = kind === 'av' ? 'av_deployment' : 'network_deployment';
  const returnTable = kind === 'av' ? 'av_return' : 'network_return';
  const label = kind === 'av' ? 'AV deployment' : 'Network deployment';
  const events: AssetTrailEvent[] = [];

  const [deployments] = await pool.query<
    (RowDataPacket & {
      deployment_id: number;
      building: string;
      level: string;
      zone: string;
      deployment_date: Date | string;
      deployment_remarks: string | null;
      created_at: Date | string;
      staff_oid: string | null;
      staff_name: string;
    })[]
  >(
    `SELECT d.deployment_id, d.building, d.level, d.zone, d.deployment_date, d.deployment_remarks,
            d.created_at, u.oid AS staff_oid
     FROM \`${deployTable}\` d
     INNER JOIN users u ON u.id = d.user_id
     WHERE d.asset_id = ?
     ORDER BY d.deployment_id`,
    [assetId],
  );
  await attachDisplayNames(deployments, 'staff_oid', 'staff_name');

  for (const d of deployments) {
    const loc = [d.building, d.level, d.zone].filter(Boolean).join(' · ');
    pushTrail(events, {
      at: trailAt(d.deployment_date) || trailAt(d.created_at),
      category: label,
      title: 'Deployed',
      detail: [loc, d.staff_name ? `by ${d.staff_name}` : null, d.deployment_remarks]
        .filter(Boolean)
        .join(' · '),
    });
  }

  const [returns] = await pool.query<
    (RowDataPacket & {
      return_date: Date | string;
      return_time: string | null;
      return_place: string | null;
      condition: string | null;
      return_remarks: string | null;
      created_at: Date | string;
      returned_oid: string | null;
      returned_by: string;
      building: string;
      level: string;
      zone: string;
    })[]
  >(
    `SELECT r.return_date, r.return_time, r.return_place, r.\`condition\`, r.return_remarks, r.created_at,
            ub.oid AS returned_oid, d.building, d.level, d.zone
     FROM \`${returnTable}\` r
     INNER JOIN \`${deployTable}\` d ON d.deployment_id = r.deployment_id
     INNER JOIN users ub ON ub.id = r.returned_by
     WHERE d.asset_id = ?
     ORDER BY r.return_id`,
    [assetId],
  );
  await attachDisplayNames(returns, 'returned_oid', 'returned_by');

  for (const r of returns) {
    const loc = [r.building, r.level, r.zone].filter(Boolean).join(' · ');
    const at = sqlDateToIso(r.return_date) || trailAt(r.created_at);
    pushTrail(events, {
      at,
      category: label,
      title: 'Returned',
      detail: [loc, r.return_place, r.condition, r.return_remarks, `by ${r.returned_by}`]
        .filter(Boolean)
        .join(' · '),
    });
  }

  return events;
}

async function listMaintenanceTrails(kind: AssetKind, assetId: AssetId): Promise<AssetTrailEvent[]> {
  const pool = getDbPool();
  const events: AssetTrailEvent[] = [];

  const [repairs] = await pool.query<
    (RowDataPacket & {
      repair_date: Date | string;
      issue_summary: string;
      repair_remarks: string | null;
      created_at: Date | string;
      staff_oid: string | null;
      staff_email: string | null;
    })[]
  >(
    `SELECT r.repair_date, r.issue_summary, r.repair_remarks, r.created_at,
            u.oid AS staff_oid, u.email AS staff_email
     FROM repair r
     INNER JOIN users u ON u.id = r.user_id
     WHERE r.asset_type = ? AND r.asset_id = ?
     ORDER BY r.repair_id`,
    [kind, assetId],
  );

  for (const row of repairs) {
    const attendedBy = await getDisplayNameByOid(row.staff_oid, row.staff_email);
    pushTrail(events, {
      at: trailAt(row.repair_date) || trailAt(row.created_at),
      category: 'Repair',
      title: 'Repair logged',
      detail: [row.issue_summary, row.repair_remarks].filter(Boolean).join(' · ') || null,
      actor: attendedBy || null,
    });
  }

  const [claims] = await pool.query<
    (RowDataPacket & {
      claim_date: Date | string;
      claim_time: string | null;
      issue_summary: string;
      claim_remarks: string | null;
      created_at: Date | string;
      claimed_oid: string | null;
      claimed_email: string | null;
    })[]
  >(
    `SELECT c.claim_date, c.claim_time, c.issue_summary, c.claim_remarks, c.created_at,
            u.oid AS claimed_oid, u.email AS claimed_email
     FROM warranty_claim c
     INNER JOIN users u ON u.id = c.claimed_by
     WHERE c.asset_type = ? AND c.asset_id = ?
     ORDER BY c.claim_id`,
    [kind, assetId],
  );

  for (const c of claims) {
    const attendedBy = await getDisplayNameByOid(c.claimed_oid, c.claimed_email);
    const at = sqlDateToIso(c.claim_date) || trailAt(c.created_at);
    pushTrail(events, {
      at,
      category: 'Warranty',
      title: 'Warranty claim',
      detail: [c.issue_summary, c.claim_remarks].filter(Boolean).join(' · ') || null,
      actor: attendedBy || null,
    });
  }

  return events;
}

export async function getAssetDetail(kind: AssetKind, assetId: AssetId): Promise<AssetDetailResponse | null> {
  const pool = getDbPool();

  if (kind === 'laptop') {
    const [rows] = await pool.query<(LaptopRow & TimedRow & { status_name: string })[]>(
      `SELECT l.*, s.name AS status_name
       FROM laptop l
       INNER JOIN status s ON s.status_id = l.status_id
       WHERE l.asset_id = ?`,
      [assetId],
    );
    const row = rows[0];
    if (!row) return null;
    const asset: AssetDetail = {
      ...mapLaptop(row),
      statusName: row.status_name,
      createdAt: trailAt(row.created_at),
      updatedAt: trailAt(row.updated_at),
    };
    const trails = await buildAssetTrails(kind, assetId, asset.createdAt);
    return { asset, trails };
  }

  if (kind === 'av') {
    const [rows] = await pool.query<(AvRow & TimedRow & { status_name: string })[]>(
      `SELECT a.*, s.name AS status_name
       FROM av a
       INNER JOIN status s ON s.status_id = a.status_id
       WHERE a.asset_id = ?`,
      [assetId],
    );
    const row = rows[0];
    if (!row) return null;
    const asset: AssetDetail = {
      ...mapAv(row),
      statusName: row.status_name,
      createdAt: trailAt(row.created_at),
      updatedAt: trailAt(row.updated_at),
    };
    const trails = await buildAssetTrails(kind, assetId, asset.createdAt);
    return { asset, trails };
  }

  const [rows] = await pool.query<(NetworkRow & TimedRow & { status_name: string })[]>(
    `SELECT n.*, s.name AS status_name
     FROM network n
     INNER JOIN status s ON s.status_id = n.status_id
     WHERE n.asset_id = ?`,
    [assetId],
  );
  const row = rows[0];
  if (!row) return null;
  const asset: AssetDetail = {
    ...mapNetwork(row),
    statusName: row.status_name,
    createdAt: trailAt(row.created_at),
    updatedAt: trailAt(row.updated_at),
  };
  const trails = await buildAssetTrails(kind, assetId, asset.createdAt);
  return { asset, trails };
}

/** Looks up which table an asset ID actually belongs to (DB-driven, no prefix guesswork). */
export async function findAssetKindByAssetId(assetId: AssetId): Promise<AssetKind | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 'laptop' AS kind FROM laptop WHERE asset_id = ?
     UNION ALL
     SELECT 'av' AS kind FROM av WHERE asset_id = ?
     UNION ALL
     SELECT 'network' AS kind FROM network WHERE asset_id = ?
     LIMIT 1`,
    [assetId, assetId, assetId],
  );
  const kind = rows[0]?.kind as AssetKind | undefined;
  return kind ?? null;
}

/** Resolves an asset by its current asset ID, checking every asset table. */
export async function findAssetByAnyId(assetId: AssetId): Promise<AssetDetailResponse | null> {
  const kind = await findAssetKindByAssetId(assetId);
  if (!kind) return null;
  return getAssetDetail(kind, assetId);
}

/** AV equipment carries over a legacy `asset_id_old` label from before the current ID scheme. */
export async function findAvAssetByOldId(oldId: string): Promise<AssetDetailResponse | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT asset_id FROM av WHERE asset_id_old = ? LIMIT 1`,
    [oldId],
  );
  const assetId = rows[0]?.asset_id as number | undefined;
  if (assetId == null) return null;
  return getAssetDetail('av', assetId);
}

/** Scan/search entry point: tries the current asset ID first, then falls back to AV's legacy old ID. */
export async function findAssetByCode(code: string): Promise<AssetDetailResponse | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const byExact = await findAssetByAnyId(trimmed);
  if (byExact) return byExact;

  const digits = trimmed.replace(/\D/g, '');
  if (digits && digits !== trimmed) {
    const byDigits = await findAssetByAnyId(digits);
    if (byDigits) return byDigits;
  }

  return findAvAssetByOldId(trimmed);
}

/** Full lifecycle trail for export / reporting (newest first). */
export async function getAssetTrailEvents(
  kind: AssetKind,
  assetId: AssetId,
  createdAt: string | null = null,
): Promise<AssetTrailEvent[]> {
  return buildAssetTrails(kind, assetId, createdAt);
}

async function buildAssetTrails(
  kind: AssetKind,
  assetId: AssetId,
  createdAt: string | null,
): Promise<AssetTrailEvent[]> {
  const events: AssetTrailEvent[] = [];

  if (createdAt) {
    pushTrail(events, {
      at: createdAt,
      category: 'Inventory',
      title: 'Registered',
      detail: `${ASSET_KIND_LABEL_FOR_TRAIL[kind]} #${assetId} added to inventory`,
    });
  }

  const chunks = await Promise.all([
    kind === 'laptop' ? listLaptopTrails(assetId) : listPlaceDeployTrails(kind, assetId),
    listRequestTrails(assetId),
    listMaintenanceTrails(kind, assetId),
  ]);

  for (const chunk of chunks) {
    events.push(...chunk);
  }

  return events.sort((a, b) => b.sortKey - a.sortKey);
}

const ASSET_KIND_LABEL_FOR_TRAIL: Record<AssetKind, string> = {
  laptop: 'Laptop',
  av: 'AV',
  network: 'Network',
};
