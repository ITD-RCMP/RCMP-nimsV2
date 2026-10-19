import { createFileRoute } from '@tanstack/react-router';
import { TechnicianDisposalPage } from '@/technician/disposal';

export const Route = createFileRoute('/technician/disposal')({
  head: () => ({
    meta: [
      { title: 'Asset disposal | NIMS' },
      { name: 'description', content: 'Select assets to mark as pre-disposed.' },
    ],
  }),
  component: TechnicianDisposalPage,
});
