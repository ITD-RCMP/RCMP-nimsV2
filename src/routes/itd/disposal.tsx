import { createFileRoute } from '@tanstack/react-router';
import { TechnicianDisposalPage } from '@/itd/disposal';

export const Route = createFileRoute('/itd/disposal')({
  head: () => ({
    meta: [
      { title: 'Asset disposal | NIMS' },
      { name: 'description', content: 'Select assets to mark as pre-disposed.' },
    ],
  }),
  component: TechnicianDisposalPage,
});
