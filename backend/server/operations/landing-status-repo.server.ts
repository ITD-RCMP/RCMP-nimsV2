import type { LandingStatusRow, LandingSystemStatus } from '@shared/lib/landing-status-types';
import { isEmailConfigured } from '@backend/lib/microsoft-email-config';
import { getDbPool } from '@backend/server/core/db';

function formatFetchedAt(): string {
  return new Date().toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function pingDatabase(): Promise<boolean> {
  try {
    const pool = getDbPool();
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function statusValue(ok: boolean): { value: 'Connected' | 'Unavailable'; level: 'ok' | 'error' } {
  return ok ? { value: 'Connected', level: 'ok' } : { value: 'Unavailable', level: 'error' };
}

function buildStatusRows(dbOk: boolean): LandingStatusRow[] {
  const data = statusValue(dbOk);

  return [
    { key: 'database', label: 'Database', ...data },
    { key: 'email', label: 'Email notifications', ...statusValue(isEmailConfigured()) },
    { key: 'assets', label: 'Assets registered', ...data },
    { key: 'staff', label: 'Staff directory', ...data },
    { key: 'requests', label: 'Borrow requests', ...data },
  ];
}

export async function getLandingSystemStatus(): Promise<LandingSystemStatus> {
  const dbOk = await pingDatabase();

  return {
    fetchedAt: formatFetchedAt(),
    rows: buildStatusRows(dbOk),
    sampleAssets: [],
  };
}
