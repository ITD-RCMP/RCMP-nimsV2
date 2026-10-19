import { createFileRoute } from '@tanstack/react-router';
import { TechnicianAddAssetPage } from '@/technician/addAssetPage';
import type { AssetKind } from '@/hooks/assets';

type AddAssetSearch = { kind?: AssetKind };

export const Route = createFileRoute('/technician/add-asset')({
  validateSearch: (search: Record<string, unknown>): AddAssetSearch => {
    const k = search.kind;
    if (k === 'laptop' || k === 'av' || k === 'network') return { kind: k };
    return {};
  },
  head: () => ({
    meta: [
      { title: 'Register asset | NIMS' },
      { name: 'description', content: 'Register a single technician inventory asset.' },
    ],
  }),
  component: TechnicianAddAssetPage,
});
