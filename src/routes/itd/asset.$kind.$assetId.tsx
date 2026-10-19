import { createFileRoute } from '@tanstack/react-router';
import { TechnicianAssetViewPage } from '@/itd/asset-view';
import { parseAssetIdParam, parseAssetKindParam } from '@shared/lib/inventory-schema';

export const Route = createFileRoute('/itd/asset/$kind/$assetId')({
  params: {
    parse: (params) => {
      const kind = parseAssetKindParam(params.kind);
      const assetId = parseAssetIdParam(params.assetId);
      if (!kind || !assetId) {
        throw new Error('This asset link is not valid. Open the asset from the inventory list.');
      }
      return { kind, assetId };
    },
    stringify: ({ kind, assetId }) => ({ kind, assetId: String(assetId) }),
  },
  head: ({ params }) => ({
    meta: [
      { title: `Asset #${params.assetId} | NIMS` },
      { name: 'description', content: 'Asset details and activity trail.' },
    ],
  }),
  component: AssetViewRoute,
});

function AssetViewRoute() {
  const { kind, assetId } = Route.useParams();
  return <TechnicianAssetViewPage kind={kind} assetId={assetId} />;
}
