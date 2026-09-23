import { useCallback, useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DASHBOARD_ASSET_DEPLOY_STATUS_IDS,
  DASHBOARD_ASSET_STORE_STATUS_IDS,
  DASHBOARD_REQUEST_STATUS_LABEL,
  type DashboardAssetKindStats,
  type DashboardDisposedYearStats,
  type DashboardHoliday,
  type DashboardRequestStatus,
  type DashboardStatusCount,
  type DashboardTimetableEntry,
} from '@shared/lib/dashboard-schema';
import { InsightStatCard, type InsightCardTone } from '@/components/insight-stat-card';
import { ASSET_KIND_LABEL, formatStatusLabel } from '@shared/lib/inventory-schema';
import { formatDateLabel, localDateToIso } from '@shared/lib/date-format';
import { cn } from '@/lib/utils';

export function dashboardTodayLine(fallback: string) {
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
  return `${todayLabel} · ${fallback}`;
}

function BreakdownList({ rows }: { rows: { label: string; count: number }[] }) {
  return (
    <ul className="relative z-10 mt-3 space-y-1 border-t border-border/60 pt-2">
      {rows.map(({ label, count }) => (
        <li
          key={label}
          className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <span className="min-w-0 truncate capitalize">{label}</span>
          <span className="shrink-0 tabular-nums font-medium text-foreground">{count}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusBreakdown({
  items,
  statusIds,
}: {
  items: DashboardStatusCount[];
  statusIds: readonly number[];
}) {
  const countByStatus = new Map(items.map((item) => [item.statusId, item.count]));
  const rows = statusIds.map((statusId) => ({
      label: formatStatusLabel(statusId),
      count: countByStatus.get(statusId) ?? 0,
    }));

  return <BreakdownList rows={rows} />;
}

type InventoryStatView = 'store' | 'deploy';

const INVENTORY_VIEW_STATUS_IDS: Record<InventoryStatView, readonly number[]> = {
  store: DASHBOARD_ASSET_STORE_STATUS_IDS,
  deploy: DASHBOARD_ASSET_DEPLOY_STATUS_IDS,
};

export type InventoryCardTone = InsightCardTone;

export function InventoryStatCard({
  icon,
  label,
  stats,
  tone,
  href,
}: {
  icon: ElementType;
  label: string;
  stats: DashboardAssetKindStats;
  tone: InventoryCardTone;
  href?: string;
}) {
  const [view, setView] = useState<InventoryStatView>('store');

  const deployCount = useMemo(() =>   {
    if (stats.deployByDivision) {
      return stats.deployByDivision.reduce((sum, row) => sum + row.count, 0);
    }
    if (stats.deployByBuilding) {
      return stats.deployByBuilding.reduce((sum, row) => sum + row.count, 0);
    }
    return stats.deploy;
  }, [stats.deploy, stats.deployByDivision, stats.deployByBuilding]);

  const totalCount = stats.store + deployCount;

  return (
    <InsightStatCard
      icon={icon}
      label={label}
      value={totalCount}
      hint={`${totalCount} total assets`}
      tone={tone}
      href={href}
    >
      <div className="grid grid-cols-2 gap-2">
        {(['store', 'deploy'] as const).map((key) => {
          const count = key === 'store' ? stats.store : deployCount;
          const isActive = view === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                'rounded-2xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'count-glass-chip-active font-medium text-foreground'
                  : 'count-glass-chip text-foreground hover:bg-white/55',
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {key === 'store' ? 'Store' : 'Deploy'}
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{count}</p>
            </button>
          );
        })}
      </div>

      {view === 'deploy' && stats.deployByDivision ? (
        <BreakdownList
          rows={stats.deployByDivision.map(({ division, count }) => ({
            label: division,
            count,
          }))}
        />
      ) : view === 'deploy' && stats.deployByBuilding ? (
        stats.deployByBuilding.length > 0 ? (
          <BreakdownList
            rows={stats.deployByBuilding.map(({ building, count }) => ({
              label: building,
              count,
            }))}
          />
        ) : (
          <ul className="relative z-10 mt-3 space-y-1 border-t border-border/60 pt-2">
            <li className="py-1 text-xs text-muted-foreground">No deployed assets yet.</li>
          </ul>
        )
      ) : (
        <StatusBreakdown items={stats.byStatus} statusIds={INVENTORY_VIEW_STATUS_IDS[view]} />
      )}
    </InsightStatCard>
  );
}

export function DisposedStatCard({
  stats,
  href,
}: {
  stats: DashboardDisposedYearStats;
  href: string;
}) {
  const rows = [
    { label: ASSET_KIND_LABEL.laptop, count: stats.byKind.laptop },
    { label: ASSET_KIND_LABEL.av, count: stats.byKind.av },
    { label: ASSET_KIND_LABEL.network, count: stats.byKind.network },
  ];

  return (
    <InsightStatCard
      icon={Trash2}
      label={`Disposed ${stats.year}`}
      value={stats.batchCount}
      valueSuffix={stats.batchCount === 1 ? 'total batch' : 'total batches'}
      hint={`${stats.assetCount} total assets`}
      tone="rose"
      href={href}
    >
      <BreakdownList rows={rows} />
    </InsightStatCard>
  );
}

const STATUS_BAR: Record<DashboardRequestStatus, string> = {
  preparing: 'bg-amber-400/90 dark:bg-amber-500',
  checkout: 'bg-sky-500/90 dark:bg-sky-600',
  in_use: 'bg-[oklch(0.55_0.14_290)]/90',
  due_return: 'bg-rose-500/90 dark:bg-rose-600',
};

const STATUS_BADGE: Record<DashboardRequestStatus, string> = {
  preparing:
    'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
  checkout:
    'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-800',
  in_use: 'bg-lavender/15 text-[oklch(0.45_0.12_290)] border-lavender/30',
  due_return:
    'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800',
};

export function DashboardPanel({
  title,
  description,
  headerExtra,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('rounded-2xl border-border shadow-sm', className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerExtra}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground"
            aria-label="More options"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className={cn('pt-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type CalendarCell = { iso: string; day: number; inMonth: boolean };

export function currentCalendarMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function buildMonthCells(year: number, month: number): CalendarCell[] {
  const cells: CalendarCell[] = [];
  const first = new Date(year, month - 1, 1);
  const pad = (first.getDay() + 6) % 7;
  const prevMonthEnd = new Date(year, month - 1, 0);

  for (let i = pad - 1; i >= 0; i--) {
    const d = new Date(prevMonthEnd);
    d.setDate(prevMonthEnd.getDate() - i);
    cells.push({ iso: localDateToIso(d), day: d.getDate(), inMonth: false });
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      iso: localDateToIso(new Date(year, month - 1, day)),
      day,
      inMonth: true,
    });
  }

  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month, nextDay++);
    cells.push({ iso: localDateToIso(d), day: d.getDate(), inMonth: false });
  }

  return cells;
}

function entryCoversDay(entry: DashboardTimetableEntry, iso: string): boolean {
  return iso >= entry.borrowDate && iso <= entry.returnDate;
}

function entriesOnDay(entries: DashboardTimetableEntry[], iso: string): DashboardTimetableEntry[] {
  return entries.filter((e) => entryCoversDay(e, iso));
}

function RequestDetailPanel({
  entry,
  requestHref,
}: {
  entry: DashboardTimetableEntry | null;
  requestHref?: string;
}) {
  if (!entry) {
    return (
      <div className="border-t border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
        Select a request on the calendar to view details.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">{entry.requesterName}</p>
          <p className="font-mono text-xs text-muted-foreground">Request #{entry.requestId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('rounded-md text-xs', STATUS_BADGE[entry.status])}>
            {DASHBOARD_REQUEST_STATUS_LABEL[entry.status]}
          </Badge>
          {entry.needsAction && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5" />
              Action needed
            </span>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Program</dt>
          <dd className="mt-0.5 font-medium text-foreground">{entry.programType}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Location</dt>
          <dd className="mt-0.5 font-medium text-foreground">{entry.usageLocation}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Borrow window</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatDateLabel(entry.borrowDate)} → {formatDateLabel(entry.returnDate)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Items requested</dt>
          <dd className="mt-0.5 font-medium text-foreground">{entry.itemSummary}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total quantity</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-foreground">{entry.totalQty}</dd>
        </div>
      </dl>

      {requestHref ? (
        <Button variant="outline" size="sm" className="mt-4 h-8 rounded-lg" asChild>
          <Link to={requestHref}>Open request</Link>
        </Button>
      ) : null}
    </div>
  );
}

function MonthNav({
  isCurrentMonth,
  onPrev,
  onNext,
  onThisMonth,
}: {
  isCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisMonth: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-lg"
        onClick={onPrev}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-lg px-2.5 text-xs"
        disabled={isCurrentMonth}
        onClick={onThisMonth}
      >
        This month
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-lg"
        onClick={onNext}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function holidayNamesByDate(holidays: DashboardHoliday[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const holiday of holidays) {
    const existing = map.get(holiday.date);
    map.set(holiday.date, existing ? `${existing} · ${holiday.name}` : holiday.name);
  }
  return map;
}

function RequestDayList({
  dayIso,
  entries,
  selectedId,
  onSelect,
}: {
  dayIso: string;
  entries: DashboardTimetableEntry[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="border-t border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground sm:px-6">
        No requests on {formatDateLabel(dayIso)}.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3 sm:px-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Requests on {formatDateLabel(dayIso)}
      </p>
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <button
            key={entry.requestId}
            type="button"
            onClick={() => onSelect(entry.requestId)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors',
              selectedId === entry.requestId
                ? 'border-[oklch(0.55_0.14_290)] bg-lavender/15'
                : 'border-border bg-card hover:bg-secondary/60',
            )}
          >
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_BAR[entry.status])}
              aria-hidden
            />
            <span className="font-semibold text-foreground">#{entry.requestId}</span>
            <span className="max-w-[10rem] truncate text-muted-foreground">{entry.requesterName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RequestTimetable({
  entries,
  holidays = [],
  viewMonth,
  loading,
  isCurrentMonth,
  onPrevMonth,
  onNextMonth,
  onThisMonth,
  requestHref,
}: {
  entries: DashboardTimetableEntry[];
  holidays?: DashboardHoliday[];
  viewMonth: { year: number; month: number };
  loading: boolean;
  isCurrentMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onThisMonth: () => void;
  requestHref?: string;
}) {
  const todayIso = localDateToIso(new Date());
  const cells = useMemo(
    () => buildMonthCells(viewMonth.year, viewMonth.month),
    [viewMonth.year, viewMonth.month],
  );
  const holidayByDate = useMemo(() => holidayNamesByDate(holidays), [holidays]);
  const [selectedDayIso, setSelectedDayIso] = useState(todayIso);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const inMonth = cells.some((c) => c.inMonth && c.iso === selectedDayIso);
    if (!inMonth) {
      const fallback =
        cells.find((c) => c.inMonth && c.iso === todayIso)?.iso ??
        cells.find((c) => c.inMonth)?.iso ??
        todayIso;
      setSelectedDayIso(fallback);
    }
  }, [cells, selectedDayIso, todayIso]);

  const dayRequests = useMemo(
    () => entriesOnDay(entries, selectedDayIso),
    [entries, selectedDayIso],
  );

  useEffect(() => {
    if (dayRequests.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId == null || !dayRequests.some((e) => e.requestId === selectedId)) {
      setSelectedId(dayRequests[0].requestId);
    }
  }, [dayRequests, selectedId]);

  const selectedHoliday = holidayByDate.get(selectedDayIso);
  const selected = dayRequests.find((e) => e.requestId === selectedId) ?? null;

  return (
    <DashboardPanel
      title="Request timetable"
      description={monthLabel(viewMonth.year, viewMonth.month)}
      headerExtra={
        <MonthNav
          isCurrentMonth={isCurrentMonth}
          onPrev={onPrevMonth}
          onNext={onNextMonth}
          onThisMonth={onThisMonth}
        />
      }
      contentClassName="p-0"
    >
      <div className="border-t border-border">
        <div className="flex flex-wrap gap-3 border-b border-border px-4 py-3 sm:px-6">
          {(Object.keys(STATUS_BAR) as DashboardRequestStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', STATUS_BAR[s])} />
              {DASHBOARD_REQUEST_STATUS_LABEL[s]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Public holiday
          </span>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading calendar…
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-7 border-b border-border bg-muted/30">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="border-r border-border px-2 py-2.5 text-center text-xs font-medium text-muted-foreground last:border-r-0"
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((cell) => {
                  const isSelected = cell.iso === selectedDayIso;
                  const isToday = cell.iso === todayIso;
                  const dayEntries = entriesOnDay(entries, cell.iso);
                  const hasRequests = dayEntries.length > 0;
                  const holidayName = holidayByDate.get(cell.iso);

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setSelectedDayIso(cell.iso)}
                      title={holidayName}
                      className={cn(
                        'flex min-h-[5.75rem] flex-col border-b border-r border-border p-2 text-left transition-colors last:border-r-0',
                        'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        isSelected && 'bg-rose-50/80 dark:bg-rose-950/25',
                        !isSelected && holidayName && 'bg-rose-50/55 dark:bg-rose-950/20',
                        !isSelected && !holidayName && isToday && 'bg-lavender/[0.06]',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums',
                          isSelected
                            ? 'bg-orange-500 text-white shadow-sm'
                            : holidayName
                              ? cell.inMonth
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-rose-400/70 dark:text-rose-500/50'
                              : cell.inMonth
                                ? 'text-foreground'
                                : 'text-muted-foreground/50',
                        )}
                      >
                        {cell.day}
                      </span>
                      {holidayName ? (
                        <p className="mt-1 line-clamp-2 min-h-0 flex-1 text-[9px] leading-tight text-rose-700 dark:text-rose-300">
                          {holidayName}
                        </p>
                      ) : (
                        <span className="flex-1" />
                      )}
                      <div className="mt-1.5 flex h-2.5 shrink-0 flex-wrap items-center gap-1">
                        {hasRequests
                          ? dayEntries.slice(0, 3).map((entry) => (
                              <span
                                key={entry.requestId}
                                className={cn('h-1.5 w-1.5 rounded-full', STATUS_BAR[entry.status])}
                                title={`#${entry.requestId} ${entry.requesterName}`}
                              />
                            ))
                          : null}
                        {dayEntries.length > 3 ? (
                          <span className="text-[9px] leading-none text-muted-foreground">
                            +{dayEntries.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {selectedHoliday ? (
          <div className="border-t border-border bg-rose-50/70 px-4 py-2.5 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-200 sm:px-6">
            <span className="font-semibold">Public holiday</span>
            <span className="text-rose-700/80 dark:text-rose-300/80"> · {selectedHoliday}</span>
          </div>
        ) : null}

        <RequestDayList
          dayIso={selectedDayIso}
          entries={dayRequests}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <RequestDetailPanel entry={selected} requestHref={requestHref} />
      </div>
    </DashboardPanel>
  );
}

export function useDashboardMonthState() {
  const [viewMonth, setViewMonth] = useState(currentCalendarMonth);

  const current = currentCalendarMonth();
  const isCurrentMonth = viewMonth.year === current.year && viewMonth.month === current.month;

  const shiftMonth = useCallback((delta: number) => {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }, []);

  const goToThisMonth = useCallback(() => {
    setViewMonth(currentCalendarMonth());
  }, []);

  return {
    viewMonth,
    isCurrentMonth,
    shiftMonth,
    goToThisMonth,
  };
}
