import { loadServerEnv } from '@backend/server/core/env.server';

/** Server-only SMTP settings for notification mail (M365 or local Mailpit). Not stored in DB. */
export type MicrosoftEmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  fromAddress: string;
  fromName: string;
  /** Omitted for Mailpit (no SMTP auth). */
  auth?: { user: string; pass: string };
};

const DEFAULT_HOST = 'smtp.office365.com';
const DEFAULT_PORT = 587;
const MAILPIT_DEFAULT_HOST = '127.0.0.1';
const MAILPIT_DEFAULT_PORT = 1025;

export function isLoopbackSmtpHost(host: string | undefined): boolean {
  const value = host?.trim().toLowerCase() ?? '';
  return value === '127.0.0.1' || value === 'localhost' || value === '::1';
}

export function isMailpitMode(): boolean {
  const flagged = process.env.SMTP_MAILPIT === 'true' || process.env.SMTP_MAILPIT === '1';
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT?.trim());
  const loopback = isLoopbackSmtpHost(host) || (!host && flagged);
  if (!loopback) return false;
  if (flagged) return true;
  return port === 1025 || (Boolean(host) && Number.isNaN(port));
}

export function isEmailConfigured(): boolean {
  return getMicrosoftEmailConfig() != null;
}

export function getMicrosoftEmailConfig(): MicrosoftEmailConfig | null {
  loadServerEnv();
  const mailpit = isMailpitMode();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();

  if (!mailpit && (!user || !password)) return null;

  const fromAddress =
    process.env.SMTP_FROM?.trim() || user || (mailpit ? 'nims@local.test' : '');
  if (!fromAddress) return null;

  const host =
    process.env.SMTP_HOST?.trim() || (mailpit ? MAILPIT_DEFAULT_HOST : DEFAULT_HOST);
  const portRaw = process.env.SMTP_PORT?.trim();
  const port = portRaw
    ? Number(portRaw)
    : mailpit
      ? MAILPIT_DEFAULT_PORT
      : DEFAULT_PORT;
  if (Number.isNaN(port) || port <= 0) return null;

  const secure =
    !mailpit &&
    (process.env.SMTP_SECURE === 'true' ||
      process.env.SMTP_SECURE === '1' ||
      port === 465);

  return {
    host,
    port,
    secure,
    fromAddress,
    fromName: process.env.SMTP_FROM_NAME?.trim() || 'NIMS',
    ...(mailpit || !user || !password
      ? {}
      : { auth: { user, pass: password } }),
  };
}
