import { createServerFn } from '@tanstack/react-start';
import type { AssetKind } from '@shared/lib/inventory-schema';
import { staffMiddleware } from '@backend/server/core/auth-middleware';
import type { BulkImportPdfRow } from '@backend/server/pdf/bulk-import-pdf.server';

export const generateBulkImportPdfFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((data: { kind: AssetKind; rows: BulkImportPdfRow[] }) => data)
  .handler(async ({ data }) => {
    if (!data.rows.length) {
      throw new Error('There are no imported rows to include in the summary PDF.');
    }
    const { generateBulkImportPdfBase64 } = await import('@backend/server/pdf/bulk-import-pdf.server');
    return generateBulkImportPdfBase64(data.kind, data.rows);
  });
