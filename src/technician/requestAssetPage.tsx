import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Laptop, PackagePlus, Plus, Search, Tv, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ActiveForRequestAsset, RequestAssignableKind } from '@shared/lib/request-schema';
import {
  avCategoryMatchesRequestCatalog,
  avRequestCategoryChoices,
} from '@shared/lib/request-asset-types';
import { isKnownLaptopCategory, LAPTOP_CATEGORY_OPTIONS } from '@/hooks/assetid-generator';
import { AssetStatusBadge } from '@/technician/asset-status-badge';
import { TechnicianShell } from '@/technician/technician-shell';
import { RequestToolbarActions } from '@/technician/request-toolbar-actions';
import {
  listActiveForRequestPoolFn,
  markAssetsForRequestFn,
  updateRequestAssetCategoryFn,
} from '@backend/server/requests/request.functions';

function categoryChoices(kind: RequestAssignableKind): readonly string[] {
  return kind === 'laptop' ? LAPTOP_CATEGORY_OPTIONS : avRequestCategoryChoices();
}

function categoryFitsRequest(kind: RequestAssignableKind, category: string | null | undefined) {
  if (kind === 'laptop') return isKnownLaptopCategory(category);
  return avCategoryMatchesRequestCatalog(category);
}

function assetKey(kind: RequestAssignableKind, assetId: number) {
  return `${kind}:${assetId}`;
}

