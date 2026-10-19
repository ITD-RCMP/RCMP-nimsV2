import { createFileRoute } from '@tanstack/react-router';
import { TechnicianDashboardPage } from '@/itd/dashboard';

export const Route = createFileRoute('/itd/dashboard')({
  head: () => ({
    meta: [
      { title: 'Technician | NIMS' },
      { name: 'description', content: 'Field queue, work orders, and technician tools.' },
    ],
  }),
  component: TechnicianDashboardPage,
});
