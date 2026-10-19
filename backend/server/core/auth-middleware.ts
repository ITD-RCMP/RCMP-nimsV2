import { createMiddleware } from '@tanstack/react-start';
import { isAdminRole, isDisposalUnitUser, isStaffRole, isTechnicianUser } from '@shared/lib/auth-session';
import { isWebSessionEndCode } from '@shared/lib/session-policy';

export type SessionContext = {
  staffId: string;
  roleId: number;
  departmentId: number | null;
};

/** Base guard: any signed-in account. Reads identity from the server-side session cookie only. */
export const sessionMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const { getSessionUser } = await import('@backend/server/auth/session.server');
    try {
      const session = await getSessionUser();
      if (!session) {
        throw new Error('Your session has expired. Sign in again to continue.');
      }
      return next({ context: { staffId: session.staffId, roleId: session.roleId, departmentId: session.departmentId ?? null } as SessionContext });
    } catch (error) {
      if (error instanceof Error && isWebSessionEndCode(error.message)) {
        const { setResponseStatus } = await import('@tanstack/react-start/server');
        setResponseStatus(401);
      }
      throw error;
    }
  },
);

/** Technician or administrator accounts only. */
export const staffMiddleware = createMiddleware({ type: 'function' })
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (!isStaffRole(context.roleId)) {
      throw new Error('Technician access is required. Sign in with a technician account to continue.');
    }
    return next();
  });

/** Administrator accounts only. */
export const adminMiddleware = createMiddleware({ type: 'function' })
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (!isAdminRole(context.roleId)) {
      throw new Error('Administrator access is required. Sign in with an administrator account to continue.');
    }
    return next();
  });

/** Technician portal: technician accounts in department 1 only. */
export const technicianMiddleware = createMiddleware({ type: 'function' })
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (!isTechnicianUser(context.roleId, context.departmentId)) {
      throw new Error('Technician access is required. Sign in with a technician account in the IT department to continue.');
    }
    return next();
  });

/** Disposal unit: technician accounts in department 2 only. */
export const disposalUnitMiddleware = createMiddleware({ type: 'function' })
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (!isDisposalUnitUser(context.roleId, context.departmentId)) {
      throw new Error('Disposal unit access is required. Sign in with a technician account in the disposal unit department to continue.');
    }
    return next();
  });

/** Requester accounts only (not staff). */
export const requesterMiddleware = createMiddleware({ type: 'function' })
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (isStaffRole(context.roleId)) {
      throw new Error('This action is for user accounts only.');
    }
    return next();
  });
