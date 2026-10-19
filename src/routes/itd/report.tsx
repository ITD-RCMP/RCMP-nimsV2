import { createFileRoute } from '@tanstack/react-router';
import { TechnicianReportPage } from '@/itd/report';

export const Route = createFileRoute('/itd/report')({
  head: () => ({
    meta: [
      { title: 'Report | NIMS' },
      { name: 'description', content: 'Generate and download inventory reports.' },
    ],
  }),
  component: TechnicianReportPage,
});
