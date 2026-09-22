import { useCallback, useState } from 'react';
import {
  ACC_CODE_OPTIONS,
  BULK_IMPORT_COLUMNS,
  BULK_IMPORT_REQUIRED,
  BULK_IMPORT_STATUS_DEPLOY,
  INVENTORY_STATUSES,
  bulkImportDeployColumns,
  bulkImportDeployRequiredColumns,
  bulkImportTemplateColumns,
  bulkImportTemplateStatusId,
  isValidAccCode,
  type AssetKind,
  type BulkImportTemplateVariant,
  type BulkLaptopHandoverImport,
  type BulkPlaceDeploymentImport,
  type CreateAvInput,
  type CreateLaptopInput,
  type CreateNetworkInput,
} from '@shared/lib/inventory-schema';
import { canonicalizeLaptopCategory, composeAssetId, getLaptopAssetIdPrefix, isValidAssetTag, LAPTOP_CATEGORY_OPTIONS, normalizeAssetTag, STORED_ASSET_ID_PATTERN } from '@/hooks/assetid-generator';
import { parseOptionalDate, parsePurchaseFromRow } from '@shared/lib/purchase-field-utils';
import { parseWarrantyFromRow } from '@/lib/warranty-field-utils';
import {
  bulkCreateAvImportFn,
  bulkCreateLaptopsImportFn,
  bulkCreateNetworkImportFn,
} from '@backend/server/assets/assets.functions';

export type BulkLaptopImportRow = Omit<CreateLaptopInput, 'assetId'> & {
  assetId?: string | number;
  tagging?: string | null;
  handover?: BulkLaptopHandoverImport;
};

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

export type BulkImportRowError = {
  row: number;
  message: string;
};

export type BulkImportPreview = {
  kind: AssetKind;
  headers: string[];
  validCount: number;
  errorCount: number;
  errors: BulkImportRowError[];
  laptopRows?: BulkLaptopImportRow[];
  avRows?: BulkAvImportRow[];
  networkRows?: BulkNetworkImportRow[];
};

export {
  ACC_CODE_OPTIONS,
  BULK_IMPORT_COLUMNS,
  BULK_IMPORT_REQUIRED,
  BULK_IMPORT_STATUS_DEPLOY,
  bulkImportDeployColumns,
  bulkImportDeployRequiredColumns,
  LAPTOP_CATEGORY_OPTIONS,
};

const VALID_STATUS_IDS = new Set(INVENTORY_STATUSES.map((s) => s.statusId));

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(columns: readonly string[], records: Record<string, string>[]): string {
  const header = columns.join(',');
  const lines = records.map((record) => columns.map((col) => csvEscape(record[col] ?? '')).join(','));
  return [header, ...lines].join('\n');
}

