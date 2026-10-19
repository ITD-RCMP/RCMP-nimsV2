import { createFileRoute } from '@tanstack/react-router';
import { TechnicianNetworkPage } from '@/technician/network';

export const Route = createFileRoute('/technician/network')({
  head: () => ({
    meta: [
      { title: 'Network equipment | NIMS' },
      { name: 'description', content: 'Technician view of network inventory.' },
    ],
  }),
  component: TechnicianNetworkPage,
});