function assetMatchesQuery(a: ActiveForRequestAsset, q: string) {
  return [String(a.assetId), a.assetIdOld, a.model, a.brand, a.category, a.serialNum, a.kind]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export function TechnicianRequestAssetPage() {
  const [assets, setAssets] = useState<ActiveForRequestAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [staged, setStaged] = useState<ActiveForRequestAsset[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listActiveForRequestPoolFn();
      setAssets(rows);
      setStaged([]);
      setCategoryDraft({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stagedKeys = useMemo(
    () => new Set(staged.map((a) => assetKey(a.kind, a.assetId))),
    [staged],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return assets
      .filter((a) => !stagedKeys.has(assetKey(a.kind, a.assetId)) && assetMatchesQuery(a, q))
      .slice(0, 8);
  }, [assets, stagedKeys, query]);

  const addAsset = (asset: ActiveForRequestAsset) => {
    const key = assetKey(asset.kind, asset.assetId);
    if (stagedKeys.has(key)) {
      setQuery('');
      setOpen(false);
      return;
    }
    setStaged((prev) => [...prev, asset]);
    setQuery('');
    setOpen(false);
    setInputError(null);
    inputRef.current?.focus();
  };

  const handleSubmitQuery = () => {
    const q = query.trim();
    if (!q) return;
    const qLower = q.toLowerCase();
    const match = assets.find(
      (a) => String(a.assetId) === q || (a.assetIdOld && a.assetIdOld.toLowerCase() === qLower),
    );
    if (!match) {
      setInputError(`No eligible asset found for "${q}"`);
      return;
    }
    addAsset(match);
  };

  const removeStaged = (key: string) => {
    setStaged((prev) => prev.filter((a) => assetKey(a.kind, a.assetId) !== key));
    setCategoryDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const missingCategory = useMemo(
    () =>
      staged.filter((asset) => {
        const key = assetKey(asset.kind, asset.assetId);
        const nextCategory = categoryDraft[key] || asset.category;
        return !categoryFitsRequest(asset.kind, nextCategory);
      }),
    [staged, categoryDraft],
  );

  const handleAssign = async () => {
    if (staged.length === 0) {
      toast.error('Stage at least one asset');
      return;
    }
    if (missingCategory.length > 0) {
      toast.error('Set a request category for assets that do not match before assigning them.');
      return;
    }
    setAdding(true);
    try {
      for (const asset of staged) {
        const key = assetKey(asset.kind, asset.assetId);
        const nextCategory = categoryDraft[key];
        if (!nextCategory || categoryFitsRequest(asset.kind, asset.category)) continue;
        await updateRequestAssetCategoryFn({
          data: { kind: asset.kind, assetId: asset.assetId, category: nextCategory },
        });
      }
      const result = await markAssetsForRequestFn({
        data: {
          assets: staged.map((a) => ({ kind: a.kind, assetId: a.assetId })),
        },
      });
      if (result.updated > 0) {
        toast.success(
          `Added ${result.updated} asset${result.updated === 1 ? '' : 's'} to the request pool`,
        );
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} failed`, {
          description: result.errors.slice(0, 3).join(' · '),
        });
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add assets');
    } finally {
      setAdding(false);
    }
  };

  return (
    <TechnicianShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Add assets for request</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">
            Type an asset ID or legacy ID and add it to your list. Once everything is listed,
            assign the whole list to the request pool at once.
          </p>
        </div>
        <RequestToolbarActions />
      </div>

      <Card className="rounded-[14px] border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add asset to list</CardTitle>
          <CardDescription>
            {loading
              ? 'Loading eligible assets…'
              : `${assets.length} eligible new or return laptop/AV asset${assets.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  placeholder="Asset ID or legacy ID…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setInputError(null);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmitQuery();
                    }
                  }}
                  className="h-10 rounded-[8px] pl-9"
                />
              </div>
              <Button
                type="button"
                className="gap-1.5 rounded-[8px]"
                disabled={!query.trim()}
                onClick={handleSubmitQuery}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            {inputError ? (
              <p className="mt-1.5 text-xs text-destructive">{inputError}</p>
            ) : null}
            {open && suggestions.length > 0 ? (
              <div className="absolute z-20 mt-1 w-full max-w-md overflow-hidden rounded-[8px] border border-border bg-popover shadow-md">
                <ul className="max-h-64 overflow-y-auto py-1">
                  {suggestions.map((a) => {
                    const key = assetKey(a.kind, a.assetId);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addAsset(a)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          {a.kind === 'laptop' ? (
                            <Laptop className="h-4 w-4 shrink-0 text-[oklch(0.45_0.12_290)]" />
                          ) : (
                            <Tv className="h-4 w-4 shrink-0 text-[oklch(0.45_0.12_290)]" />
                          )}
                          <code className="text-xs">{a.assetId}</code>
                          {a.assetIdOld ? (
                            <span className="text-xs text-muted-foreground">
                              ({a.assetIdOld})
                            </span>
                          ) : null}
                          <span className="truncate text-muted-foreground">
                            {a.model ?? '—'}
                          </span>
                          <AssetStatusBadge statusId={a.statusId} className="ml-auto" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {staged.length} asset{staged.length === 1 ? '' : 's'} listed
            </p>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 rounded-[8px]"
              disabled={staged.length === 0 || adding || missingCategory.length > 0}
              onClick={() => void handleAssign()}
            >
              <PackagePlus className="h-4 w-4" />
              {adding ? 'Assigning…' : 'Assign to request pool'}
            </Button>
          </div>

          {staged.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No assets listed yet. Search above to add one.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-[10px] border border-border">
              {staged.map((asset) => (
                <StagedRow
                  key={assetKey(asset.kind, asset.assetId)}
                  asset={asset}
                  draft={categoryDraft[assetKey(asset.kind, asset.assetId)] ?? ''}
                  onDraft={(category) =>
                    setCategoryDraft((prev) => ({
                      ...prev,
                      [assetKey(asset.kind, asset.assetId)]: category,
                    }))
                  }
                  onRemove={() => removeStaged(assetKey(asset.kind, asset.assetId))}
                />
              ))}
            </ul>
          )}
          {missingCategory.length > 0 ? (
            <p className="text-xs text-amber-600">
              Set a category for the highlighted asset{missingCategory.length === 1 ? '' : 's'}{' '}
              before assigning.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </TechnicianShell>
  );
}

function StagedRow({
  asset,
  draft,
  onDraft,
  onRemove,
}: {
  asset: ActiveForRequestAsset;
  draft: string;
  onDraft: (category: string) => void;
  onRemove: () => void;
}) {
  const needsCategory = !categoryFitsRequest(asset.kind, draft || asset.category);

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {asset.kind === 'laptop' ? (
        <Laptop className="h-4 w-4 shrink-0 text-[oklch(0.45_0.12_290)]" />
      ) : (
        <Tv className="h-4 w-4 shrink-0 text-[oklch(0.45_0.12_290)]" />
      )}
      <div className="min-w-[6rem]">
        <code className="text-xs">{asset.assetId}</code>
        {asset.assetIdOld ? (
          <p className="text-[10px] text-muted-foreground">{asset.assetIdOld}</p>
        ) : null}
      </div>
      <span className="min-w-[8rem] flex-1 truncate text-sm font-medium">
        {asset.model ?? '—'}
      </span>
      <AssetStatusBadge statusId={asset.statusId} />
      {needsCategory ? (
        <div className="flex flex-col">
          <Select value={draft || undefined} onValueChange={onDraft}>
            <SelectTrigger className="h-8 w-[11.5rem] rounded-[8px] text-xs">
              <SelectValue placeholder="Set category" />
            </SelectTrigger>
            <SelectContent>
              {categoryChoices(asset.kind).map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {asset.category?.trim() ? (
            <p className="mt-1 text-[10px] text-muted-foreground">Now: {asset.category}</p>
          ) : null}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">{asset.category ?? '—'}</span>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="ml-auto h-8 w-8 rounded-[8px] text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label={`Remove ${asset.kind} ${asset.assetId}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}
