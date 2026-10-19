import { createFileRoute } from '@tanstack/react-router';
import { TechnicianHistoryPage } from '@/itd/history';

export const Route = createFileRoute('/itd/history')({
  head: () => ({
    meta: [
      { title: 'Activity history | NIMS' },
      { name: 'description', content: 'Unified audit trail of inventory and request activity.' },
    ],
  }),
  component: TechnicianHistoryPage,
});
