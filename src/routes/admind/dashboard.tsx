import { createFileRoute } from '@tanstack/react-router';
import { DisposalUnitDashboardPage } from '@/disposal-unit/dashboard';

export const Route = createFileRoute('/disposal-unit/dashboard')({
  head: () => ({
    meta: [
      { title: 'Disposal unit | NIMS' },
      { name: 'description', content: 'Asset disposal workspace for the disposal unit team.' },
    ],
  }),
  component: DisposalUnitDashboardPage,
});
