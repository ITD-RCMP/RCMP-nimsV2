import { createFileRoute } from '@tanstack/react-router';
import { TechnicianReturnPage } from '@/technician/returnPage';
import { parseAssetIdParam, parseAssetKindParam, type AssetId, type AssetKind } from '@shared/lib/inventory-schema';

type ReturnSearch = { kind?: AssetKind; assetId?: AssetId };

export const Route = createFileRoute('/technician/return')({
  validateSearch: (search: Record<string, unknown>): ReturnSearch => {
    const kind = parseAssetKindParam(search.kind) ?? undefined;
    const assetId = parseAssetIdParam(search.assetId) ?? undefined;
    return { kind, assetId };
  },
  head: () => ({
    meta: [
      { title: 'Return asset | NIMS' },
      { name: 'description', content: 'Return a deployed inventory asset.' },
    ],
  }),
  component: TechnicianReturnPage,
});
