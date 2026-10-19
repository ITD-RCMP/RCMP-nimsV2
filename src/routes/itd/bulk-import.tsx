import { createFileRoute } from '@tanstack/react-router';
import { TechnicianBulkImportPage } from '@/technician/bulkImportPage';
import type { AssetKind } from '@/hooks/assets';

type BulkImportSearch = { kind?: AssetKind };

export const Route = createFileRoute('/technician/bulk-import')({
  validateSearch: (search: Record<string, unknown>): BulkImportSearch => {
    const k = search.kind;
    if (k === 'laptop' || k === 'av' || k === 'network') return { kind: k };
    return {};
  },
  head: () => ({
    meta: [
      { title: 'Bulk import | NIMS' },
      { name: 'description', content: 'Import technician inventory assets from CSV.' },
    ],
  }),
  component: TechnicianBulkImportPage,
});
