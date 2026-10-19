import { createFileRoute } from '@tanstack/react-router';
import { DisposalUnitHistoryPage } from '@/disposal-unit/history';

export const Route = createFileRoute('/disposal-unit/history')({
  head: () => ({
    meta: [
      { title: 'Disposal history | NIMS' },
      { name: 'description', content: 'Review completed disposal activity.' },
    ],
  }),
  component: DisposalUnitHistoryPage,
});
