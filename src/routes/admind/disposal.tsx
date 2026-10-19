import { createFileRoute } from '@tanstack/react-router';
import { DisposalUnitDisposalPage } from '@/disposal-unit/disposal';

export const Route = createFileRoute('/disposal-unit/disposal')({
  head: () => ({
    meta: [
      { title: 'Disposal | NIMS' },
      { name: 'description', content: 'Process assets queued for disposal.' },
    ],
  }),
  component: DisposalUnitDisposalPage,
});
