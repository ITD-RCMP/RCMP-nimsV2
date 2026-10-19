import { createFileRoute } from '@tanstack/react-router';
import { TechnicianReportPage } from '@/technician/report';

export const Route = createFileRoute('/technician/report')({
  head: () => ({
    meta: [
      { title: 'Report | NIMS' },
      { name: 'description', content: 'Generate and download inventory reports.' },
    ],
  }),
  component: TechnicianReportPage,
});
