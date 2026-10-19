import { createFileRoute } from '@tanstack/react-router';
import { DisposalUnitDashboardPage } from '@/admind/dashboard';

export const Route = createFileRoute('/admind/dashboard')({
  head: () => ({
    meta: [
      { title: 'Disposal unit | NIMS' },
      { name: 'description', content: 'Asset disposal workspace for the disposal unit team.' },
    ],
  }),
  component: DisposalUnitDashboardPage,
});
