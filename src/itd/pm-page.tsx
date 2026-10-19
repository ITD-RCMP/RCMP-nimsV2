import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  Laptop,
  MapPin,
  Network,
  Pencil,
  Search,
  Tv,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatDateLabel, isoToLocalDate, localDateToIso } from '@shared/lib/date-format';
import { ASSET_KIND_LABEL, type AssetKind } from '@shared/lib/inventory-schema';
import type { PmAssetCondition, PmLogAsset, PmLogListRow, PmLogStatus, PmStats } from '@shared/lib/pm-schema';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import {
  getPmStatsFn,
  listPmLogBuildingsFn,
  listPmLogsFn,
  updatePmLogAssetsFn,
} from '@backend/server/operations/pm.functions';
import { AssetTablePagination } from '@/technician/asset-table-pagination';
import { DatePickerField } from '@/technician/deploy-return-fields';
import { TechnicianShell } from '@/technician/technician-shell';

const KIND_ICON: Record<AssetKind, typeof Laptop> = {
  laptop: Laptop,
  av: Tv,
  network: Network,
};

const EMPTY_STATS: PmStats = {
  visitsThisMonth: 0,
  assetsChecked: 0,
  faultyThisMonth: 0,
  pendingFollowUp: 0,
};

function placeLabel(row: { building: string; level: string; zone: string }) {
  return `${row.building} · ${row.level} · ${row.zone}`;
}

function assetNeedsAction(asset: PmLogAsset) {
  return asset.condition === 'faulty' && !asset.resolvedAt;
}

function visitNeedsAction(row: PmLogListRow) {
  return row.assets.some(assetNeedsAction);
}

function StatusBadge({ status }: { status: PmLogStatus }) {
  if (status === 'passed') {
    return (
      <Badge
        variant="secondary"
        className="rounded-[6px] border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      >
        All good
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge
        variant="secondary"
        className="rounded-[6px] border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
      >
        All faulty
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="rounded-[6px] border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      Issues found
    </Badge>
  );
}

const STAT_TONES = {
  sky: {
    wash: 'bg-sky-300/18',
    badge: 'bg-sky-400 text-sky-950',
    watermark: 'text-sky-400/25 dark:text-sky-300/15',
  },
  emerald: {
    wash: 'bg-emerald-300/18',
    badge: 'bg-emerald-400 text-emerald-950',
    watermark: 'text-emerald-400/25 dark:text-emerald-300/15',
  },
  amber: {
    wash: 'bg-amber-300/18',
    badge: 'bg-amber-400 text-amber-950',
    watermark: 'text-amber-400/25 dark:text-amber-300/15',
  },
} as const;

type StatFilter = 'visits' | 'checked' | 'issues';

function thisMonthRange() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: localDateToIso(monthStart), to: localDateToIso(today) };
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  selected,
  onSelect,
}: {
  icon: typeof Wrench;
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof STAT_TONES;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors = STAT_TONES[tone];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'count-glass relative flex h-full min-h-[148px] w-full flex-col overflow-hidden rounded-3xl p-5 text-left transition-shadow hover:shadow-md',
        selected && 'ring-2 ring-foreground/25 ring-offset-2 ring-offset-background',
      )}
    >
      <div className={cn('pointer-events-none absolute inset-0', colors.wash)} />
      <div className="relative z-10 flex items-center gap-2.5">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', colors.badge)}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="relative z-10 mt-4 font-serif text-4xl leading-none tracking-tight text-foreground">{value}</p>
      <p className="relative z-10 mt-2 text-xs text-muted-foreground">{hint}</p>
      <Icon
        className={cn('pointer-events-none absolute -bottom-3 -right-2 h-28 w-28', colors.watermark)}
        strokeWidth={1.15}
        aria-hidden
      />
    </button>
  );
}