const MOCK_CSV: Record<AssetKind, string> = {
  laptop: toCsv(BULK_IMPORT_COLUMNS.laptop, [
    {
      acc_code: '200-0500',
      tagging: 'RMK',
      serial_num: 'DL-5450-001',
      brand: 'Dell',
      model: 'Latitude 5450',
      supplier: 'Dell',
      category: 'Notebook',
      part_number: 'PN-5450',
      processor: 'Intel i5-1345U',
      memory: '16GB',
      os: 'Windows 11',
      storage: '512GB',
      po_date: '15/1/24',
      po_num: 'PO-2024-001',
      do_date: '1/2/24',
      do_num: 'DO-9001',
      invoice_date: '10/2/24',
      invoice_num: 'INV-7788',
      purchase_cost: '1299.00',
      status_id: '1',
      remarks: 'HQ staging (auto 12-xx-xxx)',
    },
    {
      acc_code: '200-0500',
      serial_num: 'HP-DEPLOY-01',
      brand: 'HP',
      model: 'EliteBook 840',
      supplier: 'HP',
      category: 'Notebook',
      processor: 'Intel i7',
      memory: '16GB',
      os: 'Windows 11',
      storage: '512GB',
      status_id: '3',
      remarks: 'With user',
      handover_staff_id: 'tech@example.com',
      handover_date: '15/1/26',
      handover_remarks: 'Issued for project',
      employee_no: 'EMP10001',
    },
    {
      acc_code: '200-0500',
      serial_num: 'HP-PLACE-01',
      brand: 'HP',
      model: 'EliteDesk 800',
      supplier: 'HP',
      category: 'Desktop AIO',
      processor: 'Intel i5',
      memory: '16GB',
      os: 'Windows 11',
      storage: '512GB',
      status_id: '3',
      remarks: 'Training lab',
      handover_staff_id: 'tech@example.com',
      handover_date: '20/1/26',
      handover_remarks: 'Shared lab PC',
      building: 'Main',
      level: '2',
      zone: 'Lab A',
      handler: 'Lab technician',
    },
    {
      acc_code: '992-000',
      serial_num: 'LN-LEASE-001',
      brand: 'Lenovo',
      model: 'ThinkPad T14',
      supplier: 'Lenovo',
      category: 'Leasing Laptop',
      processor: 'Intel i7',
      memory: '16GB',
      os: 'Windows 11',
      storage: '512GB',
      po_date: '1/3/25',
      po_num: 'PO-LEASE-01',
      purchase_cost: '1099.00',
      status_id: '1',
      remarks: 'Leased fleet (auto 12-xx-xxx)',
    },
    {
      acc_code: '992-000',
      serial_num: 'DT-LEASE-001',
      brand: 'Dell',
      model: 'OptiPlex 7090',
      supplier: 'Dell',
      category: 'Leasing Desktop',
      processor: 'Intel i5',
      memory: '8GB',
      os: 'Windows 11',
      storage: '256GB',
      po_date: '1/3/25',
      po_num: 'PO-LEASE-02',
      purchase_cost: '899.00',
      status_id: '1',
      remarks: 'Leased desktop (auto 14-xx-xxx)',
    },
    {
      acc_code: '200-0500',
      serial_num: 'MON-OTHER-01',
      brand: 'Dell',
      model: 'P2723D',
      supplier: 'Dell',
      category: 'Docking Station',
      status_id: '1',
      remarks: 'Other category (auto 10-xx-xxx)',
    },
  ]),
  av: toCsv(BULK_IMPORT_COLUMNS.av, [
    {
      acc_code: '200-0500',
      asset_id: '8826001 (HALL)',
      asset_id_old: 'AV-LEG-001',
      category: 'display',
      brand: 'Samsung',
      model: 'QM65C',
      supplier: 'Samsung',
      serial_num: 'SM-QM65-100',
      po_date: '1/6/23',
      po_num: 'PO-AV-100',
      purchase_cost: '899.00',
      status_id: '1',
      remarks: 'Briefing B (auto 88-xx-xxx)',
    },
    {
      acc_code: '992-000',
      asset_id_old: 'AV-DEP-88',
      category: 'projector',
      brand: 'Epson',
      model: 'EB-L200F',
      supplier: 'Epson',
      serial_num: 'EPS-L200F-99',
      status_id: '3',
      remarks: 'Training room',
      deployment_staff_id: 'tech@example.com',
      building: 'Main',
      level: '-',
      zone: '-',
      deployment_date: '15/1/26',
      deployment_remarks: 'Installed in room',
    },
  ]),
  network: toCsv(BULK_IMPORT_COLUMNS.network, [
    {
      acc_code: '200-0500',
      tagging: 'RACK',
      category: 'switch',
      serial_num: 'CS-9200-24P',
      brand: 'Cisco',
      model: 'C9200-24P',
      supplier: 'Cisco',
      mac_address: '00:11:22:33:44:55',
      ip_address: '10.10.1.20',
      po_date: '10/3/23',
      po_num: 'PO-NET-55',
      do_date: '1/4/23',
      do_num: 'DO-N-12',
      purchase_cost: '4500.00',
      status_id: '7',
      remarks: 'Rack 2 (auto 24-xx-xxx)',
    },
    {
      acc_code: '992-000',
      category: 'AP',
      serial_num: 'SW-DEPLOY-01',
      brand: 'Aruba',
      model: 'AP-505',
      supplier: 'Aruba',
      mac_address: '00:aa:bb:cc:dd:ee',
      ip_address: '10.10.2.60',
      status_id: '3',
      remarks: 'IDF East',
      deployment_staff_id: 'tech@example.com',
      building: 'Annex',
      level: '-',
      zone: '-',
      deployment_date: '1/2/26',
      deployment_remarks: 'East wing',
    },
  ]),
};

