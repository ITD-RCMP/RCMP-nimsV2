/** Types and constants aligned with database/schema.sql */

import type { WarrantyInput } from '@/lib/warranty-field-utils';

export type { WarrantyInput };
export { WARRANTY_FIELD_COLUMNS } from '@/lib/warranty-field-utils';

export type AssetKind = 'laptop' | 'av' | 'network';

export type AssetId = string | number;

export function parseAssetKindParam(raw: unknown): AssetKind | null {
  return raw === 'laptop' || raw === 'av' || raw === 'network' ? raw : null;
}

export function parseAssetIdParam(raw: unknown): string | null {
  const assetId = String(raw ?? '').trim();
  if (!assetId || assetId.length > 32) return null;
  if (/^\d+(?: \([A-Za-z0-9][A-Za-z0-9_-]*\))?$/.test(assetId)) return assetId;
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(assetId)) return assetId;
  return null;
}

export function sameAssetId(a: AssetId, b: AssetId): boolean {
  return String(a) === String(b);
}

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  laptop: 'Laptop / Desktop',
  av: 'AV equipment',
  network: 'Network equipment',
};

export const ASSET_LIST_PATH: Record<AssetKind, string> = {
  laptop: '/technician/laptop',
  av: '/technician/av',
  network: '/technician/network',
};

/** Columns shared by laptop, network, av (schema PO_* / purchase) */
export const PURCHASE_FIELD_COLUMNS = [
  'po_date',
  'po_num',
  'do_date',
  'do_num',
  'invoice_date',
  'invoice_num',
  'purchase_cost',
] as const;

export type PurchaseFields = {
  poDate?: string | null;
  poNum?: string | null;
  doDate?: string | null;
  doNum?: string | null;
  invoiceDate?: string | null;
  invoiceNum?: string | null;
  purchaseCost?: number | null;
};

export const ACC_CODE_OPTIONS = [
  { value: '200-0500', label: 'IT & AV - asset' },
  { value: '992-000', label: 'IT & Audio - inventory' },
] as const;

export type AccCode = (typeof ACC_CODE_OPTIONS)[number]['value'];

export function isValidAccCode(value: string): value is AccCode {
  return ACC_CODE_OPTIONS.some((opt) => opt.value === value);
}

export function formatAccCodeDisplay(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const opt = ACC_CODE_OPTIONS.find((o) => o.value === code);
  return opt ? `${opt.value} (${opt.label})` : code;
}

/** CSV / form fields marked required in schema COMMENT */
/** asset_id omitted — auto-generated when CSV cell is blank (see assetid-flow.md). */
export const BULK_IMPORT_REQUIRED: Record<AssetKind, readonly string[]> = {
  laptop: ['serial_num', 'category', 'status_id'],
  network: ['status_id'],
  av: ['status_id'],
};

export const INVENTORY_STATUSES = [
  { statusId: 1, name: 'new' },
  { statusId: 2, name: 'return' },
  { statusId: 3, name: 'deploy' },
  { statusId: 4, name: 'pre-disposed' },
  { statusId: 5, name: 'disposed' },
  { statusId: 6, name: 'active (request)' },
  { statusId: 7, name: 'booked (request)' },
  { statusId: 8, name: 'checkout (request)' },
] as const;

export type StatusId = (typeof INVENTORY_STATUSES)[number]['statusId'];

export function getStatusName(statusId: number): string {
  return INVENTORY_STATUSES.find((s) => s.statusId === statusId)?.name ?? `status ${statusId}`;
}

export function formatStatusLabel(statusId: number): string {
  return getStatusName(statusId).replace(/_/g, ' ');
}

