import { useCallback, useEffect, useMemo, useState } from 'react';
import { Laptop, Network, PackageCheck, Recycle, Search, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { InsightStatCard } from '@/components/insight-stat-card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatAssetLifespan } from '@shared/lib/date-format';
import { ASSET_KIND_LABEL, type AssetKind } from '@shared/lib/inventory-schema';
import { isLifespanOverYears, type PredisposalEligibleAsset, type PreDisposedAsset } from '@shared/lib/disposal-schema';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { AssetStatusBadge } from '@/technician/asset-status-badge';
import { AssetTablePagination } from '@/technician/asset-table-pagination';
import { TechnicianDisposalViewMenu } from '@/technician/disposal-view-menu';
import { TechnicianShell } from '@/technician/technician-shell';
import {
  listPredisposalEligibleAssetsFn,
  listPreDisposedAssetsFn,
  markAssetsPredisposedFn,
} from '@backend/server/assets/assets.functions';

function assetKey(kind: AssetKind, assetId: PredisposalEligibleAsset['assetId']) {
  return `${kind}:${assetId}`;
}

const KIND_ORDER: AssetKind[] = ['laptop', 'av', 'network'];
const KIND_COUNT_LABEL: Record<AssetKind, string> = {
  laptop: 'Laptop',
  av: 'AV',
  network: 'Network',
};

function KindCountList({ assets }: { assets: { kind: AssetKind }[] }) {
  return (
    <ul className="space-y-1 border-t border-border/60 pt-2">
      {KIND_ORDER.map((kind) => (
        <li
          key={kind}
          className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <span className="min-w-0 truncate">{KIND_COUNT_LABEL[kind]}</span>
          <span className="shrink-0 tabular-nums font-medium text-foreground">
            {assets.filter((a) => a.kind === kind).length}
          </span>
        </li>
      ))}
    </ul>
  );
}

type KindFilter = 'all' | AssetKind;

export function TechnicianDisposalPage() {
  const [assets, setAssets] = useState<PredisposalEligibleAsset[]>([]);
  const [preDisposedAssets, setPreDisposedAssets] = useState<PreDisposedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, preDisposed] = await Promise.all([
        listPredisposalEligibleAssetsFn(),
        listPreDisposedAssetsFn(),
      ]);
      setAssets(rows);
      setPreDisposedAssets(preDisposed);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load assets');
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
      [String(a.assetId), a.assetIdOld, a.model, a.brand, a.category, a.serialNum, a.kind]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [assets, search, kindFilter]);

  const pagination = usePagination(filtered, {
    resetKey: `${search}|${kindFilter}`,
  });

  const filteredKeys = useMemo(
    () => filtered.map((a) => assetKey(a.kind, a.assetId)),
    [filtered],
  );

  const allFilteredSelected =
    filtered.length > 0 && filteredKeys.every((k) => selected.has(k));
  const someFilteredSelected = filteredKeys.some((k) => selected.has(k));

  const toggleOne = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAllFiltered = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) filteredKeys.forEach((k) => next.add(k));
      else filteredKeys.forEach((k) => next.delete(k));
      return next;
    });
  };

  const selectedAssets = useMemo(() => {
    return assets.filter((a) => selected.has(assetKey(a.kind, a.assetId)));
  }, [assets, selected]);

  const handleMarkPredisposed = async () => {
    if (selectedAssets.length === 0) {
      toast.error('Select at least one asset');
      return;
    }
    setSaving(true);
    try {
      const result = await markAssetsPredisposedFn({
        data: {
          assets: selectedAssets.map((a) => ({ kind: a.kind, assetId: a.assetId })),
        },
      });
      if (result.updated > 0) {
        toast.success(
          `Marked ${result.updated} asset${result.updated === 1 ? '' : 's'} as pre-disposed`,
        );
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} failed`, {
          description: result.errors.slice(0, 3).join(' · '),
        });
      }
      setConfirmOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark assets as pre-disposed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TechnicianShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Asset disposal</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">
            Select returned assets and mark them as pre-disposed for the disposal unit.
          </p>
        </div>
        <TechnicianDisposalViewMenu />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2">
        <InsightStatCard
          icon={PackageCheck}
          label="Total Return Asset"
          value={assets.length}
          tone="emerald"
        >
          <KindCountList assets={assets} />
        </InsightStatCard>
        <InsightStatCard
          icon={Recycle}
          label="Total pre-disposed"
          value={preDisposedAssets.length}
          tone="amber"
          href="/technician/pre-disposed"
        >
          <KindCountList assets={preDisposedAssets} />
        </InsightStatCard>
      </div>

      <Card className="rounded-[14px] border-border shadow-sm">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Eligible assets</CardTitle>
            <CardDescription>
              {filtered.length} shown · {assets.length} total · search by asset ID, legacy ID (AV),
              model, brand, category, or serial
            </CardDescription>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search asset ID, legacy ID, model, brand, serial…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-[8px] pl-9"
            />
          </div>
          <ToggleGroup
            type="single"
            value={kindFilter}
            onValueChange={(v) => {
              if (v) setKindFilter(v as KindFilter);
            }}
            className="w-full justify-start sm:w-auto"
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
            <ToggleGroupItem value="network" className="gap-1.5 rounded-[8px] px-3 text-xs">
              <Network className="h-3.5 w-3.5" />
              Network
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent className="space-y-3 p-0 sm:p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {selected.size} selected
              {filtered.length !== assets.length && ` · ${filtered.length} shown`}
            </p>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 rounded-[8px]"
              disabled={selected.size === 0 || saving}
              onClick={() => setConfirmOpen(true)}
            >
              <Recycle className="h-4 w-4" />
              Mark as pre-disposed{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                      onCheckedChange={(v) => toggleAllFiltered(v === true)}
                      aria-label="Select all visible"
                    />
                  </TableHead>
                  <TableHead className="font-semibold">Kind</TableHead>
                  <TableHead className="font-semibold">ID</TableHead>
                  <TableHead className="font-semibold">Model</TableHead>
                  <TableHead className="font-semibold">Brand</TableHead>
                  <TableHead className="font-semibold">Serial</TableHead>
                  <TableHead className="font-semibold">Life-span</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      {assets.length === 0
                        ? 'No return assets are available to mark as pre-disposed.'
                        : 'No assets match your filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.paginatedItems.map((a) => {
                    const key = assetKey(a.kind, a.assetId);
                    const isSelected = selected.has(key);
                    return (
                      <TableRow
                        key={key}
                        className={cn('cursor-pointer', isSelected && 'bg-lavender/5')}
                        onClick={() => toggleOne(key, !isSelected)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(v) => toggleOne(key, v === true)}
                            aria-label={`Select ${a.kind} ${a.assetId}`}
                          />
                        </TableCell>
                        <KindCell kind={a.kind} />
                        <TableCell>
                          <code className="text-xs">{a.assetId}</code>
                          {a.assetIdOld ? (
                            <p className="text-[10px] text-muted-foreground">{a.assetIdOld}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-medium">{a.model ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{a.brand ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {a.serialNum ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatAssetLifespan(a.poDate, a.assetId)}
                          {isLifespanOverYears(a.poDate, a.doDate) ? (
                            <p className="text-[10px] text-amber-700">Over 7 years</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <AssetStatusBadge statusId={a.statusId} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <AssetTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            totalItems={pagination.totalItems}
            totalLoaded={assets.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-[14px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark selected assets as pre-disposed?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedAssets.length} asset{selectedAssets.length === 1 ? '' : 's'} will be set to
              pre-disposed (status 4) and queued for the disposal unit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedAssets.length > 0 ? (
            <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-[10px] border border-border bg-muted/30 p-3 text-sm">
              {selectedAssets.map((row) => (
                <li
                  key={assetKey(row.kind, row.assetId)}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {ASSET_KIND_LABEL[row.kind]} · {row.model ?? row.assetId}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.assetId}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[8px]" disabled={saving}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[8px]"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void handleMarkPredisposed();
              }}
            >
              {saving ? 'Saving…' : 'Confirm pre-disposal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TechnicianShell>
  );
}

function KindCell({ kind }: { kind: AssetKind }) {
  const Icon = kind === 'laptop' ? Laptop : kind === 'av' ? Tv : Network;
  const label = kind === 'laptop' ? 'Laptop' : kind === 'av' ? 'AV' : 'Network';
  return (
    <TableCell>
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Icon className="h-4 w-4 text-[oklch(0.45_0.12_290)]" />
        {label}
      </span>
    </TableCell>
  );
}
