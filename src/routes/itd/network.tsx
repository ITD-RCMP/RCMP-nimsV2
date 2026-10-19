import { createFileRoute } from '@tanstack/react-router';
import { TechnicianNetworkPage } from '@/itd/network';

export const Route = createFileRoute('/itd/network')({
  head: () => ({
    meta: [
      { title: 'Network equipment | NIMS' },
      { name: 'description', content: 'Technician view of network inventory.' },
    ],
  }),
  component: TechnicianNetworkPage,
});
