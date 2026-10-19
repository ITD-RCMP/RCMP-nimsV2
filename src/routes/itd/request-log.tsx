import { createFileRoute } from '@tanstack/react-router';
import { TechnicianRequestLogPage } from '@/itd/request-log';

export const Route = createFileRoute('/itd/request-log')({
  head: () => ({
    meta: [
      { title: 'Request log | NIMS' },
      { name: 'description', content: 'View the full log of user equipment requests.' },
    ],
  }),
  component: TechnicianRequestLogPage,
});
