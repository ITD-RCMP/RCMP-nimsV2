import { createFileRoute } from '@tanstack/react-router';
import { TechnicianPreDisposedPage } from '@/itd/pre-disposed';

export const Route = createFileRoute('/itd/pre-disposed')({
  head: () => ({
    meta: [
      { title: 'Pre-disposed assets | NIMS' },
      { name: 'description', content: 'View assets marked as pre-disposed for disposal.' },
    ],
  }),
  component: TechnicianPreDisposedPage,
});