const HEADER_ALIASES: Record<string, string> = {
  acccode: 'acc_code',
  accountcode: 'acc_code',
  assetid: 'asset_id',
  tagging: 'tagging',
  assetidold: 'asset_id_old',
  serialnum: 'serial_num',
  serialnumber: 'serial_num',
  partnumber: 'part_number',
  podate: 'po_date',
  ponum: 'po_num',
  ponumber: 'po_num',
  dodate: 'do_date',
  donum: 'do_num',
  invoicedate: 'invoice_date',
  invoicenum: 'invoice_num',
  invoicenumber: 'invoice_num',
  purchasecost: 'purchase_cost',
  statusid: 'status_id',
  warrantystartdate: 'warranty_start_date',
  warrantyenddate: 'warranty_end_date',
  warrantyremarks: 'warranty_remarks',
  handoverstaffid: 'handover_staff_id',
  handoverdate: 'handover_date',
  handoverremarks: 'handover_remarks',
  employeeno: 'employee_no',
  employeenumber: 'employee_no',
  deploymentstaffid: 'deployment_staff_id',
  deploymentdate: 'deployment_date',
  deploymentremarks: 'deployment_remarks',
  macaddress: 'mac_address',
  ipaddress: 'ip_address',
};

function normalizeHeader(h: string) {
  const n = h.trim().toLowerCase().replace(/\s+/g, '');
  return HEADER_ALIASES[n] ?? n;
}

function detectDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      break;
    } else if (!inQuotes && ch === ',') {
      commas += 1;
    } else if (!inQuotes && ch === ';') {
      semicolons += 1;
    }
  }
  return semicolons > commas ? ';' : ',';
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const src = text.replace(/^\uFEFF/, '');
  if (!src.trim()) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  const pushRow = () => {
    row.push(cur.trim());
    cur = '';
    if (row.some((cell) => cell.length > 0)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      if (inQuotes && src[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      pushRow();
    } else if (ch === '\r' || ch === '\n') {
      cur += ' ';
    } else {
      cur += ch;
    }
  }
  pushRow();

  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...data] = rows;
  return { headers, rows: data };
}

function parseStatusId(raw: string, row: number, errors: BulkImportRowError[]): number | null {
  const n = Number(raw.trim());
  if (!raw.trim() || Number.isNaN(n) || !VALID_STATUS_IDS.has(n as (typeof INVENTORY_STATUSES)[number]['statusId'])) {
    errors.push({
      row,
      message: `The status value "${raw}" is not recognized. Use a valid status from the import template.`,
    });
    return null;
  }
  return n;
}

function requireCell(row: string[], index: number | undefined, name: string, rowNum: number, errors: BulkImportRowError[]) {
  if (index === undefined || index < 0) {
    errors.push({ row: rowNum, message: `Required field "${name}" is empty. Fill in this column to continue.` });
    return '';
  }
  const val = row[index]?.trim() ?? '';
  if (!val) errors.push({ row: rowNum, message: `Required field "${name}" is empty. Fill in this column to continue.` });
  return val;
}

function parseOptionalAssetId(
  raw: string,
  rowNum: number,
  errors: BulkImportRowError[],
): string | undefined {
  const val = raw?.trim() ?? '';
  if (!val) return undefined;
  if (val.length > 32 || !STORED_ASSET_ID_PATTERN.test(val)) {
    errors.push({
      row: rowNum,
      message: 'Asset ID must look like 1226001 or 1226001 (RMK), or leave it blank to auto-generate one.',
    });
    return undefined;
  }
  return val;
}

function parseOptionalTagging(
  raw: string,
  rowNum: number,
  errors: BulkImportRowError[],
): string | null {
  const tag = normalizeAssetTag(raw);
  if (!tag) return null;
  if (!isValidAssetTag(tag)) {
    errors.push({
      row: rowNum,
      message: 'Tagging is optional. Use 1–16 letters, numbers, hyphens, or underscores, such as RMK.',
    });
    return null;
  }
  try {
    composeAssetId('1226001', tag);
  } catch (e) {
    errors.push({
      row: rowNum,
      message: e instanceof Error ? e.message : 'Tagging is not valid.',
    });
    return null;
  }
  return tag;
}

function optionalCell(row: string[], index: number | undefined) {
  if (index === undefined || index < 0) return null;
  const val = row[index]?.trim() ?? '';
  return val || null;
}

