import { useCallback, useEffect, useState } from 'react';
import {
  ASSET_KIND_LABEL,
  ASSET_LIST_PATH,
  formatStatusLabel,
  INSTOCK_STATUS_IDS,
  isInstockStatus,
  isOutstockStatus,
  OUTSTOCK_STATUS_IDS,
  type AssetId,
  type AssetKind,
  type AvAsset,
  type CreateAvInput,
  type CreateLaptopInput,
  type CreateNetworkInput,
  type LaptopAsset,
  type NetworkAsset,
} from '@shared/lib/inventory-schema';
import { compareAssetIdNewestYearFirst } from '@/hooks/assetid-generator';
import {
  bulkCreateAvImportFn,
  bulkCreateLaptopsImportFn,
  bulkCreateNetworkImportFn,
  createAvFn,
  createLaptopFn,
  createNetworkFn,
  listAssetsFn,
  updateAssetStatusFn,
} from '@backend/server/assets/assets.functions';

export type {
  AssetKind,
  AvAsset,
  CreateAvInput,
  CreateLaptopInput,
  CreateNetworkInput,
  LaptopAsset,
  NetworkAsset,
};
export { ASSET_KIND_LABEL, ASSET_LIST_PATH, formatStatusLabel, isInstockStatus, isOutstockStatus };

type AssetByKind = {
  laptop: LaptopAsset[];
  av: AvAsset[];
  network: NetworkAsset[];
};

export function useAssets<K extends AssetKind>(kind: K) {
  const [items, setItems] = useState<AssetByKind[K]>([] as AssetByKind[K]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAssetsFn({ data: kind });
      const sorted = [...(data as AssetByKind[K])].sort((a, b) =>
        compareAssetIdNewestYearFirst(a.assetId, b.assetId),
      );
      setItems(sorted as AssetByKind[K]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets');
      setItems([] as AssetByKind[K]);
    } finally {
      setIsLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: K extends 'laptop' ? CreateLaptopInput : K extends 'av' ? CreateAvInput : CreateNetworkInput) => {
      if (kind === 'laptop') {
        const created = await createLaptopFn({ data: input as CreateLaptopInput });
        await refetch();
        return created;
      }
      if (kind === 'av') {
        const created = await createAvFn({ data: input as CreateAvInput });
        await refetch();
        return created;
      }
      const created = await createNetworkFn({ data: input as CreateNetworkInput });
      await refetch();
      return created;
    },
    [kind, refetch],
  );

  const bulkCreate = useCallback(
    async (
      rows: K extends 'laptop'
        ? Array<Omit<CreateLaptopInput, 'assetId'> & { assetId?: string | number; tagging?: string | null }>
        : K extends 'av'
          ? Array<Omit<CreateAvInput, 'assetId'> & { assetId?: string | number; tagging?: string | null }>
          : Array<Omit<CreateNetworkInput, 'assetId'> & { assetId?: string | number; tagging?: string | null }>,
    ) => {
      let count = 0;
      if (kind === 'laptop') {
        count = await bulkCreateLaptopsImportFn({ data: rows as Omit<CreateLaptopInput, 'assetId'>[] });
      } else if (kind === 'av') {
        count = await bulkCreateAvImportFn({ data: rows as Omit<CreateAvInput, 'assetId'>[] });
      } else {
        count = await bulkCreateNetworkImportFn({ data: rows as Omit<CreateNetworkInput, 'assetId'>[] });
      }
      await refetch();
      return count;
    },
    [kind, refetch],
  );

  const updateStatus = useCallback(
    async (assetId: AssetId, statusId: number) => {
      await updateAssetStatusFn({ data: { kind, assetId, statusId } });
      await refetch();
    },
    [kind, refetch],
  );

  return { items, create, bulkCreate, updateStatus, isLoading, error, refetch };
}

export function filterBySearch<
  T extends {
    model: string | null;
    assetId: AssetId;
    serialNum?: string | null;
    brand?: string | null;
    remarks?: string | null;
    category?: string | null;
  },
>(items: T[], query: string, extra?: (item: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const haystack = [
      item.model,
      String(item.assetId),
      item.serialNum,
      item.brand,
      item.category,
      item.remarks,
      extra?.(item) ?? '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function filterByStatus<T extends { statusId: number }>(items: T[], statusId: number | null): T[] {
  if (statusId == null) return items;
  return items.filter((item) => item.statusId === statusId);
}

export type StockStatusCount = {
  statusId: number;
  count: number;
};

export function countStockAssets<T extends { statusId: number }>(items: T[]) {
  const counts = new Map<number, number>();
  for (const item of items) {
    counts.set(item.statusId, (counts.get(item.statusId) ?? 0) + 1);
  }

  const byStatus = (statusIds: readonly number[]): StockStatusCount[] =>
    statusIds.map((statusId) => ({ statusId, count: counts.get(statusId) ?? 0 }));

  return {
    instock: items.filter((i) => isInstockStatus(i.statusId)).length,
    outstock: items.filter((i) => isOutstockStatus(i.statusId)).length,
    instockByStatus: byStatus(INSTOCK_STATUS_IDS),
    outstockByStatus: byStatus(OUTSTOCK_STATUS_IDS),
  };
}
