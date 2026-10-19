import { createFileRoute } from '@tanstack/react-router';
import { PMpage } from '@/itd/pm-page';

export const Route = createFileRoute('/itd/preventive-maintenance')({
  head: () => ({
    meta: [
      { title: 'Preventive maintenance | NIMS' },
      { name: 'description', content: 'Manage preventive maintenance for inventory assets.' },
    ],
  }),
  component: PMpage,
});
