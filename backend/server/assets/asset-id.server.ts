import type { RowDataPacket } from 'mysql2';
import type { AssetKind } from '@shared/lib/inventory-schema';
import {
  buildNextAssetId,
  buildSequentialAssetIds,
  getAssetIdRange,
  getAssetIdYearDigits,
  getLaptopAssetIdPrefix,
  getPrefixForKind,
} from '@/hooks/assetid-generator';
import { getDbPool } from '@backend/server/core/db';

type MaxRow = RowDataPacket & { max_id: number | null };

const TABLE_BY_KIND: Record<AssetKind, string> = {
  laptop: 'laptop',
  av: 'av',
  network: 'network',
};

async function queryMaxAssetIdInRange(table: string, min: number, max: number): Promise<number | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<MaxRow[]>(
    `SELECT MAX(CAST(SUBSTRING_INDEX(asset_id, ' ', 1) AS UNSIGNED)) AS max_id
     FROM \`${table}\`
     WHERE SUBSTRING_INDEX(asset_id, ' ', 1) REGEXP '^[0-9]+$'
       AND CAST(SUBSTRING_INDEX(asset_id, ' ', 1) AS UNSIGNED) BETWEEN ? AND ?`,
    [min, max],
  );
  const maxId = rows[0]?.max_id;
  return maxId != null ? Number(maxId) : null;
}

export type NextAssetIdRequest = {
  kind: AssetKind;
  /** Required when kind is laptop (Notebook vs Desktop prefix). */
  category?: string;
  yearDigits?: number;
};

/** Single add-asset: next ID for one prefix/year after checking DB. */
export async function getNextAssetIdFromDb(request: NextAssetIdRequest): Promise<number> {
  const yearDigits = request.yearDigits ?? getAssetIdYearDigits();
  const prefix = getPrefixForKind(request.kind, { category: request.category });
  const { min, max } = getAssetIdRange(prefix, yearDigits);
  const table = TABLE_BY_KIND[request.kind];
  const maxId = await queryMaxAssetIdInRange(table, min, max);
  return buildNextAssetId(maxId, prefix, yearDigits);
}

export type AllocateAssetIdsRequest = {
  kind: AssetKind;
  yearDigits?: number;
  /** For laptop bulk: one entry per row with category for prefix 12/14. */
  laptopCategories?: string[];
  count?: number;
};

/** Bulk: allocate N IDs for network/av, or per-category batches for laptop. */
export async function allocateAssetIdsFromDb(request: AllocateAssetIdsRequest): Promise<number[]> {
  const yearDigits = request.yearDigits ?? getAssetIdYearDigits();
  const table = TABLE_BY_KIND[request.kind];

  if (request.kind === 'laptop') {
    const categories = request.laptopCategories ?? [];
    if (categories.length === 0) return [];

    const byPrefix = new Map<number, number>();
    for (const category of categories) {
      const prefix = getLaptopAssetIdPrefix(category);
      byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
    }

    const prefixToIds = new Map<number, number[]>();
    for (const [prefix, count] of byPrefix) {
      const { min, max } = getAssetIdRange(prefix, yearDigits);
      const maxId = await queryMaxAssetIdInRange(table, min, max);
      prefixToIds.set(prefix, buildSequentialAssetIds(maxId, prefix, yearDigits, count));
    }

    const prefixQueues = new Map<number, number[]>();
    for (const [prefix, ids] of prefixToIds) {
      prefixQueues.set(prefix, [...ids]);
    }

    return categories.map((category) => {
      const prefix = getLaptopAssetIdPrefix(category);
      const queue = prefixQueues.get(prefix)!;
      const id = queue.shift();
      if (id === undefined) {
        throw new Error(
          'Asset ID allocation did not complete correctly. Try again, or contact support if this keeps happening.',
        );
      }
      return id;
    });
  }

  const count = request.count ?? 0;
  if (count <= 0) return [];

  const prefix = getPrefixForKind(request.kind);
  const { min, max } = getAssetIdRange(prefix, yearDigits);
  const maxId = await queryMaxAssetIdInRange(table, min, max);
  return buildSequentialAssetIds(maxId, prefix, yearDigits, count);
}
