import type { RowDataPacket } from 'mysql2';
import { assetIdNewestYearFirstSql } from '@/hooks/assetid-generator';
import { attachDisplayNames, getDirectoryUsersByOids } from '@backend/server/core/azure-directory.server';
import { escapeCsvCell } from '@backend/server/admin/csv-cell';
import { getDbPool } from '@backend/server/core/db';

export type AdminExportKind =
  | 'users'
  | 'requests'
  | 'laptop'
  | 'av'
  | 'network'
  | 'staff'
  | 'handovers'
  | 'deployments';

export type AdminExportResult = {
  filename: string;
  contentType: string;
  body: string;
};

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\r\n');
}

export async function exportAdminCsv(kind: AdminExportKind): Promise<AdminExportResult> {
  const pool = getDbPool();
  const stamp = new Date().toISOString().slice(0, 10);

  if (kind === 'users') {
    const [rows] = await pool.query<
      (RowDataPacket & {
        id: number;
        oid: string | null;
        full_name: string;
        email: string;
        role_name: string;
        phone: string | null;
        last_login_at: Date | string | null;
        created_at: Date | string;
      })[]
    >(
      `SELECT u.id, u.oid, u.email, r.name AS role_name,
              u.phone, u.last_login_at, u.created_at
       FROM users u INNER JOIN role r ON r.id = u.role_id
       ORDER BY u.id`,
    );
    await attachDisplayNames(rows, 'oid', 'full_name');
    const directory = await getDirectoryUsersByOids(rows.map((r) => r.oid));
    return {
      filename: `nims-users-${stamp}.csv`,
      contentType: 'text/csv;charset=utf-8',
      body: toCsv(
        ['id', 'full_name', 'email', 'role', 'phone', 'last_login_at', 'created_at'],
        rows.map((r) => {
          const d = r.oid?.trim() ? directory.get(r.oid.trim()) : undefined;
          const email = (d?.email ?? r.email).trim();
          return [
            r.id,
            r.full_name,
            email,
            r.role_name,
            d?.phone ?? r.phone,
            r.last_login_at,
            r.created_at,
          ];
        }),
      ),
    };
  }

  if (kind === 'requests') {
    const [rows] = await pool.query<
      (RowDataPacket & {
        request_id: number;
        requester_oid: string | null;
        requester: string;
        borrow_date: Date | string;
        return_date: Date | string;
        program_type: string;
        usage_location: string;
        rejected_at: Date | string | null;
        created_at: Date | string;
        items: string | null;
      })[]
    >(
      `SELECT r.request_id, u.oid AS requester_oid, r.borrow_date, r.return_date,
              r.program_type, r.usage_location, r.rejected_at, r.created_at,
              (SELECT GROUP_CONCAT(CONCAT(ri.asset_type, ' x', ri.quantity) SEPARATOR '; ')
               FROM request_item ri WHERE ri.request_id = r.request_id) AS items
       FROM request r
       INNER JOIN users u ON u.id = r.requested_by
       ORDER BY r.request_id DESC`,
    );
    await attachDisplayNames(rows, 'requester_oid', 'requester');
    return {
      filename: `nims-requests-${stamp}.csv`,
      contentType: 'text/csv;charset=utf-8',
      body: toCsv(
        [
          'request_id',
          'requester',
          'borrow_date',
          'return_date',
          'program_type',
          'usage_location',
          'rejected_at',
          'created_at',
          'items',
        ],
        rows.map((r) => [
          r.request_id,
          r.requester,
          r.borrow_date,
          r.return_date,
          r.program_type,
          r.usage_location,
          r.rejected_at,
          r.created_at,
          r.items,
        ]),
      ),
    };
  }

  if (kind === 'staff') {
    const [rows] = await pool.query<
      (RowDataPacket & {
        employee_no: string;
        full_name: string;
        department: string | null;
        email: string | null;
        phone: string | null;
        remarks: string | null;
      })[]
    >(
      `SELECT employee_no, full_name, department, email, phone, remarks FROM staff ORDER BY employee_no`,
    );
    return {
      filename: `nims-staff-directory-${stamp}.csv`,
      contentType: 'text/csv;charset=utf-8',
      body: toCsv(
        ['employee_no', 'full_name', 'department', 'email', 'phone', 'remarks'],
        rows.map((r) => [r.employee_no, r.full_name, r.department, r.email, r.phone, r.remarks]),
      ),
    };
  }

  if (kind === 'handovers') {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT h.handover_id, h.asset_id, l.category, l.brand, l.model, l.serial_num,
              h.handover_date, COALESCE(h.handled_by_name, u.email) AS handled_by,
              hs.employee_no, s.full_name AS recipient, s.department,
              h.building, h.level, h.zone, h.handler, h.handover_remarks,
              CASE WHEN hr.return_id IS NULL THEN 'deployed' ELSE 'returned' END AS handover_status,
              hr.return_date, hr.return_time, hr.return_place, hr.\`condition\` AS return_condition,
              hr.return_remarks, COALESCE(hr.returned_by_name, ru.email) AS returned_by,
              h.created_at, h.updated_at
       FROM handover h
       INNER JOIN laptop l ON l.asset_id = h.asset_id
       INNER JOIN users u ON u.id = h.user_id
       LEFT JOIN handover_staff hs ON hs.handover_id = h.handover_id
       LEFT JOIN staff s ON s.employee_no = hs.employee_no
       LEFT JOIN handover_return hr
         ON hr.handover_staff_id = hs.handover_staff_id
         OR (hs.handover_staff_id IS NULL AND hr.handover_id = h.handover_id)
       LEFT JOIN users ru ON ru.id = hr.returned_by
       ORDER BY h.handover_date DESC, h.handover_id DESC`,
    );
    const headers = [
      'handover_id',
      'asset_id',
      'category',
      'brand',
      'model',
      'serial_num',
      'handover_date',
      'handled_by',
      'employee_no',
      'recipient',
      'department',
      'building',
      'level',
      'zone',
      'handler',
      'handover_remarks',
      'handover_status',
      'return_date',
      'return_time',
      'return_place',
      'return_condition',
      'return_remarks',
      'returned_by',
      'created_at',
      'updated_at',
    ];
    return {
      filename: `nims-handovers-${stamp}.csv`,
      contentType: 'text/csv;charset=utf-8',
      body: toCsv(
        headers,
        rows.map((row) => headers.map((header) => row[header])),
      ),
    };
  }

  if (kind === 'deployments') {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 'av' AS asset_type, d.deployment_id, d.asset_id, a.category, a.brand, a.model,
              a.serial_num, d.building, d.level, d.zone, d.deployment_date,
              d.deployment_remarks, u.email AS deployed_by,
              CASE WHEN r.return_id IS NULL THEN 'deployed' ELSE 'returned' END AS deployment_status,
              r.return_date, r.return_time, r.return_place, r.\`condition\` AS return_condition,
              r.return_remarks, ru.email AS returned_by, d.created_at, d.updated_at
       FROM it_deploy d
       INNER JOIN av a ON a.asset_id = d.asset_id
       INNER JOIN users u ON u.id = d.user_id
       LEFT JOIN it_return r ON r.deployment_id = d.deployment_id
       LEFT JOIN users ru ON ru.id = r.returned_by
       WHERE d.asset_type = 'av'
       UNION ALL
       SELECT 'network' AS asset_type, d.deployment_id, d.asset_id, NULL AS category, a.brand,
              a.model, a.serial_num, d.building, d.level, d.zone, d.deployment_date,
              d.deployment_remarks, u.email AS deployed_by,
              CASE WHEN r.return_id IS NULL THEN 'deployed' ELSE 'returned' END AS deployment_status,
              r.return_date, r.return_time, r.return_place, r.\`condition\` AS return_condition,
              r.return_remarks, ru.email AS returned_by, d.created_at, d.updated_at
       FROM it_deploy d
       INNER JOIN network a ON a.asset_id = d.asset_id
       INNER JOIN users u ON u.id = d.user_id
       LEFT JOIN it_return r ON r.deployment_id = d.deployment_id
       LEFT JOIN users ru ON ru.id = r.returned_by
       WHERE d.asset_type = 'network'
       ORDER BY deployment_date DESC, deployment_id DESC`,
    );
    const headers = [
      'asset_type',
      'deployment_id',
      'asset_id',
      'category',
      'brand',
      'model',
      'serial_num',
      'building',
      'level',
      'zone',
      'deployment_date',
      'deployment_remarks',
      'deployed_by',
      'deployment_status',
      'return_date',
      'return_time',
      'return_place',
      'return_condition',
      'return_remarks',
      'returned_by',
      'created_at',
      'updated_at',
    ];
    return {
      filename: `nims-deployments-${stamp}.csv`,
      contentType: 'text/csv;charset=utf-8',
      body: toCsv(
        headers,
        rows.map((row) => headers.map((header) => row[header])),
      ),
    };
  }

  const table = kind;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${table}\` ORDER BY ${assetIdNewestYearFirstSql()}`,
  );
  if (rows.length === 0) {
    return {
      filename: `nims-${table}-${stamp}.csv`,
      contentType: 'text/csv;charset=utf-8',
      body: '',
    };
  }
  const headers = Object.keys(rows[0]);
  return {
    filename: `nims-${table}-${stamp}.csv`,
    contentType: 'text/csv;charset=utf-8',
    body: toCsv(
      headers,
      rows.map((r) => headers.map((h) => r[h])),
    ),
  };
}
