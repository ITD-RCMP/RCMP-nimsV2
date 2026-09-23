import { createServerFn } from '@tanstack/react-start';
import { staffMiddleware } from '@backend/server/core/auth-middleware';

export const queueRequestRejectEmailFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((requestId: number) => requestId)
  .handler(async ({ data: requestId }) => {
    const { queueRequestRejectEmail } = await import(
      '@backend/server/email/request-reject-email.server'
    );
    queueRequestRejectEmail(requestId);
    return { queued: true };
  });
