import { createFileRoute } from '@tanstack/react-router';
import { TechnicianDeployPage } from '@/technician/deployPage';
import { parseAssetIdParam, parseAssetKindParam, type AssetId, type AssetKind } from '@shared/lib/inventory-schema';

type DeploySearch = { kind?: AssetKind; assetId?: AssetId };

export const Route = createFileRoute('/technician/deploy')({
  validateSearch: (search: Record<string, unknown>): DeploySearch => {
    const kind = parseAssetKindParam(search.kind) ?? undefined;
    const assetId = parseAssetIdParam(search.assetId) ?? undefined;
    return { kind, assetId };
  },
  head: () => ({
    meta: [
      { title: 'Deploy asset | NIMS' },
      { name: 'description', content: 'Deploy or hand over an inventory asset.' },
    ],
  }),
  component: TechnicianDeployPage,
});
