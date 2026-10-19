import type { RowDataPacket } from 'mysql2';
import { ROLE_ADMIN, ROLE_DISPOSAL_UNIT, ROLE_TECHNICIAN, ROLE_USER } from '@shared/lib/auth-session';
import { resolveAccountProfile } from '@backend/server/core/azure-directory.server';
import { getDbPool } from '@backend/server/core/db';

export type AuthUserRow = {
  staffId: string;
  fullName: string;
  email: string;
  roleId: number;
  roleName: string;
  phone: string | null;
  departmentId: number | null;
};

export type StaffProfileRow = AuthUserRow & {
  oid: string | null;
};

type UserRow = RowDataPacket & {
  id: number;
  oid: string | null;
  email: string;
  role_id: number;
  phone: string | null;
  role_name: string;
  department_id: number | null;
};

const USER_SELECT = `SELECT u.id, u.oid, u.email, u.role_id, u.phone, u.department_id, r.name AS role_name`;

function mapUser(row: UserRow, profile: { fullName: string; email: string; phone: string | null }): AuthUserRow {
  return {
    staffId: String(row.id),
    fullName: profile.fullName,
    email: profile.email,
    roleId: row.role_id,
    roleName: row.role_name,
    phone: profile.phone,
    departmentId: row.department_id ?? null,
  };
}

/** Personal fields from Azure by oid; DB email/phone are login fallbacks only. */
async function mapUserWithAzureProfile(row: UserRow): Promise<AuthUserRow> {
  const profile = await resolveAccountProfile(row.oid, { email: row.email, phone: row.phone });
  return mapUser(row, profile);
}

async function findUserById(id: number): Promise<UserRow | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<UserRow[]>(
    `${USER_SELECT}
     FROM users u
     INNER JOIN role r ON r.id = u.role_id
     WHERE u.id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<UserRow[]>(
    `${USER_SELECT}
     FROM users u
     INNER JOIN role r ON r.id = u.role_id
     WHERE u.email = ?
     LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ?? null;
}

async function findUserByOid(oid: string): Promise<UserRow | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<UserRow[]>(
    `${USER_SELECT}
     FROM users u
     INNER JOIN role r ON r.id = u.role_id
     WHERE u.oid = ?
     LIMIT 1`,
    [oid.trim()],
  );
  return rows[0] ?? null;
}

async function findFirstUserByRole(roleId: number): Promise<UserRow | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<UserRow[]>(
    `${USER_SELECT}
     FROM users u
     INNER JOIN role r ON r.id = u.role_id
     WHERE u.role_id = ?
     ORDER BY u.id ASC
     LIMIT 1`,
    [roleId],
  );
  return rows[0] ?? null;
}