function parseAccCode(raw: string, rowNum: number, errors: BulkImportRowError[]): string | null {
  const val = raw.trim();
  if (!val) return null;
  if (!isValidAccCode(val)) {
    const allowed = ACC_CODE_OPTIONS.map((opt) => opt.value).join(' or ');
    errors.push({
      row: rowNum,
      message: `The account code "${raw}" is not recognized. Use ${allowed}.`,
    });
    return null;
  }
  return val;
}

function buildColumnIndex(
  headers: string[],
  required: readonly string[],
  errors: BulkImportRowError[],
) {
  const index = new Map<string, number>();
  headers.forEach((h, i) => index.set(normalizeHeader(h), i));

  for (const col of required) {
    if (!index.has(col)) {
      errors.push({ row: 0, message: `The CSV is missing a required column: "${col}". Use the template as a guide.` });
    }
  }
  return index;
}

function warnIfColumnsShifted(
  row: string[],
  col: Map<string, number>,
  rowNum: number,
  errors: BulkImportRowError[],
) {
  const statusIdx = col.get('status_id');
  if (statusIdx === undefined) return;
  if (row.length > statusIdx) return;
  errors.push({
    row: rowNum,
    message:
      'This row has fewer columns than the header, so status_id (and later fields) are empty. Quote any commas inside text, keep acc_code and supplier as their own columns, and re-download the latest template.',
  });
}

function rowHasErrors(errors: BulkImportRowError[], rowNum: number) {
  return errors.some((e) => e.row === rowNum);
}

function cellTrim(row: string[], col: Map<string, number>, name: string) {
  const idx = col.get(name);
  if (idx === undefined) return '';
  return row[idx]?.trim() ?? '';
}

function rejectDeployDataWhenNotDeployed(
  kind: AssetKind,
  statusId: number,
  row: string[],
  col: Map<string, number>,
  rowNum: number,
  errors: BulkImportRowError[],
) {
  if (statusId === BULK_IMPORT_STATUS_DEPLOY) return;
  for (const name of bulkImportDeployColumns(kind)) {
    if (cellTrim(row, col, name)) {
      errors.push({
        row: rowNum,
        message: `"${name}" is only used when the asset status is set to deployed. Remove it or change the status.`,
      });
    }
  }
}

function parseRequiredDate(
  row: string[],
  col: Map<string, number>,
  column: string,
  rowNum: number,
  errors: BulkImportRowError[],
): string | null {
  const raw = cellTrim(row, col, column);
  if (!raw) {
    errors.push({ row: rowNum, message: `Required field "${column}" is empty. Fill in this column to continue.` });
    return null;
  }
  return parseOptionalDate(raw, column, rowNum, errors);
}

function looksLikeEmail(raw: string): boolean {
  const val = raw.trim();
  return val.includes('@') && val.indexOf('@') > 0 && val.indexOf('@') < val.length - 1;
}

function parseLaptopHandover(
  row: string[],
  col: Map<string, number>,
  statusId: number,
  rowNum: number,
  errors: BulkImportRowError[],
): BulkLaptopHandoverImport | undefined {
  rejectDeployDataWhenNotDeployed('laptop', statusId, row, col, rowNum, errors);

  if (statusId !== BULK_IMPORT_STATUS_DEPLOY) return undefined;

  const handoverStaffEmail = requireCell(
    row,
    col.get('handover_staff_id'),
    'handover_staff_id',
    rowNum,
    errors,
  );
  const handoverDate = parseRequiredDate(row, col, 'handover_date', rowNum, errors);
  if (handoverStaffEmail && !looksLikeEmail(handoverStaffEmail)) {
    errors.push({
      row: rowNum,
      message: 'handover_staff_id must be a registered user email address.',
    });
  }

  const employeeNo = optionalCell(row, col.get('employee_no'));
  const building = optionalCell(row, col.get('building'));
  const handler = optionalCell(row, col.get('handler'));
  const level = optionalCell(row, col.get('level'));
  const zone = optionalCell(row, col.get('zone'));

  if (employeeNo && (building || handler)) {
    errors.push({
      row: rowNum,
      message:
        'Use either staff handover (employee_no) or facility deploy (building and handler), not both.',
    });
  } else if (!employeeNo && !building) {
    errors.push({
      row: rowNum,
      message:
        'When status is deployed, fill employee_no for a staff handover, or building and handler for a facility deploy.',
    });
  } else if (!employeeNo && !handler) {
    errors.push({
      row: rowNum,
      message: 'handler is required when deploying a laptop to a facility.',
    });
  }

  if (rowHasErrors(errors, rowNum) || !handoverStaffEmail || !handoverDate) return undefined;

  return {
    handoverStaffEmail: handoverStaffEmail.trim().toLowerCase(),
    handoverDate,
    handoverRemarks: optionalCell(row, col.get('handover_remarks')),
    employeeNo,
    building,
    level,
    zone,
    handler,
  };
}

