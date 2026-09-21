import { getDbPool } from '@backend/server/core/db';

export type AdminPromptLogRow = {
  staffId?: string | null;
  scopeType: 'global' | 'asset' | 'request';
  scopeRef?: string | null;
  question: string;
  answer?: string | null;
  toolsUsed: string[];
  ok: boolean;
  errorMessage?: string | null;
  model?: string | null;
  latencyMs?: number | null;
};

const QUESTION_MAX = 2000;
const ANSWER_MAX = 8000;
const ERROR_MAX = 512;

let tableReady: Promise<void> | null = null;

function truncate(value: string | null | undefined, max: number) {
  const text = value?.trim() ?? '';
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function parseStaffId(staffId: string | null | undefined) {
  if (!staffId) return null;
  const id = Number.parseInt(staffId, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function ensureAdminPromptLogTable() {
  const pool = getDbPool();
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS admin_prompt_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      staff_id INT UNSIGNED NULL,
      scope_type VARCHAR(16) NOT NULL DEFAULT 'global',
      scope_ref VARCHAR(64) NULL,
      question TEXT NOT NULL,
      answer MEDIUMTEXT NULL,
      tools_used JSON NULL,
      ok TINYINT(1) NOT NULL DEFAULT 1,
      error_message VARCHAR(512) NULL,
      model VARCHAR(128) NULL,
      latency_ms INT UNSIGNED NULL,
      KEY idx_admin_prompt_log_created (created_at),
      KEY idx_admin_prompt_log_staff (staff_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
}

export async function insertAdminPromptLog(row: AdminPromptLogRow) {
  if (!tableReady) {
    tableReady = ensureAdminPromptLogTable().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;

  const pool = getDbPool();
  await pool.execute(
    `INSERT INTO admin_prompt_log
      (staff_id, scope_type, scope_ref, question, answer, tools_used, ok, error_message, model, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parseStaffId(row.staffId),
      row.scopeType,
      row.scopeRef?.slice(0, 64) || null,
      truncate(row.question, QUESTION_MAX) ?? '',
      truncate(row.answer, ANSWER_MAX),
      JSON.stringify(row.toolsUsed),
      row.ok ? 1 : 0,
      truncate(row.errorMessage, ERROR_MAX),
      row.model?.slice(0, 128) || null,
      row.latencyMs != null && Number.isFinite(row.latencyMs) ? Math.max(0, Math.round(row.latencyMs)) : null,
    ],
  );
}
