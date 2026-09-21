import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, extname, relative, resolve } from 'node:path';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { RowDataPacket } from 'mysql2';
import { sqlDateToIso as formatDate } from '@shared/lib/date-format';
import type { AssetKind } from '@shared/lib/inventory-schema';
import {
  contentHash,
  embedQuery,
  embedTexts,
  getOpenRouterEmbeddingModel,
  isEmbeddingsConfigured,
} from '@backend/lib/embeddings';
import { getDbPool } from '@backend/server/core/db';

export const EMBEDDING_SOURCE_TYPES = ['repair', 'warranty_claim', 'request', 'faq'] as const;
export type EmbeddingSourceType = (typeof EMBEDDING_SOURCE_TYPES)[number];

export type MessyTextHit = {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  assetKind: string | null;
  assetId: string | null;
  requestId: number | null;
  score: number;
  snippet: string;
  occurredAt: string | null;
};

export type MessyTextSearchResult = {
  configured: boolean;
  indexed: number;
  results: MessyTextHit[];
  message: string | null;
};

export type EmbeddingSearchFilter = {
  query: string;
  limit?: number;
  sourceTypes?: EmbeddingSourceType[];
  assetKind?: AssetKind | string;
  assetId?: string | number;
  requestId?: number;
};

type CorpusChunk = {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  assetKind: string | null;
  assetId: string | null;
  requestId: number | null;
  text: string;
  occurredAt: string | null;
};

type ChunkRow = {
  source_type: EmbeddingSourceType;
  source_id: string;
  asset_kind: string | null;
  asset_id: string | null;
  request_id: number | null;
  text: string;
  dims: number;
  vector: Buffer;
  occurred_at: string | null;
};

const SNIPPET_CHARS = 420;
const CHUNK_CHARS = 700;
const CHUNK_OVERLAP = 80;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

function resolveProjectRoot() {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '../..'),
  ];
  for (const root of candidates) {
    if (existsSync(resolve(root, 'package.json'))) return root;
  }
  return process.cwd();
}

export function getEmbeddingsDbPath() {
  return resolve(resolveProjectRoot(), 'backend/data/ai-embeddings.sqlite');
}

function faqDirectories() {
  const root = resolveProjectRoot();
  return [resolve(root, 'backend/data/ai-faq'), resolve(root, 'docs/ai-faq')];
}

function loadBetterSqlite3() {
  const root = resolveProjectRoot();
  const require = createRequire(resolve(root, 'package.json'));
  return require('better-sqlite3') as typeof import('better-sqlite3');
}

let sqliteDb: SqliteDatabase | null = null;

function getSqlite(): SqliteDatabase {
  if (sqliteDb) return sqliteDb;
  const Database = loadBetterSqlite3();
  const path = getEmbeddingsDbPath();
  mkdirSync(resolve(path, '..'), { recursive: true });
  sqliteDb = new Database(path);
  sqliteDb.pragma('journal_mode = WAL');
  const schemaPath = resolve(
    resolveProjectRoot(),
    'backend/server/admin/admin-prompt-embeddings-schema.sql',
  );
  sqliteDb.exec(readFileSync(schemaPath, 'utf8'));
  return sqliteDb;
}

function clampLimit(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() || '';
}

function joinText(parts: Array<string | null | undefined>) {
  return parts.map(cleanText).filter(Boolean).join('\n');
}