function LogDetailDialog({
  row,
  onClose,
}: {
  row: PmLogListRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-[14px] sm:max-w-lg">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{placeLabel(row)}</DialogTitle>
              <DialogDescription>
                {formatDateLabel(row.pmDate)} · {row.performedBy} · {row.goodCount}/
                {row.assetsTotal} in good condition
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-[12px] border border-border">
              {row.assets.map((asset) => {
                const Icon = KIND_ICON[asset.assetType];
                const faulty = asset.condition === 'faulty';
                return (
                  <li key={asset.pmLogAssetId} className="flex items-start gap-3 px-3 py-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{asset.assetLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {asset.serialNum ?? `#${asset.assetId}`} ·{' '}
                        {asset.assetCategory ?? ASSET_KIND_LABEL[asset.assetType]}
                      </p>
                      {asset.remarks && (
                        <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                          {asset.remarks}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'shrink-0 rounded-[6px] border-transparent text-[10px]',
                        faulty
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                      )}
                    >
                      {faulty
                        ? asset.resolvedAt
                          ? 'Faulty · resolved'
                          : 'Faulty · open'
                        : 'Good'}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {row.remarks && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Visit remarks: {row.remarks}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditVisitDialog({
  row,
  saving,
  onClose,
  onSave,
}: {
  row: PmLogListRow | null;
  saving: boolean;
  onClose: () => void;
  onSave: (
    assets: { pmLogAssetId: number; condition: PmAssetCondition; remarks: string }[],
  ) => Promise<void>;
}) {
  const [conditions, setConditions] = useState<Record<number, PmAssetCondition>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!row) {
      setConditions({});
      setRemarks({});
      return;
    }
    const issues = row.assets.filter(assetNeedsAction);
    setConditions(Object.fromEntries(issues.map((a) => [a.pmLogAssetId, a.condition])));
    setRemarks(Object.fromEntries(issues.map((a) => [a.pmLogAssetId, a.remarks ?? ''])));
  }, [row]);

  const issueAssets = row?.assets.filter(assetNeedsAction) ?? [];

  const missingRemarks = issueAssets.some(
    (a) => (conditions[a.pmLogAssetId] ?? a.condition) === 'faulty' && !remarks[a.pmLogAssetId]?.trim(),
  );

  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="rounded-[14px] sm:max-w-lg">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>Update issues</DialogTitle>
              <DialogDescription>
                {placeLabel(row)} · {formatDateLabel(row.pmDate)}. Remarks are required for assets that
                need action.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-0.5">
              {issueAssets.map((asset) => (
                <EditAssetRow
                  key={asset.pmLogAssetId}
                  asset={asset}
                  condition={conditions[asset.pmLogAssetId] ?? asset.condition}
                  remarks={remarks[asset.pmLogAssetId] ?? ''}
                  onConditionChange={(next) =>
                    setConditions((prev) => ({ ...prev, [asset.pmLogAssetId]: next }))
                  }
                  onRemarksChange={(next) =>
                    setRemarks((prev) => ({ ...prev, [asset.pmLogAssetId]: next }))
                  }
                />
              ))}
            </ul>
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-[8px]" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-[8px]"
                disabled={saving || missingRemarks}
                onClick={() =>
                  void onSave(
                    issueAssets.map((asset) => ({
                      pmLogAssetId: asset.pmLogAssetId,
                      condition: conditions[asset.pmLogAssetId] ?? asset.condition,
                      remarks: remarks[asset.pmLogAssetId] ?? '',
                    })),
                  )
                }
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditAssetRow({
  asset,
  condition,
  remarks,
  onConditionChange,
  onRemarksChange,
}: {
  asset: PmLogAsset;
  condition: PmAssetCondition;
  remarks: string;
  onConditionChange: (next: PmAssetCondition) => void;
  onRemarksChange: (next: string) => void;
}) {
  const Icon = KIND_ICON[asset.assetType];
  const faulty = condition === 'faulty';
  const missingRemarks = faulty && !remarks.trim();

  return (
    <li
      className={cn(
        'rounded-[12px] border p-3',
        !faulty && 'border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20',
        faulty && 'border-red-500/40 bg-red-50/60 dark:bg-red-950/20',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{asset.assetLabel}</p>
          <p className="truncate text-xs text-muted-foreground">
            {asset.serialNum ?? `#${asset.assetId}`} ·{' '}
            {asset.assetCategory ?? ASSET_KIND_LABEL[asset.assetType]}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={faulty ? 'outline' : 'default'}
          className={cn(
            'h-8 flex-1 rounded-[8px] gap-1',
            !faulty && 'bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-700',
          )}
          onClick={() => onConditionChange('good')}
        >
          <Check className="h-3.5 w-3.5" />
          Good
        </Button>
        <Button
          type="button"
          size="sm"
          variant={faulty ? 'default' : 'outline'}
          className={cn(
            'h-8 flex-1 rounded-[8px] gap-1',
            faulty && 'bg-red-600 hover:bg-red-600/90 dark:bg-red-700',
          )}
          onClick={() => onConditionChange('faulty')}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Needs action
        </Button>
      </div>
      {faulty && (
        <Textarea
          value={remarks}
          onChange={(e) => onRemarksChange(e.target.value)}
          placeholder="What is wrong with this asset? (required)"
          className={cn(
            'mt-2 min-h-[64px] rounded-[8px] text-sm',
            missingRemarks && 'border-red-500 focus-visible:ring-red-500',
          )}
        />
      )}
    </li>
  );
}

export function PMpage() {
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PmLogStatus>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<PmLogListRow[]>([]);
  const [buildings, setBuildings] = useState<string[]>([]);
  const [stats, setStats] = useState<PmStats>(EMPTY_STATS);
  const [statFilter, setStatFilter] = useState<StatFilter | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<PmLogListRow | null>(null);
  const [editRow, setEditRow] = useState<PmLogListRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const dateRangeInvalid = useMemo(() => {
    if (!dateFrom || !dateTo) return false;
    const from = isoToLocalDate(dateFrom);
    const to = isoToLocalDate(dateTo);
    return Boolean(from && to && from > to);
  }, [dateFrom, dateTo]);

  const hasDateFilter = Boolean(dateFrom || dateTo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logRows, buildingRows, nextStats] = await Promise.all([
        listPmLogsFn({
          data: {
            building: buildingFilter,
            status: statusFilter,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          },
        }),
        listPmLogBuildingsFn(),
        getPmStatsFn(),
      ]);
      setRows(dateRangeInvalid ? [] : logRows);
      setBuildings(buildingRows);
      setStats(nextStats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load maintenance log');
    } finally {
      setLoading(false);
    }
  }, [buildingFilter, statusFilter, dateFrom, dateTo, dateRangeInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveVisitIssues = async (
    assets: { pmLogAssetId: number; condition: PmAssetCondition; remarks: string }[],
  ) => {
    if (!editRow) return;
    if (assets.some((a) => a.condition === 'faulty' && !a.remarks.trim())) {
      toast.error('Add remarks for every asset that needs action');
      return;
    }
    const merged = editRow.assets.map((asset) => {
      const next = assets.find((a) => a.pmLogAssetId === asset.pmLogAssetId);
      return next
        ? next
        : {
            pmLogAssetId: asset.pmLogAssetId,
            condition: asset.condition,
            remarks: asset.remarks ?? '',
          };
    });
    setSavingEdit(true);
    try {
      const result = await updatePmLogAssetsFn({
        data: {
          pmLogId: editRow.pmLogId,
          assets: merged.map((a) => ({
            pmLogAssetId: a.pmLogAssetId,
            condition: a.condition,
            remarks: a.remarks.trim() || null,
          })),
        },
      });
      toast.success(
        result.faultyCount === 0
          ? 'Visit updated · all assets in good condition'
          : `Visit updated · ${result.faultyCount} asset${result.faultyCount === 1 ? '' : 's'} flagged`,
      );
      setEditRow(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update this visit');
    } finally {
      setSavingEdit(false);
    }
  };

  const applyStatFilter = (key: StatFilter) => {
    if (statFilter === key) {
      setStatFilter(null);
      setStatusFilter('all');
      setDateFrom('');
      setDateTo('');
      return;
    }
    setStatFilter(key);
    setStatusFilter('all');
    const { from, to } = thisMonthRange();
    setDateFrom(from);
    setDateTo(to);
  };

  const filtered = useMemo(() => {
    let next = rows;
    if (statFilter === 'issues') {
      next = next.filter((r) => r.status === 'partial' || r.status === 'failed');
    }
    const q = search.trim().toLowerCase();
    if (!q) return next;
    return next.filter((r) =>
      [
        r.building,
        r.level,
        r.zone,
        r.performedBy,
        r.performedByEmail,
        r.remarks,
        ...r.assets.flatMap((a) => [a.assetLabel, a.serialNum, a.assetCategory, a.remarks]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search, statFilter]);

  const pagination = usePagination(filtered, {
    pageSize: 15,
    resetKey: `${search}|${buildingFilter}|${statusFilter}|${dateFrom}|${dateTo}|${statFilter}|${filtered.length}`,
  });

  const showActionColumn = filtered.some(visitNeedsAction);

  return (
    <TechnicianShell>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Preventive Maintenance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${filtered.length} visit${filtered.length === 1 ? '' : 's'}`}
            {filtered.length !== rows.length && ` of ${rows.length}`}
            {' · '}
            {monthLabel}
            {dateRangeInvalid && ' · End date must be on or after start date'}
          </p>
        </div>
        <Button type="button" className="shrink-0 gap-1.5 rounded-[8px]" asChild>
          <Link to="/technician/pm-form">
            <Wrench className="h-4 w-4" />
            Run maintenance
          </Link>
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Wrench}
          label="Visits this month"
          value={stats.visitsThisMonth}
          hint="Rooms maintained"
          tone="sky"
          selected={statFilter === 'visits'}
          onSelect={() => applyStatFilter('visits')}
        />
        <StatCard
          icon={CheckCircle2}
          label="Assets checked"
          value={stats.assetsChecked}
          hint="Unique assets this month"
          tone="emerald"
          selected={statFilter === 'checked'}
          onSelect={() => applyStatFilter('checked')}
        />
        <StatCard
          icon={AlertTriangle}
          label="Need further actions"
          value={stats.faultyThisMonth}
          hint="Assets not in good condition"
          tone="amber"
          selected={statFilter === 'issues'}
          onSelect={() => applyStatFilter('issues')}
        />
      </div>

      <Card className="mb-4 rounded-[14px] border-border shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-3">
            <div className="min-w-0 flex-1 lg:max-w-sm">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Room, asset, serial, tech…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-[8px] pl-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0 sm:gap-3">
              <div className="w-full sm:w-[11.5rem]">
                <Label className="mb-1.5 block text-xs text-muted-foreground">Building</Label>
                <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                  <SelectTrigger className="h-10 rounded-[8px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All buildings</SelectItem>
                    {buildings.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[9.5rem]">
                <Label className="mb-1.5 block text-xs text-muted-foreground">Result</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatFilter(null);
                    setStatusFilter(v as 'all' | PmLogStatus);
                  }}
                >
                  <SelectTrigger className="h-10 rounded-[8px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All results</SelectItem>
                    <SelectItem value="passed">All good</SelectItem>
                    <SelectItem value="partial">Issues found</SelectItem>
                    <SelectItem value="failed">All faulty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="w-full sm:w-[220px]">
                <DatePickerField
                  label="From date"
                  value={dateFrom}
                  onChange={(v) => {
                    setStatFilter(null);
                    setDateFrom(v);
                  }}
                />
              </div>
              <div className="w-full sm:w-[220px]">
                <DatePickerField
                  label="To date"
                  value={dateTo}
                  onChange={(v) => {
                    setStatFilter(null);
                    setDateTo(v);
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick range</Label>
              <div className="flex h-10 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-[8px] px-3"
                  disabled={!hasDateFilter}
                  onClick={() => {
                    setStatFilter(null);
                    setDateFrom('');
                    setDateTo('');
                  }}
                >
                  Clear dates
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-[8px] px-3"
                  onClick={() => {
                    setStatFilter(null);
                    const today = new Date();
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    setDateFrom(localDateToIso(weekAgo));
                    setDateTo(localDateToIso(today));
                  }}
                >
                  Last 7 days
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-[8px] px-3"
                  onClick={() => {
                    setStatFilter(null);
                    const { from, to } = thisMonthRange();
                    setDateFrom(from);
                    setDateTo(to);
                  }}
                >
                  This month
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[14px] border-border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
          ) : pagination.paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No maintenance visits match your filters.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">Date</TableHead>
                    <TableHead className="h-9 text-xs">Room</TableHead>
                    <TableHead className="hidden h-9 text-xs lg:table-cell">Technician</TableHead>
                    <TableHead className="hidden h-9 text-xs sm:table-cell">Assets</TableHead>
                    <TableHead className="h-9 text-xs">Result</TableHead>
                    {showActionColumn && (
                      <TableHead className="h-9 w-12 text-xs">Action</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((row) => (
                    <TableRow
                      key={row.pmLogId}
                      className="cursor-pointer"
                      onClick={() => setDetailRow(row)}
                    >
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {formatDateLabel(row.pmDate)}
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.zone}</p>
                          <p className="inline-flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {row.building} · {row.level}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">
                        {row.performedBy}
                      </TableCell>
                      <TableCell className="hidden tabular-nums text-sm sm:table-cell">
                        {row.goodCount}/{row.assetsTotal} good
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      {showActionColumn && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {visitNeedsAction(row) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Update issues for ${row.zone}`}
                              onClick={() => {
                                setDetailRow(null);
                                setEditRow(row);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            </>
          )}
        </CardContent>
      </Card>

      <LogDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
      <EditVisitDialog
        row={editRow}
        saving={savingEdit}
        onClose={() => setEditRow(null)}
        onSave={saveVisitIssues}
      />
    </TechnicianShell>
  );
}
