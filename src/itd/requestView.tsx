import { useCallback, useEffect, useMemo, useState } from 'react';
import { Laptop, Loader2, Search, Tv, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { REQUEST_STATUS_ACTIVE } from '@shared/lib/request-schema';
import type { RequestAssignableKind, RequestPoolAsset } from '@shared/lib/request-schema';
import { AssetStatusBadge } from '@/itd/asset-status-badge';
import { TechnicianShell } from '@/itd/technician-shell';
import { RequestToolbarActions } from '@/itd/request-toolbar-actions';
import { listRequestPoolAssetsFn, removeAssetFromRequestPoolFn } from '@backend/server/requests/request.functions';
import { cn } from '@/lib/utils';

type KindFilter = 'all' | RequestAssignableKind;

function assetKey(kind: RequestAssignableKind, assetId: number) {
  return `${kind}:${assetId}`;
}

function canRemoveFromPool(asset: RequestPoolAsset) {
  return asset.statusId === REQUEST_STATUS_ACTIVE && asset.assignmentId == null;
}

export function TechnicianRequestViewPage() {
  const [assets, setAssets] = useState<RequestPoolAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listRequestPoolAssetsFn();
      setAssets(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load request pool');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = assets;
    if (kindFilter !== 'all') {
      list = list.filter((a) => a.kind === kindFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) =>
      [
        String(a.assetId),
        a.assetIdOld,
        a.model,
        a.brand,
        a.category,
        a.serialNum,
        a.kind,
        a.requestId != null ? String(a.requestId) : 'available',
        a.requesterName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [assets, search, kindFilter]);

  const assignedCount = assets.filter((a) => a.assignmentId != null).length;
  const availableCount = assets.filter((a) => canRemoveFromPool(a)).length;

  const handleRemoveFromPool = async (asset: RequestPoolAsset) => {
    const key = assetKey(asset.kind, asset.assetId);
    setRemovingKey(key);
    try {
      await removeAssetFromRequestPoolFn({
        data: { kind: asset.kind, assetId: asset.assetId },
      });
      toast.success(`${asset.kind === 'laptop' ? 'Laptop' : 'AV'} #${asset.assetId} returned to inventory (status return)`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove asset from pool');
    } finally {
      setRemovingKey(null);
    }
  };

  const laptopAssets = useMemo(() => filtered.filter((a) => a.kind === 'laptop'), [filtered]);
  const avAssets = useMemo(() => filtered.filter((a) => a.kind === 'av'), [filtered]);

  const renderGroup = (kind: RequestAssignableKind, list: RequestPoolAsset[]) => {
    if (list.length === 0) return null;
    const KindIcon = kind === 'laptop' ? Laptop : Tv;
    const label = kind === 'laptop' ? 'Laptop' : 'AV Equipment';

    return (
      <section key={kind} className="space-y-3">
        <div className="flex items-center gap-2">
          <KindIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">{label}</h3>
          <span className="text-xs text-muted-foreground">({list.length})</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((asset) => (
            <AssetPoolCard
              key={assetKey(asset.kind, asset.assetId)}
              asset={asset}
              removingKey={removingKey}
              onRemove={() => void handleRemoveFromPool(asset)}
            />
          ))}
        </div>
      </section>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      );
    }

    if (filtered.length === 0) {
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {assets.length === 0
            ? 'No assets in the request pool yet. Add assets from the previous page.'
            : 'No assets match your filters.'}
        </p>
      );
    }

    if (kindFilter === 'all') {
      return (
        <div className="space-y-6">
          {renderGroup('laptop', laptopAssets)}
          {renderGroup('av', avAssets)}
        </div>
      );
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((asset) => (
          <AssetPoolCard
            key={assetKey(asset.kind, asset.assetId)}
            asset={asset}
            removingKey={removingKey}
            onRemove={() => void handleRemoveFromPool(asset)}
          />
        ))}
      </div>
    );
  };

  return (
    <TechnicianShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Request pool</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">
            Assigned laptop &amp; AV assets. {' '}
            {availableCount} available · {assignedCount} assigned to a user request.
          </p>
        </div>
        <RequestToolbarActions />
      </div>

      <Card className="rounded-[14px] border-border shadow-sm">
        <CardHeader className="flex flex-col gap-3 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Request pool</CardTitle>
              <CardDescription>
                {filtered.length} shown · {assets.length} total in pool
              </CardDescription>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search asset ID, model, brand, requester…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-[8px] pl-9"
              />
            </div>
          </div>
          <ToggleGroup
            type="single"
            value={kindFilter}
            onValueChange={(v) => {
              if (v) setKindFilter(v as KindFilter);
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="all" className="rounded-[8px] px-3 text-xs">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="laptop" className="gap-1.5 rounded-[8px] px-3 text-xs">
              <Laptop className="h-3.5 w-3.5" />
              Laptop
            </ToggleGroupItem>
            <ToggleGroupItem value="av" className="gap-1.5 rounded-[8px] px-3 text-xs">
              <Tv className="h-3.5 w-3.5" />
              AV
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent className="pt-1">
          {renderContent()}
        </CardContent>
      </Card>
    </TechnicianShell>
  );
}

function AssetPoolCard({
  asset,
  removingKey,
  onRemove,
}: {
  asset: RequestPoolAsset;
  removingKey: string | null;
  onRemove: () => void;
}) {
  const key = `${asset.kind}:${asset.assetId}`;
  const isRemoving = removingKey === key;
  const removable = canRemoveFromPool(asset);
  const isBooked = asset.assignmentId != null;
  const KindIcon = asset.kind === 'laptop' ? Laptop : Tv;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[12px] border p-4 transition-colors',
        isBooked
          ? 'border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20'
          : 'border-border bg-card',
      )}
    >
      {/* Header row: kind icon + ID + remove button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]',
              isBooked
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <KindIcon className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold leading-tight">{asset.assetId}</p>
            {asset.assetIdOld ? (
              <p className="text-[10px] leading-tight text-muted-foreground">{asset.assetIdOld}</p>
            ) : null}
          </div>
        </div>
        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-[8px] text-muted-foreground hover:text-destructive"
            disabled={isRemoving}
            aria-label="Remove from pool"
            onClick={onRemove}
          >
            {isRemoving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : (
          <div className="h-7 w-7 shrink-0" />
        )}
      </div>

      {/* Model + Brand */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-snug">
          {asset.model ?? <span className="text-muted-foreground">—</span>}
        </p>
        {asset.brand ? (
          <p className="truncate text-xs text-muted-foreground">{asset.brand}</p>
        ) : null}
      </div>

      {/* Footer: category + status */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
        {asset.category ? (
          <span className="rounded-[6px] bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {asset.category}
          </span>
        ) : null}
        <AssetStatusBadge statusId={asset.statusId} />
      </div>

      {/* Assignment info */}
      {isBooked && asset.requesterName ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Assigned to {asset.requesterName}
        </p>
      ) : null}
    </div>
  );
}
