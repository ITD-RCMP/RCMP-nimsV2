import { createFileRoute } from '@tanstack/react-router';
import { TechnicianDashboardPage } from '@/technician/dashboard';

export const Route = createFileRoute('/technician/dashboard')({
  head: () => ({
    meta: [
      { title: 'Technician | NIMS' },
      { name: 'description', content: 'Field queue, work orders, and technician tools.' },
    ],
  }),
  component: TechnicianDashboardPage,
});
