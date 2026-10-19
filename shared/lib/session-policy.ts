export const SESSION_TIMEOUT_CODE = 'SESSION_TIMEOUT';
export const SESSION_REVOKED_CODE = 'SESSION_REVOKED';
export const SESSION_ACTIVITY_THROTTLE_MS = 60_000;
export const SESSION_WARNING_LEAD_MS = 2 * 60 * 1000;

const PROTECTED_PREFIXES = ['/admin', '/itd', '/user', '/admind'] as const;

export type SessionTimeoutPolicy = {
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  warningLeadMs: number;
};

export type SessionPingPayload = SessionTimeoutPolicy & {
  ok: true;
  issuedAt: number;
  lastActivityAt: number;
  serverNow: number;
};

export function isProtectedWebPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isWebSessionEndCode(message: string): boolean {
  return message === SESSION_TIMEOUT_CODE || message === SESSION_REVOKED_CODE;
}

export function sessionTimeoutReason(input: {
  now: number;
  issuedAt: number;
  lastActivityAt: number;
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
}): 'absolute' | 'idle' | null {
  if (!Number.isFinite(input.issuedAt) || !Number.isFinite(input.lastActivityAt)) return 'idle';
  if (input.now - input.issuedAt >= input.absoluteTimeoutMs) return 'absolute';
  if (input.now - input.lastActivityAt >= input.idleTimeoutMs) return 'idle';
  return null;
}

export function formatIdleCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