function parsePlaceDeployment(
  kind: 'av' | 'network',
  row: string[],
  col: Map<string, number>,
  statusId: number,
  rowNum: number,
  errors: BulkImportRowError[],
): BulkPlaceDeploymentImport | undefined {
  rejectDeployDataWhenNotDeployed(kind, statusId, row, col, rowNum, errors);

  if (statusId !== BULK_IMPORT_STATUS_DEPLOY) return undefined;

  const deploymentStaffEmail = requireCell(
    row,
    col.get('deployment_staff_id')!,
    'deployment_staff_id',
    rowNum,
    errors,
  );
  const building = requireCell(row, col.get('building')!, 'building', rowNum, errors);

  if (deploymentStaffEmail && !looksLikeEmail(deploymentStaffEmail)) {
    errors.push({
      row: rowNum,
      message: 'deployment_staff_id must be a registered user email address.',
    });
  }

  if (rowHasErrors(errors, rowNum) || !deploymentStaffEmail || !building) return undefined;

  const level = optionalCell(row, col.get('level')!)?.trim() || '-';
  const zone = optionalCell(row, col.get('zone')!)?.trim() || '-';
  const deploymentDateRaw = cellTrim(row, col, 'deployment_date');
  const deploymentDate =
    (deploymentDateRaw
      ? parseOptionalDate(deploymentDateRaw, 'deployment_date', rowNum, errors)
      : null) ?? new Date().toISOString().slice(0, 10);

  if (rowHasErrors(errors, rowNum)) return undefined;

  return {
    deploymentStaffEmail: deploymentStaffEmail.trim().toLowerCase(),
    building,
    level,
    zone,
    deploymentDate,
    deploymentRemarks: optionalCell(row, col.get('deployment_remarks')!),
  };
}

function parseLaptopRows(headers: string[], rows: string[][]) {
  const errors: BulkImportRowError[] = [];
  const col = buildColumnIndex(headers, BULK_IMPORT_REQUIRED.laptop, errors);
  if (errors.some((e) => e.row === 0)) {
    return { laptopRows: [] as CreateLaptopInput[], errors, validCount: 0, errorCount: 1 };
  }

  const laptopRows: BulkLaptopImportRow[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    warnIfColumnsShifted(row, col, rowNum, errors);
    const assetId = parseOptionalAssetId(row[col.get('asset_id')!] ?? '', rowNum, errors);
    const tagging = parseOptionalTagging(row[col.get('tagging')!] ?? '', rowNum, errors);
    const accCode = parseAccCode(row[col.get('acc_code')!] ?? '', rowNum, errors);
    const serialNum = requireCell(row, col.get('serial_num')!, 'serial_num', rowNum, errors);
    const rawCategory = requireCell(row, col.get('category')!, 'category', rowNum, errors);
    const category = rawCategory ? canonicalizeLaptopCategory(rawCategory) : '';
    const statusId = parseStatusId(requireCell(row, col.get('status_id')!, 'status_id', rowNum, errors), rowNum, errors);
    const purchase = parsePurchaseFromRow(row, col, rowNum, errors);

    if (rawCategory && !category) {
      errors.push({
        row: rowNum,
        message: 'Enter a specific category name. Do not use "Others" as the stored value.',
      });
    }

    if (category) {
      try {
        getLaptopAssetIdPrefix(category);
      } catch (e) {
        errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : 'The laptop category is not valid for asset ID generation.',
        });
      }
    }

    if (rowHasErrors(errors, rowNum) || statusId === null) return;

    const handover = parseLaptopHandover(row, col, statusId, rowNum, errors);
    const warranty = parseWarrantyFromRow(row, col, rowNum, errors);
    if (rowHasErrors(errors, rowNum)) return;

    laptopRows.push({
      ...(assetId !== undefined ? { assetId } : {}),
      ...(tagging ? { tagging } : {}),
      accCode,
      serialNum,
      brand: optionalCell(row, col.get('brand')!),
      model: optionalCell(row, col.get('model')!),
      supplier: optionalCell(row, col.get('supplier')!),
      category,
      partNumber: optionalCell(row, col.get('part_number')!),
      processor: optionalCell(row, col.get('processor')!),
      memory: optionalCell(row, col.get('memory')!),
      os: optionalCell(row, col.get('os')!),
      storage: optionalCell(row, col.get('storage')!),
      gpu: optionalCell(row, col.get('gpu')!),
      ...purchase,
      statusId,
      remarks: optionalCell(row, col.get('remarks')!),
      ...(handover ? { handover } : {}),
      ...(warranty ? { warranty } : {}),
    });
  });

  const rowErrorRows = new Set(errors.map((e) => e.row).filter((r) => r > 0));
  return { laptopRows, errors, validCount: laptopRows.length, errorCount: rowErrorRows.size };
}

