import { useCallback, useEffect, useState } from 'react';
import type { AssetKind } from '@shared/lib/inventory-schema';
import { getNextAssetIdFn } from '@backend/server/assets/assets.functions';

export function useNextAssetId(kind: AssetKind, laptopCategory?: string) {
  const [assetId, setAssetId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const id = await getNextAssetIdFn({
        data: {
          kind,
          category: kind === 'laptop' ? laptopCategory : undefined,
        },
      });
      setAssetId(id);
      return id;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to generate asset ID';
      setError(message);
      setAssetId(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [kind, laptopCategory]);

  useEffect(() => {
    if (kind === 'laptop' && !laptopCategory?.trim()) {
      setAssetId(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    void refetch();
  }, [kind, laptopCategory, refetch]);

  return { assetId, isLoading, error, refetch };
}