export function chunkText(text: string, max = CHUNK_CHARS, overlap = CHUNK_OVERLAP) {
  const trimmed = cleanText(text);
  if (!trimmed) return [];
  if (trimmed.length <= max) return [trimmed];
  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(trimmed.length, start + max);
    chunks.push(trimmed.slice(start, end).trim());
    if (end >= trimmed.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks.filter(Boolean);
}

function snippetFrom(text: string) {
  const trimmed = cleanText(text);
  if (trimmed.length <= SNIPPET_CHARS) return trimmed;
  return `${trimmed.slice(0, SNIPPET_CHARS - 1).trim()}…`;
}

function blobToVector(buffer: Buffer, dims: number) {
  const copy = Buffer.from(buffer);
  return new Float32Array(copy.buffer, copy.byteOffset, dims);
}

function vectorToBlob(vector: number[]) {
  const arr = Float32Array.from(vector);
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function cosine(a: Float32Array, b: Float32Array) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function expandChunks(base: Omit<CorpusChunk, 'sourceId' | 'text'> & { sourceId: string; text: string }) {
  const pieces = chunkText(base.text);
  return pieces.map((text, index) => ({
    ...base,
    sourceId: pieces.length === 1 ? base.sourceId : `${base.sourceId}#${index}`,
    text,
  }));
}

async function loadRepairChunks(): Promise<CorpusChunk[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<
    (RowDataPacket & {
      repair_id: number;
      asset_id: number | string;
      asset_type: string;
      repair_date: Date | string | null;
      issue_summary: string | null;
      repair_remarks: string | null;
    })[]
  >(
    `SELECT repair_id, asset_id, asset_type, repair_date, issue_summary, repair_remarks
     FROM repair`,
  );
  return rows.flatMap((row) => {
    const text = joinText([row.issue_summary, row.repair_remarks]);
    if (!text) return [];
    return expandChunks({
      sourceType: 'repair',
      sourceId: String(row.repair_id),
      assetKind: row.asset_type,
      assetId: String(row.asset_id),
      requestId: null,
      text,
      occurredAt: row.repair_date ? formatDate(row.repair_date) : null,
    });
  });
}

async function loadWarrantyClaimChunks(): Promise<CorpusChunk[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<
    (RowDataPacket & {
      claim_id: number;
      asset_id: number | string;
      asset_type: string;
      claim_date: Date | string | null;
      issue_summary: string | null;
      claim_remarks: string | null;
    })[]
  >(
    `SELECT claim_id, asset_id, asset_type, claim_date, issue_summary, claim_remarks
     FROM warranty_claim`,
  );
  return rows.flatMap((row) => {
    const text = joinText([row.issue_summary, row.claim_remarks]);
    if (!text) return [];
    return expandChunks({
      sourceType: 'warranty_claim',
      sourceId: String(row.claim_id),
      assetKind: row.asset_type,
      assetId: String(row.asset_id),
      requestId: null,
      text,
      occurredAt: row.claim_date ? formatDate(row.claim_date) : null,
    });
  });
}

async function loadRequestChunks(): Promise<CorpusChunk[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<
    (RowDataPacket & {
      request_id: number;
      remarks: string | null;
      program_type: string | null;
      borrow_date: Date | string | null;
      return_date: Date | string | null;
    })[]
  >(
    `SELECT request_id, remarks, program_type, borrow_date, return_date
     FROM request
     WHERE remarks IS NOT NULL AND TRIM(remarks) <> ''`,
  );
  return rows.flatMap((row) => {
    const remarks = cleanText(row.remarks);
    if (!remarks) return [];
    const prefix = cleanText(row.program_type);
    const text = prefix ? `${prefix}: ${remarks}` : remarks;
    return expandChunks({
      sourceType: 'request',
      sourceId: String(row.request_id),
      assetKind: null,
      assetId: null,
      requestId: row.request_id,
      text,
      occurredAt: row.borrow_date ? formatDate(row.borrow_date) : null,
    });
  });
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
    .map((entry) => resolve(dir, entry.name));
}

function loadFaqChunks(): CorpusChunk[] {
  const files = faqDirectories().flatMap(listMarkdownFiles);
  return files.flatMap((filePath) => {
    const raw = readFileSync(filePath, 'utf8');
    const rel = relative(resolveProjectRoot(), filePath) || basename(filePath);
    const sections = raw.split(/(?=^#{1,3}\s)/m).map((section) => section.trim()).filter(Boolean);
    const bodies = sections.length > 0 ? sections : [raw];
    return bodies.flatMap((body, sectionIndex) => {
      const headingMatch = body.match(/^#{1,3}\s+(.+)$/m);
      const heading = headingMatch?.[1]?.trim() || basename(filePath, '.md');
      const paragraph = cleanText(body.replace(/^#{1,3}\s+.+$/m, ''));
      const text = joinText([heading, paragraph]);
      if (!text) return [];
      return expandChunks({
        sourceType: 'faq',
        sourceId: `${rel}#${sectionIndex}`,
        assetKind: null,
        assetId: null,
        requestId: null,
        text,
        occurredAt: null,
      });
    });
  });
}

export async function collectEmbeddingCorpus() {
  const [repairs, claims, requests] = await Promise.all([
    loadRepairChunks(),
    loadWarrantyClaimChunks(),
    loadRequestChunks(),
  ]);
  return [...repairs, ...claims, ...requests, ...loadFaqChunks()];
}

export type ReindexStats = {
  scanned: number;
  embedded: number;
  skipped: number;
  removed: number;
  errors: number;
  model: string;
  path: string;
};

export async function reindexAdminPromptEmbeddings(): Promise<ReindexStats> {
  if (!isEmbeddingsConfigured()) {
    throw new Error(
      'Embedding search is not configured. Set OPENROUTER_EMBEDDING_MODEL (and OPENROUTER_API_KEY) then retry.',
    );
  }

  const model = getOpenRouterEmbeddingModel();
  const db = getSqlite();
  const corpus = await collectEmbeddingCorpus();
  const existing = db
    .prepare(
      `SELECT source_type, source_id, content_hash FROM embedding_chunk WHERE model = ?`,
    )
    .all(model) as Array<{ source_type: string; source_id: string; content_hash: string }>;
  const existingMap = new Map(existing.map((row) => [`${row.source_type}:${row.source_id}`, row.content_hash]));
  const keepIds = new Set<string>();
  const toEmbed: CorpusChunk[] = [];
  let skipped = 0;

  for (const chunk of corpus) {
    const key = `${chunk.sourceType}:${chunk.sourceId}`;
    keepIds.add(key);
    const hash = contentHash([chunk.sourceType, chunk.sourceId, chunk.text, model]);
    if (existingMap.get(key) === hash) {
      skipped += 1;
      continue;
    }
    toEmbed.push(chunk);
  }

  let embedded = 0;
  let errors = 0;
  const upsert = db.prepare(
    `INSERT INTO embedding_chunk (
       source_type, source_id, asset_kind, asset_id, request_id, text, content_hash, model, dims, vector, occurred_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_type, source_id) DO UPDATE SET
       asset_kind = excluded.asset_kind,
       asset_id = excluded.asset_id,
       request_id = excluded.request_id,
       text = excluded.text,
       content_hash = excluded.content_hash,
       model = excluded.model,
       dims = excluded.dims,
       vector = excluded.vector,
       occurred_at = excluded.occurred_at,
       updated_at = excluded.updated_at`,
  );

  const batchSize = 24;
  for (let offset = 0; offset < toEmbed.length; offset += batchSize) {
    const batch = toEmbed.slice(offset, offset + batchSize);
    try {
      const vectors = await embedTexts(batch.map((chunk) => chunk.text));
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        batch.forEach((chunk, index) => {
          const vector = vectors[index];
          if (!vector) return;
          upsert.run(
            chunk.sourceType,
            chunk.sourceId,
            chunk.assetKind,
            chunk.assetId,
            chunk.requestId,
            chunk.text,
            contentHash([chunk.sourceType, chunk.sourceId, chunk.text, model]),
            model,
            vector.length,
            vectorToBlob(vector),
            chunk.occurredAt,
            now,
          );
        });
      });
      tx();
      embedded += batch.length;
    } catch (error) {
      errors += batch.length;
      console.error('[admin-prompt] Embedding batch failed.', error);
    }
  }

  const stale = existing.filter((row) => !keepIds.has(`${row.source_type}:${row.source_id}`));
  if (stale.length > 0) {
    const del = db.prepare(`DELETE FROM embedding_chunk WHERE source_type = ? AND source_id = ?`);
    const tx = db.transaction(() => {
      for (const row of stale) del.run(row.source_type, row.source_id);
    });
    tx();
  }

  return {
    scanned: corpus.length,
    embedded,
    skipped,
    removed: stale.length,
    errors,
    model,
    path: getEmbeddingsDbPath(),
  };
}

function parseSourceTypes(value?: EmbeddingSourceType[]) {
  if (!value?.length) return [...EMBEDDING_SOURCE_TYPES];
  return value.filter((item) => EMBEDDING_SOURCE_TYPES.includes(item));
}

export async function searchMessyText(filter: EmbeddingSearchFilter): Promise<MessyTextSearchResult> {
  const query = filter.query.trim();
  if (!query) {
    return { configured: isEmbeddingsConfigured(), indexed: 0, results: [], message: 'Enter a search phrase.' };
  }

  if (!isEmbeddingsConfigured()) {
    return {
      configured: false,
      indexed: 0,
      results: [],
      message:
        'Semantic search is not configured. Set OPENROUTER_EMBEDDING_MODEL and run npm run ai:reindex.',
    };
  }

  let indexed = 0;
  try {
    indexed = (
      getSqlite().prepare(`SELECT COUNT(*) AS cnt FROM embedding_chunk`).get() as { cnt: number }
    ).cnt;
  } catch (error) {
    console.error('[admin-prompt] Could not open embedding store.', error);
    return {
      configured: true,
      indexed: 0,
      results: [],
      message: 'Semantic index is not available yet. Run npm run ai:reindex.',
    };
  }

  if (indexed === 0) {
    return {
      configured: true,
      indexed: 0,
      results: [],
      message: 'No messy-text embeddings are indexed yet. Run npm run ai:reindex.',
    };
  }

  const vector = await embedQuery(query);
  if (!vector) {
    return {
      configured: true,
      indexed,
      results: [],
      message: 'Semantic search could not embed that question. Try again later.',
    };
  }

  const sourceTypes = parseSourceTypes(filter.sourceTypes);
  const queryVec = Float32Array.from(vector);
  const rows = getSqlite()
    .prepare(
      `SELECT source_type, source_id, asset_kind, asset_id, request_id, text, dims, vector, occurred_at
       FROM embedding_chunk
       WHERE source_type IN (${sourceTypes.map(() => '?').join(',')})`,
    )
    .all(...sourceTypes) as ChunkRow[];

  const assetId = filter.assetId != null ? String(filter.assetId) : null;
  const assetKind = filter.assetKind ?? null;
  const requestId = filter.requestId ?? null;

  const ranked: MessyTextHit[] = [];
  for (const row of rows) {
    if (assetId) {
      if (!row.asset_id || row.asset_id !== assetId) continue;
      if (assetKind && row.asset_kind && row.asset_kind !== assetKind) continue;
    }
    if (requestId != null && row.source_type === 'request' && row.request_id !== requestId) continue;
    const score = cosine(queryVec, blobToVector(row.vector, row.dims));
    ranked.push({
      sourceType: row.source_type,
      sourceId: row.source_id.split('#')[0] ?? row.source_id,
      assetKind: row.asset_kind,
      assetId: row.asset_id,
      requestId: row.request_id,
      score: Number(score.toFixed(4)),
      snippet: snippetFrom(row.text),
      occurredAt: row.occurred_at,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  const limit = clampLimit(filter.limit);
  return {
    configured: true,
    indexed,
    results: ranked.slice(0, limit),
    message: ranked.length === 0 ? 'No similar remarks, repairs, or claims were found.' : null,
  };
}
