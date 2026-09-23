import { createServerFn } from '@tanstack/react-start';
import type { SendCheckoutEmailInput } from '@shared/lib/checkout-email-types';
import { staffMiddleware } from '@backend/server/core/auth-middleware';

export const queueCheckoutEmailFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: SendCheckoutEmailInput) => input)
  .handler(async ({ data: input }) => {
    const { queueCheckoutEmail } = await import('@backend/server/email/checkout-email.server');
    queueCheckoutEmail(input);
    return { queued: true };
  });
