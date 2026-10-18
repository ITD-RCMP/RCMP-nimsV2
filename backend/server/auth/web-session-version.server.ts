import type { RowDataPacket } from 'mysql2';
import { getDbPool } from '@backend/server/core/db';

let tableReady: Promise<void> | null = null;

async function ensureWebSessionTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const pool = getDbPool();
      await pool.execute(
        `CREATE TABLE IF NOT EXISTS web_session (
          user_id INT UNSIGNED NOT NULL,
          session_version INT UNSIGNED NOT NULL,
          PRIMARY KEY (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      );
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

function asVersion(value: unknown): number | null {
  const version = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(version) || version < 1) return null;
  return version;
}

export async function readWebSessionVersion(userId: number): Promise<number | null> {
  await ensureWebSessionTable();
  const pool = getDbPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT session_version FROM web_session WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return asVersion(rows[0]?.session_version);
}

export type WebSessionBinding = {
  sessionVersion: number;
  roleId: number;
  roleName: string;
};

export async function readWebSessionBinding(userId: number): Promise<WebSessionBinding | null> {
  await ensureWebSessionTable();
  const pool = getDbPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT w.session_version, u.role_id, r.name AS role_name
     FROM web_session w
     INNER JOIN users u ON u.id = w.user_id
     INNER JOIN role r ON r.id = u.role_id
     WHERE w.user_id = ?
     LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const sessionVersion = asVersion(row.session_version);
  const roleId = Number(row.role_id);
  if (sessionVersion == null || !Number.isInteger(roleId) || roleId < 1) return null;
  return {
    sessionVersion,
    roleId,
    roleName: typeof row.role_name === 'string' ? row.role_name : '',
  };
}

export async function ensureWebSessionVersion(userId: number): Promise<number> {
  await ensureWebSessionTable();
  const pool = getDbPool();
  await pool.execute(
    `INSERT INTO web_session (user_id, session_version) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE session_version = session_version`,
    [userId],
  );
  const version = await readWebSessionVersion(userId);
  if (version == null) {
    throw new Error('Could not start a web session.');
  }
  return version;
}

export async function bumpWebSessionVersion(userId: number): Promise<void> {
  await ensureWebSessionTable();
  const pool = getDbPool();
  await pool.execute(
    `INSERT INTO web_session (user_id, session_version) VALUES (?, 2)
     ON DUPLICATE KEY UPDATE session_version = session_version + 1`,
    [userId],
  );
}
