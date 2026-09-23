import { useCallback, useEffect, useMemo, useState, type ElementType, Fragment } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ClipboardList,
  Hammer,
  History,
  MapPin,
  Package,
  Reply,
  Search,
  Shield,
  Truck,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import type { AssetKind } from '@shared/lib/inventory-schema';
import { ASSET_KIND_LABEL } from '@shared/lib/inventory-schema';
import {
  ACTIVITY_CATEGORY_LABEL,
  ACTIVITY_LOG_CATEGORIES,
  type ActivityLogCategory,
  type ActivityLogEntry,
} from '@shared/lib/activity-log-schema';
import { isoToLocalDate } from '@shared/lib/date-format';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { listActivityLogFn } from '@backend/server/operations/activity-log.functions';
import { AssetTablePagination } from '@/technician/asset-table-pagination';
import { DatePickerField } from '@/technician/deploy-return-fields';
import { TechnicianShell } from '@/technician/technician-shell';

type CategoryFilter = 'all' | ActivityLogCategory;
type KindFilter = 'all' | AssetKind;

const CATEGORY_META: Record<ActivityLogCategory, { icon: ElementType; dot: string }> = {
  request: { icon: ClipboardList, dot: 'bg-[oklch(0.55_0.14_290)]' },
  handover: { icon: Truck, dot: 'bg-sky-500' },
  deployment: { icon: MapPin, dot: 'bg-indigo-500' },
  return: { icon: Reply, dot: 'bg-emerald-500' },
  repair: { icon: Hammer, dot: 'bg-amber-500' },
  maintenance: { icon: Wrench, dot: 'bg-teal-500' },
  warranty: { icon: Shield, dot: 'bg-violet-500' },
  inventory: { icon: Package, dot: 'bg-slate-500' },
};

