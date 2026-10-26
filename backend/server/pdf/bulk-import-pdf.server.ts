import type { Template } from '@pdfme/common';
import { generate } from '@pdfme/generator';
import { image, text } from '@pdfme/schemas';
import { ASSET_KIND_LABEL, formatStatusLabel, type AssetKind } from '@shared/lib/inventory-schema';
import {
  COMPUTER_GENERATED_FOOTER,
  IT_DEPT_HEADER,
  UNIKL_HEADER,
  Img,
  T,
  boldContent,
  loadLogoBase64,
} from '@backend/server/pdf/pdf-form-common.server';

export type BulkImportPdfRow = {
  assetId: string;
  category: string;
  brand: string;
  model: string;
  supplier: string;
  serialNum: string;
  statusId: number;
  deployInfo: string;
};

/** Landscape A4 — wider than it is tall, unlike the portrait BASE_PDF used by other reports. */
const LANDSCAPE_PDF = {
  width: 297,
  height: 210,
  padding: [10, 10, 10, 10] as [number, number, number, number],
};

const TABLE_X = 12;
const TABLE_W = LANDSCAPE_PDF.width - TABLE_X * 2;
const HDR_H = 7.5;
const TABLE_HDR_BG = '#E8E8E8';
const BODY_FONT = 8.5;
const HDR_FONT = 9;
const ROW_H = 6.4;
const ROWS_PER_PAGE = 19;
const HEADER_Y = 58;
const BODY_Y = 66.5;
const PAGE_NO_Y = 184;
const FOOTER_DEPT_Y = 191;
const FOOTER_NOTE_Y = 197;

type ColumnDef = { key: keyof BulkImportPdfRow; label: string; weight: number };

const COLUMNS: ColumnDef[] = [
  { key: 'assetId', label: 'Asset ID', weight: 1.1 },
  { key: 'category', label: 'Category', weight: 1 },
  { key: 'brand', label: 'Brand', weight: 0.9 },
  { key: 'model', label: 'Model', weight: 1.3 },
  { key: 'supplier', label: 'Supplier', weight: 1 },
  { key: 'serialNum', label: 'Serial No.', weight: 1.2 },
  { key: 'statusId', label: 'Status', weight: 0.8 },
  { key: 'deployInfo', label: 'Deployed To', weight: 1.7 },
];

type ColumnLayout = ColumnDef & { x: number; w: number };

function resolveColumnLayouts(): ColumnLayout[] {
  const totalWeight = COLUMNS.reduce((sum, c) => sum + c.weight, 0);
  let x = TABLE_X;
  return COLUMNS.map((col, index) => {
    const w =
      index === COLUMNS.length - 1
        ? TABLE_X + TABLE_W - x
        : Math.floor((col.weight / totalWeight) * TABLE_W * 10) / 10;
    const layout: ColumnLayout = { ...col, x, w };
    x += w;
    return layout;
  });
}

function cellValue(row: BulkImportPdfRow, key: keyof BulkImportPdfRow): string {
  if (key === 'statusId') return formatStatusLabel(row.statusId);
  const value = row[key];
  const str = String(value ?? '').trim();
  return str || '—';
}

/** Header/footer sized for the landscape page — the shared pageHeaderFields/pageFooterField helpers assume a portrait 210mm-wide page. */
function landscapeHeaderFields(prefix: string, title: string, subtitle: string) {
  return [
    Img(`${prefix}_logo`, 134.5, 4, 28, 25),
    T(`${prefix}_uni`, 10, 30, 277, 6, 10, {
      align: 'center',
      markdown: true,
      content: boldContent(UNIKL_HEADER),
    }),
    T(`${prefix}_dept`, 10, 37, 277, 6, 9.5, {
      align: 'center',
      markdown: true,
      content: boldContent(subtitle),
    }),
    T(`${prefix}_title`, 10, 44, 277, 7, 11.5, {
      align: 'center',
      markdown: true,
      content: boldContent(title),
    }),
  ];
}

function landscapeFooterFields(prefix: string) {
  return [
    T(`${prefix}_deptFooter`, TABLE_X, FOOTER_DEPT_Y, TABLE_W, 5, 8.5, {
      align: 'center',
      markdown: true,
      content: boldContent('INFORMATION TECHNOLOGY DEPARTMENT RCMP'),
    }),
    T(`${prefix}_genFooter`, TABLE_X, FOOTER_NOTE_Y, TABLE_W, 5, 7.5, {
      align: 'center',
    }),
  ];
}