function parseAvRows(headers: string[], rows: string[][]) {
  const errors: BulkImportRowError[] = [];
  const col = buildColumnIndex(headers, BULK_IMPORT_REQUIRED.av, errors);
  if (errors.some((e) => e.row === 0)) {
    return { avRows: [] as CreateAvInput[], errors, validCount: 0, errorCount: 1 };
  }

  const avRows: BulkAvImportRow[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    warnIfColumnsShifted(row, col, rowNum, errors);
    const assetId = parseOptionalAssetId(row[col.get('asset_id')!] ?? '', rowNum, errors);
    const tagging = parseOptionalTagging(row[col.get('tagging')!] ?? '', rowNum, errors);
    const accCode = parseAccCode(row[col.get('acc_code')!] ?? '', rowNum, errors);
    const statusId = parseStatusId(requireCell(row, col.get('status_id')!, 'status_id', rowNum, errors), rowNum, errors);
    const purchase = parsePurchaseFromRow(row, col, rowNum, errors);

    if (rowHasErrors(errors, rowNum) || statusId === null) return;

    const deployment = parsePlaceDeployment('av', row, col, statusId, rowNum, errors);
    const warranty = parseWarrantyFromRow(row, col, rowNum, errors);
    if (rowHasErrors(errors, rowNum)) return;

    avRows.push({
      ...(assetId !== undefined ? { assetId } : {}),
      ...(tagging ? { tagging } : {}),
      accCode,
      assetIdOld: optionalCell(row, col.get('asset_id_old')!),
      category: optionalCell(row, col.get('category')!),
      brand: optionalCell(row, col.get('brand')!),
      model: optionalCell(row, col.get('model')!),
      supplier: optionalCell(row, col.get('supplier')!),
      serialNum: optionalCell(row, col.get('serial_num')!),
      ...purchase,
      statusId,
      remarks: optionalCell(row, col.get('remarks')!),
      ...(deployment ? { deployment } : {}),
      ...(warranty ? { warranty } : {}),
    });
  });

  const rowErrorRows = new Set(errors.map((e) => e.row).filter((r) => r > 0));
  return { avRows, errors, validCount: avRows.length, errorCount: rowErrorRows.size };
}