export type LaptopAsset = {
  kind: 'laptop';
  assetId: AssetId;
  accCode: string | null;
  serialNum: string | null;
  brand: string | null;
  model: string | null;
  supplier: string | null;
  category: string | null;
  partNumber: string | null;
  processor: string | null;
  memory: string | null;
  os: string | null;
  storage: string | null;
  gpu: string | null;
  statusId: number;
  remarks: string | null;
  recipientDivision: string | null;
  recipientName: string | null;
  placeHandler: string | null;
  placeBuilding: string | null;
  placeLevel: string | null;
  placeZone: string | null;
  placeHandoverRemarks: string | null;
  registeredAt: string | null;
  registeredBy: string | null;
  proposedAt: string | null;
  proposedBy: string | null;
} & PurchaseFields;

export const LAPTOP_ASSIGNMENT_BUCKETS = ['Services', 'Academic', 'Facility'] as const;

export type LaptopAssignmentBucket = (typeof LAPTOP_ASSIGNMENT_BUCKETS)[number];

export function isFacilityAssignment(asset: Pick<LaptopAsset, 'placeHandler'>): boolean {
  return Boolean(asset.placeHandler?.trim());
}

export function matchesAssignmentBucket(
  asset: Pick<LaptopAsset, 'recipientDivision' | 'placeHandler'>,
  bucket: LaptopAssignmentBucket,
): boolean {
  if (bucket === 'Facility') return isFacilityAssignment(asset);
  return asset.recipientDivision === bucket;
}

export type PlaceFields = {
  building: string | null;
  level: string | null;
  zone: string | null;
};

export type AvAsset = {
  kind: 'av';
  assetId: AssetId;
  accCode: string | null;
  assetIdOld: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  supplier: string | null;
  serialNum: string | null;
  statusId: number;
  remarks: string | null;
} & PlaceFields &
  PurchaseFields;

export type NetworkAsset = {
  kind: 'network';
  assetId: AssetId;
  accCode: string | null;
  category: string | null;
  serialNum: string | null;
  brand: string | null;
  model: string | null;
  supplier: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  statusId: number;
  remarks: string | null;
} & PlaceFields &
  PurchaseFields;

export type CreateLaptopInput = {
  assetId: string | number;
  accCode?: string | null;
  serialNum: string;
  brand?: string | null;
  model?: string | null;
  supplier?: string | null;
  category: string;
  partNumber?: string | null;
  processor?: string | null;
  memory?: string | null;
  os?: string | null;
  storage?: string | null;
  gpu?: string | null;
  statusId: number;
  remarks?: string | null;
  warranty?: WarrantyInput | null;
} & PurchaseFields;

export type CreateAvInput = {
  assetId: AssetId;
  accCode?: string | null;
  assetIdOld?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  supplier?: string | null;
  serialNum?: string | null;
  statusId: number;
  remarks?: string | null;
  warranty?: WarrantyInput | null;
} & PurchaseFields;

export type CreateNetworkInput = {
  assetId: AssetId;
  accCode?: string | null;
  category?: string | null;
  serialNum?: string | null;
  brand?: string | null;
  model?: string | null;
  supplier?: string | null;
  macAddress?: string | null;
  ipAddress?: string | null;
  statusId: number;
  remarks?: string | null;
  warranty?: WarrantyInput | null;
} & PurchaseFields;

export type UpdateLaptopInput = Omit<CreateLaptopInput, 'assetId' | 'statusId' | 'warranty'>;
export type UpdateAvInput = Omit<CreateAvInput, 'assetId' | 'statusId' | 'warranty'>;
export type UpdateNetworkInput = Omit<CreateNetworkInput, 'assetId' | 'statusId' | 'warranty'>;

export type UpdateAssetInput =
  | ({ kind: 'laptop'; assetId: AssetId } & UpdateLaptopInput)
  | ({ kind: 'av'; assetId: AssetId } & UpdateAvInput)
  | ({ kind: 'network'; assetId: AssetId } & UpdateNetworkInput);

export type AssetRecord = LaptopAsset | AvAsset | NetworkAsset;

export type AssetTrailEvent = {
  at: string;
  sortKey: number;
  category: string;
  title: string;
  detail: string | null;
  actor?: string | null;
  requestId?: number | null;
};

