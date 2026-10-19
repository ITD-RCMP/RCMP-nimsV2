import { createFileRoute } from '@tanstack/react-router';
import { TechnicianRequestViewPage } from '@/itd/requestView';

export const Route = createFileRoute('/itd/request-view')({
  head: () => ({
    meta: [
      { title: 'Assigned request assets | NIMS' },
      { name: 'description', content: 'View laptop and AV assets assigned to user requests.' },
    ],
  }),
  component: TechnicianRequestViewPage,
});
