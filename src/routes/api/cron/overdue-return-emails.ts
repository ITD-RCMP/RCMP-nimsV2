import { createFileRoute } from '@tanstack/react-router';
import { bearerMatchesSecret, isPublicPlaceholderSecret } from '@backend/server/core/secret-policy';

export const Route = createFileRoute('/api/cron/overdue-return-emails')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim() ?? '';
        const authorized =
          secret.length > 0 &&
          !isPublicPlaceholderSecret(secret) &&
          bearerMatchesSecret(request.headers.get('authorization'), secret);
        if (!authorized) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { runOverdueReturnEmailJob } = await import('@backend/server/jobs/overdue-return-email-job.server');
        const { runOverdueAutoRejectJob } = await import('@backend/server/jobs/overdue-auto-reject-job.server');
        const overdueReturnEmails = await runOverdueReturnEmailJob({ skipTimeCheck: true });
        const overdueAutoReject = await runOverdueAutoRejectJob({ skipTimeCheck: true });
        return Response.json({ overdueReturnEmails, overdueAutoReject });
      },
    },
  },
});