function parseNetworkRows(headers: string[], rows: string[][]) {
  const errors: BulkImportRowError[] = [];
  const col = buildColumnIndex(headers, BULK_IMPORT_REQUIRED.network, errors);
  if (errors.some((e) => e.row === 0)) {
    return { networkRows: [] as CreateNetworkInput[], errors, validCount: 0, errorCount: 1 };
  }

  const networkRows: BulkNetworkImportRow[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    warnIfColumnsShifted(row, col, rowNum, errors);
    const assetId = parseOptionalAssetId(row[col.get('asset_id')!] ?? '', rowNum, errors);
    const tagging = parseOptionalTagging(row[col.get('tagging')!] ?? '', rowNum, errors);
    const accCode = parseAccCode(row[col.get('acc_code')!] ?? '', rowNum, errors);
    const statusId = parseStatusId(requireCell(row, col.get('status_id')!, 'status_id', rowNum, errors), rowNum, errors);
    const purchase = parsePurchaseFromRow(row, col, rowNum, errors);

    if (rowHasErrors(errors, rowNum) || statusId === null) return;

    const deployment = parsePlaceDeployment('network', row, col, statusId, rowNum, errors);
    const warranty = parseWarrantyFromRow(row, col, rowNum, errors);
    if (rowHasErrors(errors, rowNum)) return;

    networkRows.push({
      ...(assetId !== undefined ? { assetId } : {}),
      ...(tagging ? { tagging } : {}),
      accCode,
      category: optionalCell(row, col.get('category')!),
      serialNum: optionalCell(row, col.get('serial_num')!),
      brand: optionalCell(row, col.get('brand')!),
      model: optionalCell(row, col.get('model')!),
      supplier: optionalCell(row, col.get('supplier')!),
      macAddress: optionalCell(row, col.get('mac_address')!),
      ipAddress: optionalCell(row, col.get('ip_address')!),
      ...purchase,
      statusId,
      remarks: optionalCell(row, col.get('remarks')!),
      ...(deployment ? { deployment } : {}),
      ...(warranty ? { warranty } : {}),
    });
  });

  const rowErrorRows = new Set(errors.map((e) => e.row).filter((r) => r > 0));
  return { networkRows, errors, validCount: networkRows.length, errorCount: rowErrorRows.size };
}

export function parseBulkImportCsv(kind: AssetKind, csvText: string): BulkImportPreview {
  const { headers, rows } = parseCsv(csvText);
  const base = { kind, headers };

  if (headers.length === 0) {
    return { ...base, validCount: 0, errorCount: 1, errors: [{ row: 0, message: 'The CSV file is empty. Paste content or load the sample file.' }] };
  }

  if (kind === 'laptop') {
    return { ...base, ...parseLaptopRows(headers, rows) };
  }
  if (kind === 'av') {
    return { ...base, ...parseAvRows(headers, rows) };
  }
  return { ...base, ...parseNetworkRows(headers, rows) };
}

export type { BulkImportTemplateVariant };

export function getBulkImportTemplate(
  kind: AssetKind,
  variant: BulkImportTemplateVariant = 'asset',
): string {
  const columns = bulkImportTemplateColumns(kind, variant);
  const statusId = String(bulkImportTemplateStatusId(variant));
  const sample = columns.map((column) => (column === 'status_id' ? statusId : ''));
  return [columns.join(','), sample.map(csvEscape).join(',')].join('\n') + '\n';
}

export function getBulkImportMockCsv(kind: AssetKind): string {
  return MOCK_CSV[kind];
}

export { downloadBulkImportTemplate, excelFileToCsv } from '@/lib/bulk-import-workbook';

export function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function commitBulkImport(preview: BulkImportPreview): Promise<number> {
  if (preview.kind === 'laptop' && preview.laptopRows?.length) {
    return bulkCreateLaptopsImportFn({ data: preview.laptopRows });
  }
  if (preview.kind === 'av' && preview.avRows?.length) {
    return bulkCreateAvImportFn({ data: preview.avRows });
  }
  if (preview.kind === 'network' && preview.networkRows?.length) {
    return bulkCreateNetworkImportFn({ data: preview.networkRows });
  }
  return 0;
}

export function useBulkImport() {
  const [preview, setPreview] = useState<BulkImportPreview | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const parseText = useCallback((kind: AssetKind, text: string) => {
    setIsParsing(true);
    try {
      const result = parseBulkImportCsv(kind, text);
      setPreview(result);
      return result;
    } finally {
      setIsParsing(false);
    }
  }, []);

  const parseFile = useCallback(
    async (kind: AssetKind, file: File) => {
      const text = await file.text();
      return parseText(kind, text);
    },
    [parseText],
  );

  const loadMockSample = useCallback(
    (kind: AssetKind) => parseText(kind, getBulkImportMockCsv(kind)),
    [parseText],
  );

  const clearPreview = useCallback(() => setPreview(null), []);

  const commit = useCallback(async () => {
    if (!preview || preview.validCount === 0) return 0;
    return commitBulkImport(preview);
  }, [preview]);

  return {
    preview,
    isParsing,
    parseText,
    parseFile,
    loadMockSample,
    clearPreview,
    commit,
    getTemplate: getBulkImportTemplate,
    getMockCsv: getBulkImportMockCsv,
    columns: BULK_IMPORT_COLUMNS,
    requiredColumns: BULK_IMPORT_REQUIRED,
  };
}
