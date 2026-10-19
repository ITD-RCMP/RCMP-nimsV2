import { createFileRoute } from '@tanstack/react-router';
import { TechnicianHandoverStaffPage } from '@/technician/handover-staff';

export const Route = createFileRoute('/technician/handover-staff')({
  head: () => ({
    meta: [
      { title: 'Handover staff | NIMS' },
      { name: 'description', content: 'Staff directory for handover recipients.' },
    ],
  }),
  component: TechnicianHandoverStaffPage,
});
