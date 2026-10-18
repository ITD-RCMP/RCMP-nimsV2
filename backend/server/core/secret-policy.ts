import { timingSafeEqual } from 'node:crypto';

const PUBLIC_PLACEHOLDER_SECRETS = new Set([
  'change-me-to-a-different-long-random-secret',
  'change-me-for-post-api-cron-overdue-return-emails',
]);

export function isPublicPlaceholderSecret(secret: string): boolean {
  return PUBLIC_PLACEHOLDER_SECRETS.has(secret.trim());
}

export function bearerMatchesSecret(authorization: string | null, secret: string): boolean {
  const provided = Buffer.from(authorization ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
