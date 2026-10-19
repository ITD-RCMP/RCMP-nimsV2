import { createFileRoute } from '@tanstack/react-router';
import { TechnicianDisposedPage } from '@/itd/disposed';

export const Route = createFileRoute('/itd/disposed')({
  head: () => ({
    meta: [
      { title: 'Disposed assets | NIMS' },
      { name: 'description', content: 'View assets submitted for disposal, grouped by batch.' },
    ],
  }),
  component: TechnicianDisposedPage,
});
