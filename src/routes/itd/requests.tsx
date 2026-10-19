import { createFileRoute } from '@tanstack/react-router';
import { TechnicianRequestPage } from '@/technician/requestPage';

export const Route = createFileRoute('/technician/requests')({
  head: () => ({
    meta: [
      { title: 'User requests | NIMS' },
      { name: 'description', content: 'Review user equipment requests and assign pooled assets.' },
    ],
  }),
  component: TechnicianRequestPage,
});
