import { createFileRoute } from '@tanstack/react-router';
import { TechnicianLaptopPage } from '@/technician/laptop';

export const Route = createFileRoute('/technician/laptop')({
  head: () => ({
    meta: [
      { title: 'Laptop & desktop | NIMS' },
      { name: 'description', content: 'Technician view of laptop and desktop inventory.' },
    ],
  }),
  component: TechnicianLaptopPage,
});
