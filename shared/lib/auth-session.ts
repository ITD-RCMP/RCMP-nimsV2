export const ROLE_TECHNICIAN = 1;
export const ROLE_ADMIN = 2;
export const ROLE_USER = 3;
export const ROLE_DISPOSAL_UNIT = 4;
export const TECHNICIAN_DEPT_ID = 1;
export const DISPOSAL_UNIT_DEPT_ID = 2;

export const TECHNICIAN_SESSION_KEY = 'nims-technician-session';
export const USER_SESSION_KEY = 'nims-user-session';

export type SessionUser = {
  staffId: string;
  fullName: string;
  email: string;
  roleId: number;
  roleName: string;
  phone: string | null;
  departmentId: number | null;
};

export function isStaffRole(roleId: number): boolean {
  return roleId === ROLE_TECHNICIAN || roleId === ROLE_ADMIN;
}

export function isTechnicianUser(roleId: number, departmentId: number | null): boolean {
  return roleId === ROLE_TECHNICIAN && departmentId === TECHNICIAN_DEPT_ID;
}

export function isDisposalUnitUser(roleId: number, departmentId: number | null): boolean {
  return roleId === ROLE_TECHNICIAN && departmentId === DISPOSAL_UNIT_DEPT_ID;
}

/** @deprecated Use isDisposalUnitUser(roleId, departmentId) instead. */
export function isDisposalUnitRole(roleId: number): boolean {
  return roleId === ROLE_DISPOSAL_UNIT;
}

export function isAdminRole(roleId: number): boolean {
  return roleId === ROLE_ADMIN;
}

function isPrivilegedSessionRole(roleId: number): boolean {
  return isStaffRole(roleId);
}

export function getPostLoginPath(roleId: number, departmentId?: number | null): string {
  if (isAdminRole(roleId)) return '/admin/dashboard';
  if (isDisposalUnitUser(roleId, departmentId ?? null)) return '/admind/dashboard';
  if (isTechnicianUser(roleId, departmentId ?? null)) return '/itd/dashboard';
  return '/user/request';
}

export function readAdminSession(): SessionUser | null {
  const user = readPrivilegedSession();
  return user && isAdminRole(user.roleId) ? user : null;
}

export function hasAdminSession(): boolean {
  return readAdminSession() !== null;
}

export function persistSession(user: SessionUser): void {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify(user);
  if (isPrivilegedSessionRole(user.roleId)) {
    sessionStorage.setItem(TECHNICIAN_SESSION_KEY, payload);
    sessionStorage.removeItem(USER_SESSION_KEY);
  } else {
    sessionStorage.setItem(USER_SESSION_KEY, payload);
    sessionStorage.removeItem(TECHNICIAN_SESSION_KEY);
  }
}

export function readPrivilegedSession(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(TECHNICIAN_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    return isPrivilegedSessionRole(parsed.roleId) ? parsed : null;
  } catch {
    return null;
  }
}

export function readTechnicianSession(): SessionUser | null {
  const user = readPrivilegedSession();
  return user && isTechnicianUser(user.roleId, user.departmentId) ? user : null;
}

export function readDisposalUnitSession(): SessionUser | null {
  const user = readPrivilegedSession();
  return user && isDisposalUnitUser(user.roleId, user.departmentId) ? user : null;
}

export function readUserSession(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    return parsed.roleId === ROLE_USER ? parsed : null;
  } catch {
    return null;
  }
}

const SESSION_CHANNEL = 'nims-web-session';
const SESSION_EVENT_KEY = 'nims-web-session-event';

export type ClientSessionEvent =
  | { type: 'activity'; at: number }
  | { type: 'logout'; reason: 'manual' | 'timeout' };

export function publishClientSessionEvent(event: ClientSessionEvent): void {
  if (typeof window === 'undefined') return;
  const payload = { ...event, nonce: Date.now() };
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // no-op
  }
  try {
    localStorage.setItem(SESSION_EVENT_KEY, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

export function subscribeClientSessionEvents(onEvent: (event: ClientSessionEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let channel: BroadcastChannel | null = null;
  const handle = (event: ClientSessionEvent) => onEvent(event);
  try {
    channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.onmessage = (message: MessageEvent<ClientSessionEvent & { nonce?: number }>) => {
      if (message.data?.type === 'activity' || message.data?.type === 'logout') handle(message.data);
    };
  } catch {
    channel = null;
  }
  const onStorage = (storageEvent: StorageEvent) => {
    if (storageEvent.key !== SESSION_EVENT_KEY || !storageEvent.newValue) return;
    try {
      const parsed = JSON.parse(storageEvent.newValue) as ClientSessionEvent;
      if (parsed.type === 'activity' || parsed.type === 'logout') handle(parsed);
    } catch {
      // no-op
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}

/** Clears the local UI cache and the server-side session cookie. */
export async function clearAllSessions(): Promise<void> {
  if (typeof window === 'undefined') return;
  publishClientSessionEvent({ type: 'logout', reason: 'manual' });
  sessionStorage.removeItem(TECHNICIAN_SESSION_KEY);
  sessionStorage.removeItem(USER_SESSION_KEY);
  try {
    const { logoutFn } = await import('@backend/server/auth/auth.functions');
    await logoutFn();
  } catch {
    // no-op
  }
}

export function hasTechnicianSession(): boolean {
  return readTechnicianSession() !== null;
}

export function hasDisposalUnitSession(): boolean {
  return readDisposalUnitSession() !== null;
}
