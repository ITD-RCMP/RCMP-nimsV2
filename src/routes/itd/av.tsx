import { createFileRoute } from '@tanstack/react-router';
import { TechnicianAvPage } from '@/technician/av';

export const Route = createFileRoute('/technician/av')({
  head: () => ({
    meta: [
      { title: 'AV equipment | NIMS' },
      { name: 'description', content: 'Technician view of audio-visual inventory.' },
    ],
  }),
  component: TechnicianAvPage,
});
