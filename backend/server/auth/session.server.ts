import { getCookie, setResponseStatus, useSession } from '@tanstack/react-start/server';
import type { AuthUserRow } from '@backend/server/auth/auth-repo.server';
import {
  bumpWebSessionVersion,
  ensureWebSessionVersion,
  readWebSessionBinding,
} from '@backend/server/auth/web-session-version.server';
import { loadServerEnv } from '@backend/server/core/env.server';
import { isPublicPlaceholderSecret } from '@backend/server/core/secret-policy';
import {
  SESSION_ACTIVITY_THROTTLE_MS,
  SESSION_REVOKED_CODE,
  SESSION_TIMEOUT_CODE,
  SESSION_WARNING_LEAD_MS,
  sessionTimeoutReason,
  type SessionTimeoutPolicy,
} from '@shared/lib/session-policy';

const SESSION_NAME = 'nims_session';
const DEFAULT_IDLE_MINUTES = 15;
const DEFAULT_ABSOLUTE_HOURS = 8;

export type AppSessionData = {
  staffId: string;
  roleId: number;
  roleName: string;
  fullName: string;
  email: string;
  phone: string | null;
  issuedAt: number;
  lastActivityAt: number;
  sessionVersion: number;
};

export type WebSessionEvaluation =
  | {
      kind: 'ok';
      issuedAt: number;
      lastActivityAt: number;
      policy: SessionTimeoutPolicy;
      user: AppSessionData;
    }
  | { kind: 'anonymous' }
  | { kind: 'timeout' }
  | { kind: 'revoked' };

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function readSessionPolicy(): SessionTimeoutPolicy {
  loadServerEnv();
  const idleMinutes = positiveNumber(process.env.SESSION_IDLE_TIMEOUT_MINUTES, DEFAULT_IDLE_MINUTES);
  const absoluteHours = positiveNumber(process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS, DEFAULT_ABSOLUTE_HOURS);
  const idleTimeoutMs = idleMinutes * 60_000;
  return {
    idleTimeoutMs,
    absoluteTimeoutMs: absoluteHours * 60 * 60_000,
    warningLeadMs: Math.min(SESSION_WARNING_LEAD_MS, idleTimeoutMs),
  };
}

export function isSecureAuthCookie(): boolean {
  return process.env.NODE_ENV !== 'development';
}

function sessionSecret(): string {
  loadServerEnv();
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error('Session storage is not configured. Set SESSION_SECRET on the server.');
  }
  if (secret.length < 32 || isPublicPlaceholderSecret(secret)) {
    throw new Error('SESSION_SECRET must be a unique random string at least 32 characters long.');
  }
  return secret;
}

function sessionOptions() {
  const policy = readSessionPolicy();
  return {
    name: SESSION_NAME,
    password: sessionSecret(),
    maxAge: Math.max(1, Math.ceil(policy.absoluteTimeoutMs / 1000)),
    cookie: {
      httpOnly: true,
      secure: isSecureAuthCookie(),
      sameSite: 'lax' as const,
      path: '/',
    },
    policy,
  };
}

function hasSessionCookie(): boolean {
  return Boolean(getCookie(SESSION_NAME));
}

/** Server-side, HttpOnly, encrypted+signed session cookie. Never trust client-supplied identity. */
export function getAppSession() {
  const { policy: _policy, ...config } = sessionOptions();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- `useSession` here is h3's server session helper, not a React hook.
  return useSession<AppSessionData>(config);
}

function userIdFromStaff(staffId: string | undefined): number | null {
  const userId = Number(staffId);
  if (!Number.isInteger(userId) || userId < 1) return null;
  return userId;
}

function isCompleteSession(data: Partial<AppSessionData>): data is AppSessionData {
  return Boolean(
    data.staffId &&
      typeof data.roleId === 'number' &&
      typeof data.issuedAt === 'number' &&
      typeof data.lastActivityAt === 'number' &&
      typeof data.sessionVersion === 'number',
  );
}

export function webSessionEndResponse(error: unknown): Response | null {
  if (!(error instanceof Error)) return null;
  if (error.message !== SESSION_TIMEOUT_CODE && error.message !== SESSION_REVOKED_CODE) return null;
  return new Response(error.message, {
    status: 401,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function establishSession(user: AuthUserRow): Promise<void> {
  const userId = userIdFromStaff(user.staffId);
  if (userId == null) {
    throw new Error('Could not start a web session.');
  }
  const sessionVersion = await ensureWebSessionVersion(userId);
  const now = Date.now();
  const session = await getAppSession();
  const data: AppSessionData = {
    staffId: user.staffId,
    roleId: user.roleId,
    roleName: user.roleName,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    issuedAt: now,
    lastActivityAt: now,
    sessionVersion,
  };
  await session.update(data);
}

export async function destroySession(): Promise<void> {
  if (!hasSessionCookie()) return;
  const session = await getAppSession();
  const userId = userIdFromStaff(session.data.staffId);
  if (userId != null) {
    await bumpWebSessionVersion(userId);
  }
  await session.clear();
}

async function clearSessionCookie(): Promise<void> {
  const session = await getAppSession();
  await session.clear();
}

export async function evaluateWebSession(mode: 'read' | 'touch' | 'force'): Promise<WebSessionEvaluation> {
  if (!hasSessionCookie()) return { kind: 'anonymous' };
  const { policy } = sessionOptions();
  const session = await getAppSession();
  const data = session.data;
  if (!isCompleteSession(data)) {
    await clearSessionCookie();
    return { kind: 'timeout' };
  }

  const userId = userIdFromStaff(data.staffId);
  if (userId == null) {
    await clearSessionCookie();
    return { kind: 'revoked' };
  }

  const binding = await readWebSessionBinding(userId);
  if (
    binding == null ||
    binding.sessionVersion !== data.sessionVersion ||
    binding.roleId !== data.roleId
  ) {
    await clearSessionCookie();
    return { kind: 'revoked' };
  }

  const now = Date.now();
  const reason = sessionTimeoutReason({
    now,
    issuedAt: data.issuedAt,
    lastActivityAt: data.lastActivityAt,
    idleTimeoutMs: policy.idleTimeoutMs,
    absoluteTimeoutMs: policy.absoluteTimeoutMs,
  });
  if (reason) {
    await clearSessionCookie();
    return { kind: 'timeout' };
  }

  let lastActivityAt = data.lastActivityAt;
  if (mode !== 'read' && (mode === 'force' || now - lastActivityAt >= SESSION_ACTIVITY_THROTTLE_MS)) {
    lastActivityAt = now;
    await session.update({ lastActivityAt });
  }

  return {
    kind: 'ok',
    issuedAt: data.issuedAt,
    lastActivityAt,
    policy,
    user: {
      staffId: data.staffId,
      roleId: data.roleId,
      roleName: binding.roleName || data.roleName || '',
      fullName: data.fullName ?? '',
      email: data.email ?? '',
      phone: data.phone ?? null,
      issuedAt: data.issuedAt,
      lastActivityAt,
      sessionVersion: data.sessionVersion,
    },
  };
}

export async function getSessionUser(): Promise<AppSessionData | null> {
  const result = await evaluateWebSession('touch');
  if (result.kind === 'ok') return result.user;
  if (result.kind === 'anonymous') return null;
  setResponseStatus(401);
  throw new Error(result.kind === 'timeout' ? SESSION_TIMEOUT_CODE : SESSION_REVOKED_CODE);
}