export type AssetDetailMeta = {
  statusName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AssetDetail = AssetRecord & AssetDetailMeta;

export type AssetDetailResponse = {
  asset: AssetDetail;
  trails: AssetTrailEvent[];
};

/** status_id = deploy — handover / deployment columns become required on import */
export const BULK_IMPORT_STATUS_DEPLOY = 3;

/** Laptop staff handover (`handover` + `handover_staff`) — used when status_id is 3 */
export const BULK_LAPTOP_HANDOVER_COLUMNS = [
  'handover_staff_id',
  'handover_date',
  'handover_remarks',
  'employee_no',
] as const;

/** Laptop facility / place handover (`handover.building` / `handler`) — used when status_id is 3 */
export const BULK_LAPTOP_PLACE_COLUMNS = ['building', 'level', 'zone', 'handler'] as const;

/** AV / network deployment — required when status_id is 3 */
export const BULK_PLACE_DEPLOYMENT_COLUMNS = [
  'deployment_staff_id',
  'building',
  'level',
  'zone',
  'deployment_date',
  'deployment_remarks',
] as const;

export const BULK_LAPTOP_HANDOVER_REQUIRED = ['handover_staff_id', 'handover_date'] as const;

export const BULK_PLACE_DEPLOYMENT_REQUIRED = ['deployment_staff_id', 'building'] as const;

export type BulkLaptopHandoverImport = {
  /** User email from CSV column handover_staff_id */
  handoverStaffEmail: string;
  handoverDate: string;
  handoverRemarks: string | null;
  employeeNo: string | null;
  building?: string | null;
  level?: string | null;
  zone?: string | null;
  handler?: string | null;
};

export type BulkPlaceDeploymentImport = {
  /** User email from CSV column deployment_staff_id */
  deploymentStaffEmail: string;
  building: string;
  level: string;
  zone: string;
  deploymentDate: string;
  deploymentRemarks: string | null;
};

export const BULK_IMPORT_COLUMNS: Record<AssetKind, readonly string[]> = {
  laptop: [
    'asset_id',
    'tagging',
    'acc_code',
    'serial_num',
    'brand',
    'model',
    'supplier',
    'category',
    'part_number',
    'processor',
    'memory',
    'os',
    'storage',
    'gpu',
    ...PURCHASE_FIELD_COLUMNS,
    'status_id',
    'remarks',
    'warranty_start_date',
    'warranty_end_date',
    'warranty_remarks',
    ...BULK_LAPTOP_HANDOVER_COLUMNS,
    ...BULK_LAPTOP_PLACE_COLUMNS,
  ],
  av: [
    'asset_id',
    'tagging',
    'acc_code',
    'asset_id_old',
    'category',
    'brand',
    'model',
    'supplier',
    'serial_num',
    ...PURCHASE_FIELD_COLUMNS,
    'status_id',
    'remarks',
    'warranty_start_date',
    'warranty_end_date',
    'warranty_remarks',
    ...BULK_PLACE_DEPLOYMENT_COLUMNS,
  ],
  network: [
    'asset_id',
    'tagging',
    'acc_code',
    'category',
    'serial_num',
    'brand',
    'model',
    'supplier',
    'mac_address',
    'ip_address',
    ...PURCHASE_FIELD_COLUMNS,
    'status_id',
    'remarks',
    'warranty_start_date',
    'warranty_end_date',
    'warranty_remarks',
    ...BULK_PLACE_DEPLOYMENT_COLUMNS,
  ],
};

export function bulkImportDeployColumns(kind: AssetKind): readonly string[] {
  return kind === 'laptop'
    ? [...BULK_LAPTOP_HANDOVER_COLUMNS, ...BULK_LAPTOP_PLACE_COLUMNS]
    : BULK_PLACE_DEPLOYMENT_COLUMNS;
}

export function bulkImportDeployRequiredColumns(kind: AssetKind): readonly string[] {
  if (kind !== 'laptop') return BULK_PLACE_DEPLOYMENT_REQUIRED;
  return [
    ...BULK_LAPTOP_HANDOVER_REQUIRED,
    'employee_no',
    ...BULK_LAPTOP_PLACE_COLUMNS.filter((column) => column === 'building' || column === 'handler'),
  ];
}

/** Columns for importing assets without creating a handover / deployment record. */
export function bulkImportAssetOnlyColumns(kind: AssetKind): readonly string[] {
  const deployColumns = new Set<string>(bulkImportDeployColumns(kind));
  return BULK_IMPORT_COLUMNS[kind].filter((column) => !deployColumns.has(column));
}

export function bulkImportHandoverTemplateColumns(kind: AssetKind): readonly string[] {
  if (kind !== 'laptop') return BULK_IMPORT_COLUMNS[kind];
  const place = new Set<string>(BULK_LAPTOP_PLACE_COLUMNS);
  return BULK_IMPORT_COLUMNS.laptop.filter((column) => !place.has(column));
}

export function bulkImportPlaceTemplateColumns(kind: AssetKind): readonly string[] {
  if (kind !== 'laptop') return BULK_IMPORT_COLUMNS[kind];
  const staffOnly = new Set<string>(['employee_no']);
  return BULK_IMPORT_COLUMNS.laptop.filter((column) => !staffOnly.has(column));
}

export type BulkImportTemplateVariant = 'asset' | 'deploy' | 'place';

export function bulkImportTemplateColumns(
  kind: AssetKind,
  variant: BulkImportTemplateVariant,
): readonly string[] {
  if (variant === 'place') return bulkImportPlaceTemplateColumns(kind);
  if (variant === 'deploy') return bulkImportHandoverTemplateColumns(kind);
  return bulkImportAssetOnlyColumns(kind);
}

export function bulkImportTemplateStatusId(variant: BulkImportTemplateVariant): number {
  return variant === 'asset' ? 1 : BULK_IMPORT_STATUS_DEPLOY;
}

export function bulkImportTemplateRequiredColumns(
  kind: AssetKind,
  variant: BulkImportTemplateVariant,
): readonly string[] {
  const required = new Set<string>(BULK_IMPORT_REQUIRED[kind]);
  if (variant === 'deploy') {
    if (kind === 'laptop') {
      for (const column of BULK_LAPTOP_HANDOVER_REQUIRED) required.add(column);
      required.add('employee_no');
    } else {
      for (const column of BULK_PLACE_DEPLOYMENT_REQUIRED) required.add(column);
    }
  }
  if (variant === 'place') {
    for (const column of BULK_LAPTOP_HANDOVER_REQUIRED) required.add(column);
    required.add('building');
    required.add('handler');
  }
  return [...required];
}

/** In stock — on-site / available (new, return, or reserved for a request). */
export const INSTOCK_STATUS_IDS = [1, 2, 6, 7] as const;

/** Out of stock — deployed, pre-disposed, disposed, or checked out to a user. */
export const OUTSTOCK_STATUS_IDS = [3, 4, 5, 8] as const;

const INSTOCK_SET = new Set<number>(INSTOCK_STATUS_IDS);
const OUTSTOCK_SET = new Set<number>(OUTSTOCK_STATUS_IDS);

export function isInstockStatus(statusId: number): boolean {
  return INSTOCK_SET.has(statusId);
}

export function isOutstockStatus(statusId: number): boolean {
  return OUTSTOCK_SET.has(statusId);
}

export function assetViewPath(kind: AssetKind, assetId: AssetId): string {
  return `/technician/asset/${kind}/${encodeURIComponent(String(assetId))}`;
}

export function isBulkImportRequiredColumn(kind: AssetKind, column: string): boolean {
  return BULK_IMPORT_REQUIRED[kind].includes(column);
}
