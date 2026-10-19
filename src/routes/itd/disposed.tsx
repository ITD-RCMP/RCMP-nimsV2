import { createFileRoute } from '@tanstack/react-router';
import { TechnicianDisposedPage } from '@/technician/disposed';

export const Route = createFileRoute('/technician/disposed')({
  head: () => ({
    meta: [
      { title: 'Disposed assets | NIMS' },
      { name: 'description', content: 'View assets submitted for disposal, grouped by batch.' },
    ],
  }),
  component: TechnicianDisposedPage,
});
