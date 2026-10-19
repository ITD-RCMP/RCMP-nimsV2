import { createFileRoute } from '@tanstack/react-router';
import { TechnicianLaptopPage } from '@/itd/laptop';

export const Route = createFileRoute('/itd/laptop')({
  head: () => ({
    meta: [
      { title: 'Laptop & desktop | NIMS' },
      { name: 'description', content: 'Technician view of laptop and desktop inventory.' },
    ],
  }),
  component: TechnicianLaptopPage,
});
