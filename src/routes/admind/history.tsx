import { createFileRoute } from '@tanstack/react-router';
import { DisposalUnitHistoryPage } from '@/admind/history';

export const Route = createFileRoute('/admind/history')({
  head: () => ({
    meta: [
      { title: 'Disposal history | NIMS' },
      { name: 'description', content: 'Review completed disposal activity.' },
    ],
  }),
  component: DisposalUnitHistoryPage,
});
