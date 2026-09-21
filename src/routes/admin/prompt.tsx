import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/prompt')({
  component: () => <Navigate to="/admin/dashboard" />,
});
