import { createFileRoute } from '@tanstack/react-router';
import { DisposalUnitDisposalPage } from '@/admind/disposal';

export const Route = createFileRoute('/admind/disposal')({
  head: () => ({
    meta: [
      { title: 'Disposal | NIMS' },
      { name: 'description', content: 'Process assets queued for disposal.' },
    ],
  }),
  component: DisposalUnitDisposalPage,
});
