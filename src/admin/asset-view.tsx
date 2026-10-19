import { AdminShell } from '@/admin/admin-shell';
import type { AssetId, AssetKind } from '@shared/lib/inventory-schema';
import { AssetViewContent } from '@/itd/asset-view';

const ADMIN_ASSET_LIST_PATH: Record<AssetKind, string> = {
  laptop: '/admin/laptop',
  av: '/admin/av',
  network: '/admin/network',
};

export function AdminAssetViewPage({ kind, assetId }: { kind: AssetKind; assetId: AssetId }) {
  return (
    <AdminShell>
      <AssetViewContent
        kind={kind}
        assetId={assetId}
        readOnly
        canEditDetails
        backTo={ADMIN_ASSET_LIST_PATH[kind]}
        backLabel="Back to overview"
      />
    </AdminShell>
  );
}