async function touchMicrosoftLogin(userId: number, oid: string): Promise<void> {
  const pool = getDbPool();
  await pool.execute(
    `UPDATE users SET oid = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [oid, userId],
  );
}

export type MicrosoftLoginInput = {
  entraOid: string;
  email: string;
};

export type MicrosoftLoginResult = AuthUserRow & {
  accountCreated: boolean;
};

async function createMicrosoftUserAccount(oid: string, email: string): Promise<UserRow> {
  const pool = getDbPool();
  await pool.execute(
    `INSERT INTO users (oid, email, role_id, last_login_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [oid, email, ROLE_USER],
  );
  const created = (await findUserByEmail(email)) ?? (await findUserByOid(oid));
  if (!created) {
    throw new Error(
      'Your account could not be set up. Try signing in again, or contact support if this keeps happening.',
    );
  }
  return created;
}

/**
 * Sign in via Entra ID. Lookup by email, then oid. New accounts are created as user role only.
 */
export async function loginMicrosoftUser(input: MicrosoftLoginInput): Promise<MicrosoftLoginResult> {
  const email = input.email.trim().toLowerCase();
  const oid = input.entraOid.trim();

  let row = await findUserByEmail(email);
  let accountCreated = false;

  const { assertUserRoleLoginAllowed } = await import('@backend/server/operations/system-settings-repo.server');

  if (!row) {
    row = await findUserByOid(oid);
  }

  if (!row) {
    await assertUserRoleLoginAllowed(ROLE_USER);
    row = await createMicrosoftUserAccount(oid, email);
    accountCreated = true;
  } else {
    if (row.email !== email) {
      throw new Error(
        'Your Microsoft sign-in email does not match the email on your account. Ask an administrator to update your registered email.',
      );
    }
    await assertUserRoleLoginAllowed(row.role_id);
    await touchMicrosoftLogin(row.id, oid);
  }

  const updated = await findUserById(row.id);
  if (!updated) {
    throw new Error(
      'Your account could not be loaded after sign-in. Try signing in again, or contact support if this keeps happening.',
    );
  }
  return { ...(await mapUserWithAzureProfile(updated)), accountCreated };
}

const DEV_ROLE_LABELS: Record<number, string> = {
  [ROLE_TECHNICIAN]: 'technician',
  [ROLE_ADMIN]: 'admin',
  [ROLE_USER]: 'user',
  [ROLE_DISPOSAL_UNIT]: 'disposal unit',
};

async function devLoginAsRole(roleId: number): Promise<AuthUserRow> {
  const row = await findFirstUserByRole(roleId);
  const roleLabel = DEV_ROLE_LABELS[roleId] ?? 'staff';
  if (!row) {
    throw new Error(
      `No ${roleLabel} account found in the database. Add a user with the ${roleLabel} role before using dev sign-in.`,
    );
  }
  return mapUserWithAzureProfile(row);
}

export async function devLoginAsTechnician(): Promise<AuthUserRow> {
  const pool = getDbPool();
  const [rows] = await pool.query<UserRow[]>(
    `${USER_SELECT}
     FROM users u
     INNER JOIN role r ON r.id = u.role_id
     WHERE u.role_id = ? AND u.department_id = ?
     ORDER BY u.id ASC
     LIMIT 1`,
    [ROLE_TECHNICIAN, 1],
  );
  const row = rows[0] ?? null;
  if (!row) {
    throw new Error(
      'No technician account with department_id = 1 found in the database. Add a technician in department 1 before using dev sign-in as technician.',
    );
  }
  return mapUserWithAzureProfile(row);
}

export async function devLoginAsAdmin(): Promise<AuthUserRow> {
  return devLoginAsRole(ROLE_ADMIN);
}

export async function devLoginAsUser(): Promise<AuthUserRow> {
  return devLoginAsRole(ROLE_USER);
}

export async function devLoginAsDisposalUnit(): Promise<AuthUserRow> {
  const pool = getDbPool();
  const [rows] = await pool.query<UserRow[]>(
    `${USER_SELECT}
     FROM users u
     INNER JOIN role r ON r.id = u.role_id
     WHERE u.role_id = ? AND u.department_id = ?
     ORDER BY u.id ASC
     LIMIT 1`,
    [ROLE_TECHNICIAN, 2],
  );
  const row = rows[0] ?? null;
  if (!row) {
    throw new Error(
      'No technician account with department_id = 2 found in the database. Add a technician in department 2 before using dev sign-in as disposal unit.',
    );
  }
  return mapUserWithAzureProfile(row);
}

export type UpdateUserProfileInput = {
  staffId: string;
  fullName: string;
  email: string;
  phone: string | null;
};

function parseUserId(staffId: string): number {
  const id = Number.parseInt(staffId.trim(), 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Your account could not be identified. Sign out and sign in again.');
  }
  return id;
}

function assertStaffAccount(roleId: number): void {
  if (roleId !== ROLE_TECHNICIAN && roleId !== ROLE_ADMIN) {
    throw new Error('This profile page is for technician accounts only. Sign in with a technician account to continue.');
  }
}

export async function getStaffProfile(staffId: string): Promise<StaffProfileRow> {
  const row = await findUserById(parseUserId(staffId));
  if (!row) throw new Error('No account was found with those details. Sign in again or contact support.');
  assertStaffAccount(row.role_id);

  const profile = await mapUserWithAzureProfile(row);
  return { ...profile, oid: row.oid?.trim() || null };
}

export async function updateStaffProfile(input: UpdateUserProfileInput): Promise<AuthUserRow> {
  const userId = parseUserId(input.staffId);
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;

  if (!email) {
    throw new Error('An email address is required. Enter your email to continue.');
  }

  const row = await findUserById(userId);
  if (!row) throw new Error('No account was found with those details. Sign in again or contact support.');
  assertStaffAccount(row.role_id);

  const emailOwner = await findUserByEmail(email);
  if (emailOwner && emailOwner.id !== userId) {
    throw new Error('Another account already uses this email. Enter a different email address.');
  }

  const pool = getDbPool();
  await pool.execute(`UPDATE users SET email = ?, phone = ? WHERE id = ?`, [email, phone, userId]);

  return getStaffProfile(input.staffId);
}

export async function getUserProfile(staffId: string): Promise<AuthUserRow> {
  const row = await findUserById(parseUserId(staffId));
  if (!row) throw new Error('No user account was found. Sign in again or contact support.');
  if (row.role_id !== ROLE_USER) {
    throw new Error('This profile page is for user accounts only. Sign in with a user account to continue.');
  }
  return mapUserWithAzureProfile(row);
}

export async function updateUserProfile(input: {
  staffId: string;
  phone: string | null;
}): Promise<AuthUserRow> {
  const userId = parseUserId(input.staffId);
  const phone = input.phone?.trim() || null;

  if (!phone) {
    throw new Error('A phone number is required. Enter your phone number to complete your profile.');
  }

  const row = await findUserById(userId);
  if (!row) throw new Error('No user account was found. Sign in again or contact support.');
  if (row.role_id !== ROLE_USER) {
    throw new Error('Only user accounts can update this profile. Sign in with a user account to continue.');
  }

  const pool = getDbPool();
  await pool.execute(`UPDATE users SET phone = ? WHERE id = ?`, [phone, userId]);

  return getUserProfile(input.staffId);
}

export async function getAuthUserByStaffId(staffId: string): Promise<AuthUserRow | null> {
  const row = await findUserById(parseUserId(staffId));
  if (!row) return null;
  return mapUserWithAzureProfile(row);
}
