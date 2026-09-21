import type { RowDataPacket } from 'mysql2';
import { assetIdNewestYearFirstSql } from '@/hooks/assetid-generator';
import type { LandingSampleAsset, LandingStatusRow, LandingSystemStatus } from '@shared/lib/landing-status-types';
import { isEmailConfigured } from '@backend/lib/microsoft-email-config';
import { getDbPool } from '@backend/server/core/db';

type SampleRow = RowDataPacket & {
  kind: string;
  asset_id: number;
  brand: string | null;
  model: string | null;
  serial_num: string | null;
  category: string | null;
  status_id: number;
  status_name: string;
};

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

async function loadSampleAssets(): Promise<LandingSampleAsset[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<SampleRow[]>(
    `(SELECT 'laptop' AS kind, l.asset_id, l.brand, l.model, l.serial_num, l.category, l.status_id, s.name AS status_name
      FROM laptop l INNER JOIN status s ON s.status_id = l.status_id
      ORDER BY ${assetIdNewestYearFirstSql('l.asset_id')} LIMIT 2)
     UNION ALL
     (SELECT 'av' AS kind, a.asset_id, a.brand, a.model, a.serial_num, a.category, a.status_id, s.name AS status_name
      FROM av a INNER JOIN status s ON s.status_id = a.status_id
      ORDER BY ${assetIdNewestYearFirstSql('a.asset_id')} LIMIT 1)
     UNION ALL
     (SELECT 'network' AS kind, n.asset_id, n.brand, n.model, n.serial_num, n.category, n.status_id, s.name AS status_name
      FROM network n INNER JOIN status s ON s.status_id = n.status_id
      ORDER BY ${assetIdNewestYearFirstSql('n.asset_id')} LIMIT 1)`,
  );

  return rows.map((r) => {
    const kind = r.kind === 'laptop' || r.kind === 'av' || r.kind === 'network' ? r.kind : 'laptop';
    const model = r.model?.trim() || '—';
    const brand = r.brand?.trim();
    const label =
      kind === 'laptop'
        ? [brand, model].filter(Boolean).join(' ') || model
        : kind === 'av'
          ? r.category?.trim() || model
          : r.category?.trim() || model;
    const detail =
      kind === 'network'
        ? `Asset #${r.asset_id}`
        : r.serial_num?.trim() || `Asset #${r.asset_id}`;

    return {
      kind,
      assetId: r.asset_id,
      label,
      detail,
      statusId: r.status_id,
      statusName: r.status_name,
    };
  });
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
  let sampleAssets: LandingSampleAsset[] = [];

  if (dbOk) {
    try {
      sampleAssets = await loadSampleAssets();
    } catch {
      sampleAssets = [];
    }
  }

  return {
    fetchedAt: formatFetchedAt(),
    rows: buildStatusRows(dbOk),
    sampleAssets,
  };
}
