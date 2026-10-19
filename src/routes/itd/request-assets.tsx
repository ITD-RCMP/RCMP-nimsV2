import { createFileRoute } from '@tanstack/react-router';
import { TechnicianRequestAssetPage } from '@/technician/requestAssetPage';

export const Route = createFileRoute('/technician/request-assets')({
  head: () => ({
    meta: [
      { title: 'Request asset pool | NIMS' },
      { name: 'description', content: 'Add laptop and AV assets to the request pool (status 1 → 9).' },
    ],
  }),
  component: TechnicianRequestAssetPage,
});