function formatTime(at: string): string {
  if (!at) return '—';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dayKey(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function startOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

function matchesDateFilter(at: string, fromIso: string, toIso: string): boolean {
  if (!fromIso && !toIso) return true;
  const eventMs = new Date(at).getTime();
  if (Number.isNaN(eventMs)) return false;
  if (fromIso) {
    const from = isoToLocalDate(fromIso);
    if (from && eventMs < startOfDayMs(from)) return false;
  }
  if (toIso) {
    const to = isoToLocalDate(toIso);
    if (to && eventMs > endOfDayMs(to)) return false;
  }
  return true;
}

function dayHeading(key: string): string {
  if (key === 'unknown') return 'Unknown date';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  if (key === fmt(today)) return 'Today';
  if (key === fmt(yesterday)) return 'Yesterday';
  return key;
}

function ActivityRow({ entry }: { entry: ActivityLogEntry }) {
  const meta = CATEGORY_META[entry.category];
  const Icon = meta.icon;

  return (
    <TableRow className="hover:bg-muted/30">
      <TableCell className="w-[4.5rem] whitespace-nowrap py-3 text-xs tabular-nums text-muted-foreground">
        {formatTime(entry.at)}
      </TableCell>
      <TableCell className="w-[8.5rem] py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
          <Icon className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          <span className="truncate">{ACTIVITY_CATEGORY_LABEL[entry.category]}</span>
        </span>
      </TableCell>
      <TableCell className="py-3">
        <p className="text-sm font-medium leading-snug">{entry.title}</p>
        {entry.detail && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{entry.detail}</p>
        )}
        {(entry.assetKind != null && entry.assetId != null) || entry.requestId != null ? (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {entry.assetKind != null && entry.assetId != null && (
              <Link
                to="/technician/asset/$kind/$assetId"
                params={{ kind: entry.assetKind, assetId: String(entry.assetId) }}
                className="text-[oklch(0.45_0.12_290)] hover:underline"
              >
                {ASSET_KIND_LABEL[entry.assetKind]} #{entry.assetId}
              </Link>
            )}
            {entry.requestId != null && (
              <Link
                to="/technician/request-log"
                className="text-[oklch(0.45_0.12_290)] hover:underline"
              >
                Request #{entry.requestId}
              </Link>
            )}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="hidden w-[7rem] py-3 text-right text-xs text-muted-foreground sm:table-cell">
        {entry.actor ?? '—'}
      </TableCell>
    </TableRow>
  );
}

export function TechnicianHistoryPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const dateRangeInvalid = useMemo(() => {
    if (!dateFrom || !dateTo) return false;
    const from = isoToLocalDate(dateFrom);
    const to = isoToLocalDate(dateTo);
    return Boolean(from && to && from > to);
  }, [dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listActivityLogFn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const countsByCategory = useMemo(() => {
    const map = Object.fromEntries(ACTIVITY_LOG_CATEGORIES.map((c) => [c, 0])) as Record<
      ActivityLogCategory,
      number
    >;
    for (const e of entries) map[e.category]++;
    return map;
  }, [entries]);

  const filtered = useMemo(() => {
    if (dateRangeInvalid) return [];
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (kindFilter !== 'all' && e.assetKind !== kindFilter) return false;
      if (!matchesDateFilter(e.at, dateFrom, dateTo)) return false;
      if (!q) return true;
      return [
        e.title,
        e.detail,
        e.actor,
        e.category,
        ACTIVITY_CATEGORY_LABEL[e.category],
        e.assetKind,
        e.assetId != null ? String(e.assetId) : null,
        e.requestId != null ? String(e.requestId) : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [entries, search, categoryFilter, kindFilter, dateFrom, dateTo, dateRangeInvalid]);

  const filterResetKey = `${search}|${categoryFilter}|${kindFilter}|${dateFrom}|${dateTo}`;

  const pagination = usePagination(filtered, {
    pageSize: 25,
    resetKey: filterResetKey,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityLogEntry[]>();
    for (const e of pagination.paginatedItems) {
      const key = dayKey(e.at);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [pagination.paginatedItems]);

  return (
    <TechnicianShell>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Activity history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length} event{filtered.length === 1 ? '' : 's'}
            {filtered.length !== entries.length && ` of ${entries.length}`}
            {' · '}
            <Link
              to="/technician/request-log"
              className="text-[oklch(0.45_0.12_290)] hover:underline"
            >
              Request log
            </Link>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-[8px]"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      <Card className="mb-4 rounded-[14px] border-border shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-3">
            <div className="min-w-0 flex-1 lg:max-w-sm">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Events, assets, staff…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-[8px] pl-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0 sm:gap-3">
              <div className="w-full sm:w-[11rem]">
                <Label className="mb-1.5 block text-xs text-muted-foreground">Category</Label>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
                >
                  <SelectTrigger className="h-10 rounded-[8px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({entries.length})</SelectItem>
                    {ACTIVITY_LOG_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {ACTIVITY_CATEGORY_LABEL[cat]} ({countsByCategory[cat]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[9rem]">
                <Label className="mb-1.5 block text-xs text-muted-foreground">Asset type</Label>
                <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
                  <SelectTrigger className="h-10 rounded-[8px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="laptop">Laptop</SelectItem>
                    <SelectItem value="av">AV</SelectItem>
                    <SelectItem value="network">Network</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="w-full sm:w-[220px]">
                <DatePickerField label="From date" value={dateFrom} onChange={setDateFrom} />
              </div>
              <div className="w-full sm:w-[220px]">
                <DatePickerField label="To date" value={dateTo} onChange={setDateTo} />
              </div>
            </div>
          </div>

          {dateRangeInvalid && (
            <p className="text-xs text-destructive">End date must be on or after start date.</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[14px] border-border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <History className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No events match your filters.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">Time</TableHead>
                    <TableHead className="h-9 text-xs">Type</TableHead>
                    <TableHead className="h-9 text-xs">Event</TableHead>
                    <TableHead className="hidden h-9 text-right text-xs sm:table-cell">
                      By
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map(([day, dayEvents]) => (
                    <Fragment key={day}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell
                          colSpan={4}
                          className="py-2 text-xs font-medium text-muted-foreground"
                        >
                          {dayHeading(day)}
                          <span className="ml-2 tabular-nums">({dayEvents.length})</span>
                        </TableCell>
                      </TableRow>
                      {dayEvents.map((entry) => (
                        <ActivityRow key={entry.id} entry={entry} />
                      ))}
                    </Fragment>
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
                totalLoaded={entries.length}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>
    </TechnicianShell>
  );
}
