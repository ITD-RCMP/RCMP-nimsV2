import { createFileRoute } from '@tanstack/react-router';
import { TechnicianAvPage } from '@/itd/av';

export const Route = createFileRoute('/itd/av')({
  head: () => ({
    meta: [
      { title: 'AV equipment | NIMS' },
      { name: 'description', content: 'Technician view of audio-visual inventory.' },
    ],
  }),
  component: TechnicianAvPage,
});
