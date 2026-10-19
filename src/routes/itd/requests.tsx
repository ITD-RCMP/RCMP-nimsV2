import { createFileRoute } from '@tanstack/react-router';
import { TechnicianRequestPage } from '@/itd/requestPage';

export const Route = createFileRoute('/itd/requests')({
  head: () => ({
    meta: [
      { title: 'User requests | NIMS' },
      { name: 'description', content: 'Review user equipment requests and assign pooled assets.' },
    ],
  }),
  component: TechnicianRequestPage,
});
