import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DisposalUnitShell } from '@/disposal-unit/disposal-unit-shell';
import { isoToLocalDate } from '@shared/lib/date-format';
import {
  ACC_CODE_OPTIONS,
  ASSET_KIND_LABEL,
  formatAccCodeDisplay,
  type AssetKind,
} from '@shared/lib/inventory-schema';
import {
  picturesComplete,
  PREDISPOSAL_REASON_LABEL,
  serializeDisposalBatchAssets,
  type PreDisposedAsset,
} from '@shared/lib/disposal-schema';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { AssetTablePagination } from '@/technician/asset-table-pagination';
import { listDisposalQueueAssetsFn } from '@backend/server/assets/assets.functions';

type KindFilter = 'all' | AssetKind;
type AccCodeFilter = 'all' | string;

function assetKey(kind: AssetKind, assetId: PreDisposedAsset['assetId']) {
  return `${kind}:${assetId}`;
}

function formatAssetName(asset: PreDisposedAsset) {
  const name = [asset.brand, asset.model].filter(Boolean).join(' ').trim();
  return name || '—';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = isoToLocalDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function categoryBadgeClassName(kind: AssetKind) {
  switch (kind) {
    case 'laptop':
      return 'border-violet-200 bg-violet-50 font-medium text-violet-800 hover:bg-violet-50';
    case 'av':
      return 'border-amber-200 bg-amber-50 font-medium text-amber-900 hover:bg-amber-50';
    case 'network':
      return 'border-sky-200 bg-sky-50 font-medium text-sky-800 hover:bg-sky-50';
    default:
      return 'border-border bg-muted/40 font-medium text-muted-foreground';
  }
}

export function DisposalUnitDisposalPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PreDisposedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<KindFilter>('all');
  const [accCode, setAccCode] = useState<AccCodeFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const assets = await listDisposalQueueAssetsFn();
      setRows(assets.filter(picturesComplete));
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load pre-disposed assets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== 'all' && row.kind !== category) return false;
      if (accCode !== 'all' && (row.accCode ?? '') !== accCode) return false;
      if (!q) return true;
      return [
        formatAssetName(row),
        String(row.assetId),
        row.assetIdOld ?? '',
        row.serialNum ?? '',
        row.predisposedBy ?? '',
        PREDISPOSAL_REASON_LABEL[row.reason],
        ASSET_KIND_LABEL[row.kind],
        row.category ?? '',
        row.accCode ?? '',
        formatAccCodeDisplay(row.accCode) ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, category, accCode]);

  const pagination = usePagination(filtered, {
    resetKey: `${search}|${category}|${accCode}|${filtered.length}`,
  });

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((row) => selected.has(assetKey(row.kind, row.assetId)));
  const someFilteredSelected =
    filtered.some((row) => selected.has(assetKey(row.kind, row.assetId))) &&
    !allFilteredSelected;

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(assetKey(row.kind, row.assetId))),
    [rows, selected],
  );

  const toggleOne = (key: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });
  };

  const toggleAllFiltered = (next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      for (const row of filtered) {
        const key = assetKey(row.kind, row.assetId);
        if (next) copy.add(key);
        else copy.delete(key);
      }
      return copy;
    });
  };

  const goToDisposalForm = () => {
    if (selectedRows.length === 0) {
      toast.error('Select at least one asset');
      return;
    }
    void navigate({
      to: '/disposal-unit/disposal-form',
      search: { assets: serializeDisposalBatchAssets(selectedRows) },
    });
  };

  return (
    <DisposalUnitShell>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Disposal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? 'Loading pre-disposed assets…'
            : `${filtered.length} pre-disposed asset${filtered.length === 1 ? '' : 's'} with complete photos${
                filtered.length !== rows.length ? ` of ${rows.length}` : ''
              } · Select assets, then continue to the disposal form`}
        </p>
      </div>

      <Card className="shrink-0 rounded-[14px] border-border shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(12rem,0.85fr)_minmax(14rem,1fr)] xl:items-end">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Asset, ID, legacy ID, serial…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-[8px] border-border bg-background pl-9 shadow-none"
                />
              </div>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as KindFilter)}
              >
                <SelectTrigger className="h-10 w-full rounded-[8px] border-border bg-background shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="laptop">{ASSET_KIND_LABEL.laptop}</SelectItem>
                  <SelectItem value="av">{ASSET_KIND_LABEL.av}</SelectItem>
                  <SelectItem value="network">{ASSET_KIND_LABEL.network}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account code</Label>
              <Select value={accCode} onValueChange={(v) => setAccCode(v as AccCodeFilter)}>
                <SelectTrigger className="h-10 w-full rounded-[8px] border-border bg-background shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All account codes</SelectItem>
                  {ACC_CODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.value} ({opt.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selected.size > 0 ? (
        <div className="flex shrink-0 flex-col gap-3 rounded-[12px] border border-[oklch(0.45_0.12_290)]/25 bg-lavender/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            <span className="font-semibold tabular-nums">{selected.size}</span> asset
            {selected.size === 1 ? '' : 's'} selected for batch disposal
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-[8px]"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-9 gap-1.5 rounded-[8px]"
              onClick={goToDisposalForm}
            >
              <Trash2 className="h-4 w-4" />
              Dispose batch
            </Button>
          </div>
        </div>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border-border shadow-sm">
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 w-12 px-4 sm:px-5">
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                    onCheckedChange={(v) => toggleAllFiltered(v === true)}
                    aria-label="Select all visible"
                    disabled={filtered.length === 0}
                  />
                </TableHead>
                <TableHead className="h-11 px-4">Asset</TableHead>
                <TableHead className="h-11 px-4">Category</TableHead>
                <TableHead className="h-11 px-4">Asset ID</TableHead>
                <TableHead className="h-11 px-4">Serial</TableHead>
                <TableHead className="h-11 px-4">Proposed by</TableHead>
                <TableHead className="h-11 px-4">Reason</TableHead>
                <TableHead className="h-11 px-4 sm:px-5">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : pagination.paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-sm text-muted-foreground">
                    {rows.length === 0
                      ? 'No pre-disposed assets with complete photos are ready for disposal.'
                      : 'No assets match your filters.'}
                  </TableCell>
                </TableRow>
              ) : (
                pagination.paginatedItems.map((row) => {
                  const key = assetKey(row.kind, row.assetId);
                  const isSelected = selected.has(key);
                  const label = formatAssetName(row);
                  return (
                    <TableRow
                      key={key}
                      className={cn('cursor-pointer', isSelected && 'bg-lavender/5')}
                      onClick={() => toggleOne(key, !isSelected)}
                    >
                      <TableCell className="px-4 py-3 sm:px-5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) => toggleOne(key, v === true)}
                          aria-label={`Select ${label}`}
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3 font-medium text-foreground">
                        {label}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn('rounded-[6px]', categoryBadgeClassName(row.kind))}
                        >
                          {ASSET_KIND_LABEL[row.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <code className="text-xs">{row.assetId}</code>
                        {row.assetIdOld ? (
                          <p className="text-[10px] text-muted-foreground">{row.assetIdOld}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {row.serialNum ?? '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {row.predisposedBy ?? '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {PREDISPOSAL_REASON_LABEL[row.reason]}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground sm:px-5">
                        {formatDate(row.predisposedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
          {!loading ? (
            <AssetTablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              totalItems={pagination.totalItems}
              totalLoaded={filtered.length}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          ) : null}
        </CardContent>
      </Card>
      </div>
    </DisposalUnitShell>
  );
}