function buildPageSchemas(pageIndex: number, showMeta: boolean, columns: ColumnLayout[], rowsOnPage: number) {
  const prefix = `p${pageIndex}`;
  const headerY = showMeta ? HEADER_Y : HEADER_Y - 7;
  const bodyY = showMeta ? BODY_Y : BODY_Y - 7;
  const fields = [
    ...landscapeHeaderFields(prefix, 'BULK IMPORT SUMMARY', IT_DEPT_HEADER),
    T(`${prefix}_meta`, TABLE_X, 51, TABLE_W, showMeta ? 6 : 0, 8, { lineHeight: 1.2 }),
    T(`${prefix}_pageNo`, TABLE_X, PAGE_NO_Y, TABLE_W, 5, 7.5, { align: 'right' }),
    ...landscapeFooterFields(prefix),
  ];

  for (const col of columns) {
    fields.push(
      T(`${prefix}_h_${col.key}`, col.x, headerY, col.w, HDR_H, HDR_FONT, {
        backgroundColor: TABLE_HDR_BG,
        align: 'center',
        markdown: true,
        content: boldContent(col.label),
      }),
    );
  }

  for (let row = 0; row < rowsOnPage; row++) {
    const y = bodyY + row * ROW_H;
    for (const col of columns) {
      fields.push(
        T(`${prefix}_r${row}_${col.key}`, col.x, y, col.w, ROW_H, BODY_FONT, {
          align: col.key === 'statusId' ? 'center' : 'left',
          lineHeight: 1.15,
          overflow: 'visible',
        }),
      );
    }
  }

  return fields;
}

function buildTemplate(rowCount: number, columns: ColumnLayout[]): Template {
  const totalPages = Math.max(1, Math.ceil(rowCount / ROWS_PER_PAGE));
  const schemas = Array.from({ length: totalPages }, (_, index) => {
    const rowsOnPage =
      rowCount === 0 && index === 0
        ? 1
        : index < totalPages - 1
          ? ROWS_PER_PAGE
          : ((rowCount - 1) % ROWS_PER_PAGE) + 1;
    return buildPageSchemas(index + 1, index === 0, columns, rowsOnPage);
  });
  return { basePdf: LANDSCAPE_PDF, schemas };
}

function buildInputs(
  kind: AssetKind,
  rows: BulkImportPdfRow[],
  columns: ColumnLayout[],
  logo: string,
): Record<string, string>[] {
  const generatedAt = new Date().toLocaleString('en-MY', { hour12: false });
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const input: Record<string, string> = {};

  for (let page = 0; page < totalPages; page++) {
    const prefix = `p${page + 1}`;
    const chunk = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

    input[`${prefix}_logo`] = logo;
    input[`${prefix}_genFooter`] = COMPUTER_GENERATED_FOOTER;
    input[`${prefix}_pageNo`] = `Page ${page + 1} of ${totalPages}`;

    if (page === 0) {
      input[`${prefix}_meta`] = [
        `Imported: ${generatedAt}`,
        `Asset type: ${ASSET_KIND_LABEL[kind]}`,
        `Total records: ${rows.length}`,
      ].join('   ·   ');
    }

    chunk.forEach((row, rowIndex) => {
      for (const col of columns) {
        input[`${prefix}_r${rowIndex}_${col.key}`] = cellValue(row, col.key);
      }
    });

    if (chunk.length === 0 && page === 0) {
      input[`${prefix}_r0_${columns[0].key}`] = 'No records were imported.';
    }
  }

  return [input];
}

export async function generateBulkImportPdfBase64(
  kind: AssetKind,
  rows: BulkImportPdfRow[],
): Promise<{ base64: string; filename: string; count: number }> {
  const columns = resolveColumnLayouts();
  const logo = loadLogoBase64();
  const template = buildTemplate(rows.length, columns);
  const pdf = await generate({
    template,
    inputs: buildInputs(kind, rows, columns, logo),
    plugins: { text, image },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    base64: Buffer.from(pdf).toString('base64'),
    filename: `nims-bulk-import-${kind}-${stamp}.pdf`,
    count: rows.length,
  };
}
