import { createFileRoute } from '@tanstack/react-router';
import { TechnicianRequestLogPage } from '@/technician/request-log';

export const Route = createFileRoute('/technician/request-log')({
  head: () => ({
    meta: [
      { title: 'Request log | NIMS' },
      { name: 'description', content: 'View the full log of user equipment requests.' },
    ],
  }),
  component: TechnicianRequestLogPage,
});
