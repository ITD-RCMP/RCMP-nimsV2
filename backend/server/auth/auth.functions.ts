import { createServerFn } from '@tanstack/react-start';
import { sessionMiddleware, staffMiddleware } from '@backend/server/core/auth-middleware';
import { destroySession, establishSession } from '@backend/server/auth/session.server';

export const getMicrosoftLoginUrlFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { getMicrosoftLoginRedirect } = await import('@backend/server/auth/microsoft-auth.server');
  return getMicrosoftLoginRedirect(null, true);
});

export const completeMicrosoftLoginFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { code: string; state: string }) => data)
  .handler(async ({ data }) => {
    const { completeMicrosoftLogin } = await import('@backend/server/auth/microsoft-auth.server');
    const user = await completeMicrosoftLogin(data.code, data.state);
    await establishSession(user);
    return user;
  });

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  await destroySession();
  return { ok: true };
});

function assertDevLoginAllowed(): void {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== 'true') {
    throw new Error('Development sign-in is not available.');
  }
}

export const devLoginAsTechnicianFn = createServerFn({ method: 'POST' }).handler(async () => {
  assertDevLoginAllowed();
  const { devLoginAsTechnician } = await import('@backend/server/auth/auth-repo.server');
  const user = await devLoginAsTechnician();
  await establishSession(user);
  return user;
});

export const devLoginAsAdminFn = createServerFn({ method: 'POST' }).handler(async () => {
  assertDevLoginAllowed();
  const { devLoginAsAdmin } = await import('@backend/server/auth/auth-repo.server');
  const user = await devLoginAsAdmin();
  await establishSession(user);
  return user;
});

export const devLoginAsUserFn = createServerFn({ method: 'POST' }).handler(async () => {
  assertDevLoginAllowed();
  const { devLoginAsUser } = await import('@backend/server/auth/auth-repo.server');
  const user = await devLoginAsUser();
  await establishSession(user);
  return user;
});

export const devLoginAsDisposalUnitFn = createServerFn({ method: 'POST' }).handler(async () => {
  assertDevLoginAllowed();
  const { devLoginAsDisposalUnit } = await import('@backend/server/auth/auth-repo.server');
  const user = await devLoginAsDisposalUnit();
  await establishSession(user);
  return user;
});

export const getUserProfileFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const { getUserProfile } = await import('@backend/server/auth/auth-repo.server');
    return getUserProfile(context.staffId);
  });

export const updateUserProfileFn = createServerFn({ method: 'POST' })
  .middleware([sessionMiddleware])
  .inputValidator((data: { phone: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { updateUserProfile } = await import('@backend/server/auth/auth-repo.server');
    return updateUserProfile({ staffId: context.staffId, phone: data.phone });
  });

export const getStaffProfileFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .handler(async ({ context }) => {
    const { getStaffProfile } = await import('@backend/server/auth/auth-repo.server');
    return getStaffProfile(context.staffId);
  });
