import { createFileRoute } from '@tanstack/react-router';
import { TechnicianRequestAssetPage } from '@/itd/requestAssetPage';

export const Route = createFileRoute('/itd/request-assets')({
  head: () => ({
    meta: [
      { title: 'Request asset pool | NIMS' },
      { name: 'description', content: 'Add laptop and AV assets to the request pool (status 1 → 9).' },
    ],
  }),
  component: TechnicianRequestAssetPage,
});
