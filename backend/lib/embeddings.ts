import { createHash } from 'node:crypto';
import { loadServerEnv } from '@backend/server/core/env.server';

export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const EMBED_BATCH_SIZE = 32;

export function getOpenRouterEmbeddingModel() {
  loadServerEnv();
  return process.env.OPENROUTER_EMBEDDING_MODEL?.trim() || '';
}

export function getOpenRouterEmbeddingApiKey() {
  loadServerEnv();
  return (
    process.env.OPENROUTER_EMBEDDING_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    ''
  );
}

export function isEmbeddingsConfigured() {
  return Boolean(getOpenRouterEmbeddingApiKey() && getOpenRouterEmbeddingModel());
}

export function contentHash(parts: Array<string | number | null | undefined>) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex');
}

type EmbeddingsResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
};

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!isEmbeddingsConfigured()) {
    throw new Error('Embedding search is not configured. Set OPENROUTER_EMBEDDING_MODEL.');
  }

  const model = getOpenRouterEmbeddingModel();
  const apiKey = getOpenRouterEmbeddingApiKey();
  const vectors: number[][] = new Array(texts.length);

  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          process.env.OPENROUTER_HTTP_REFERER?.trim() || 'http://localhost:8080',
        'X-Title': process.env.OPENROUTER_APP_TITLE?.trim() || 'NIMS',
      },
      body: JSON.stringify({
        model,
        input: batch,
        encoding_format: 'float',
      }),
    });

    const payload = (await response.json().catch(() => null)) as EmbeddingsResponse | null;
    if (!response.ok) {
      const detail = payload?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Embedding request failed: ${detail}`);
    }

    const rows = payload?.data;
    if (!Array.isArray(rows) || rows.length !== batch.length) {
      throw new Error('Embedding request returned an unexpected payload.');
    }

    for (const row of rows) {
      const index = typeof row.index === 'number' ? row.index : rows.indexOf(row);
      const embedding = row.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Embedding request returned an empty vector.');
      }
      vectors[offset + index] = embedding;
    }
  }

  return vectors;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const [vector] = await embedTexts([trimmed]);
    return vector ?? null;
  } catch (error) {
    console.error('[admin-prompt] Embedding query failed.', error);
    return null;
  }
}
