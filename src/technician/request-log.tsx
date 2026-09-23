import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Laptop, Search, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePagination } from '@/hooks/use-pagination';
import { formatDateLabel, isoToLocalDate, localDateToIso } from '@shared/lib/date-format';
import type { RequestLogAssignment, RequestLogEntry } from '@shared/lib/request-schema';
import { cn } from '@/lib/utils';
import { AssetTablePagination } from '@/technician/asset-table-pagination';
import { DatePickerField } from '@/technician/deploy-return-fields';
import { RequestToolbarActions } from '@/technician/request-toolbar-actions';
import { ScopedAskAiButton } from '@/prompt/scoped-ask-ai';
import { TechnicianShell } from '@/technician/technician-shell';
import { listRequestLogFn } from '@backend/server/requests/request.functions';

function hasBookedAsset(a: RequestLogAssignment): boolean {
  return a.assetId != null && Number(a.assetId) > 0;
}

function slotItemLabel(a: RequestLogAssignment): string {
  return a.assetType?.trim() || (a.kind === 'laptop' ? 'Laptop' : 'AV');
}

function assetLabel(a: RequestLogAssignment): string {
  if (!hasBookedAsset(a)) return slotItemLabel(a);
  const kind = a.kind === 'laptop' ? 'Laptop' : 'AV';
  return [kind, `#${a.assetId}`, a.model, a.brand].filter(Boolean).join(' · ');
}

function requestMonthKey(entry: RequestLogEntry): string {
  if (entry.createdAt) {
    const d = new Date(entry.createdAt);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  return entry.borrowDate.slice(0, 7);
}

function monthHeading(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function requestMatchesDateFilter(entry: RequestLogEntry, fromIso: string, toIso: string): boolean {
  if (!fromIso && !toIso) return true;
  const submitted = entry.createdAt
    ? localDateToIso(new Date(entry.createdAt))
    : entry.borrowDate;
  if (fromIso && submitted < fromIso) return false;
  if (toIso && submitted > toIso) return false;
  return true;
}

function formatDateTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ManagedStamp({ at, by }: { at: string | null; by: string | null }) {
  if (!at) return <span>—</span>;
  return (
    <div>
      <p>{formatDateTime(at)}</p>
      {by ? <p className="mt-0.5">by {by}</p> : null}
    </div>
  );
}

function groupByMonth(entries: RequestLogEntry[]): [string, RequestLogEntry[]][] {
  const map = new Map<string, RequestLogEntry[]>();
  for (const entry of entries) {
    const key = requestMonthKey(entry);
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function TechnicianRequestLogPage() {
  const [entries, setEntries] = useState<RequestLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const dateRangeInvalid = useMemo(() => {
    if (!dateFrom || !dateTo) return false;
    const from = isoToLocalDate(dateFrom);
    const to = isoToLocalDate(dateTo);
    return Boolean(from && to && from > to);
  }, [dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listRequestLogFn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load request log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (dateRangeInvalid) return [];
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (!requestMatchesDateFilter(e, dateFrom, dateTo)) return false;
        if (!q) return true;
        return [
          String(e.requestId),
          e.requesterName,
          e.requestedBy,
          e.programType,
          e.usageLocation,
          e.remarks,
          ...e.items.map((i) => i.assetType),
          ...e.assignments.map((a) => assetLabel(a)),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const byMonth = requestMonthKey(b).localeCompare(requestMonthKey(a));
        if (byMonth !== 0) return byMonth;
        return b.requestId - a.requestId;
      });
  }, [entries, search, dateFrom, dateTo, dateRangeInvalid]);

  const pagination = usePagination(filtered, {
    pageSize: 15,
    resetKey: `${search}|${dateFrom}|${dateTo}|${filtered.length}`,
  });

  const grouped = useMemo(
    () => groupByMonth(pagination.paginatedItems),
    [pagination.paginatedItems],
  );

  const selected = useMemo(
    () => entries.find((e) => e.requestId === selectedId) ?? null,
    [entries, selectedId],
  );

  return (
    <TechnicianShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Request log</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            People who submitted borrow requests, grouped by month.
          </p>
        </div>
        <RequestToolbarActions />
      </div>

      <Card className="mb-4 rounded-[14px] border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Requesters</CardTitle>
              <CardDescription>
                {filtered.length} request{filtered.length === 1 ? '' : 's'}
                {filtered.length !== entries.length && ` of ${entries.length}`}
                {dateRangeInvalid && ' · End date must be on or after start date'}
              </CardDescription>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-[8px] pl-9"
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <DatePickerField label="From date" value={dateFrom} onChange={setDateFrom} />
            <DatePickerField label="To date" value={dateTo} onChange={setDateTo} />
          </div>
        </CardHeader>
      </Card>

      <Card className="mb-4 overflow-hidden rounded-[14px] border-border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No requests found.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">Requester</TableHead>
                    <TableHead className="hidden h-9 text-xs sm:table-cell">Submitted</TableHead>
                    <TableHead className="hidden h-9 text-xs md:table-cell">Borrow period</TableHead>
                    <TableHead className="hidden h-9 text-xs lg:table-cell">Program</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map(([month, monthEntries]) => (
                    <Fragment key={month}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={4} className="py-2 text-xs font-medium text-muted-foreground">
                          {monthHeading(month)}
                          <span className="ml-2 tabular-nums">
                            ({monthEntries.length} request{monthEntries.length === 1 ? '' : 's'})
                          </span>
                        </TableCell>
                      </TableRow>
                      {monthEntries.map((entry) => (
                        <TableRow
                          key={entry.requestId}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setSelectedId(entry.requestId)}
                        >
                          <TableCell className="py-3">
                            <p className="font-medium text-foreground">{entry.requesterName}</p>
                            <p className="text-xs text-muted-foreground sm:hidden">
                              {entry.createdAt
                                ? formatDateLabel(localDateToIso(new Date(entry.createdAt)))
                                : formatDateLabel(entry.borrowDate)}
                            </p>
                          </TableCell>
                          <TableCell className="hidden py-3 text-sm text-muted-foreground sm:table-cell">
                            {entry.createdAt
                              ? formatDateLabel(localDateToIso(new Date(entry.createdAt)))
                              : formatDateLabel(entry.borrowDate)}
                          </TableCell>
                          <TableCell className="hidden py-3 text-sm text-muted-foreground md:table-cell">
                            {formatDateLabel(entry.borrowDate)} → {formatDateLabel(entry.returnDate)}
                          </TableCell>
                          <TableCell className="hidden py-3 lg:table-cell">
                            <p className="text-sm">{entry.programType}</p>
                            <p className="text-xs text-muted-foreground">{entry.usageLocation}</p>
                          </TableCell>
                        </TableRow>
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

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-[14px]">
          {selected && <RequestLogDetail entry={selected} />}
        </DialogContent>
      </Dialog>
    </TechnicianShell>
  );
}

function RequestLogDetail({ entry }: { entry: RequestLogEntry }) {
  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
          <div className="min-w-0 space-y-1.5">
            <DialogTitle>{entry.requesterName}</DialogTitle>
            <DialogDescription>
              #{entry.requestId} · {formatDateLabel(entry.borrowDate)} → {formatDateLabel(entry.returnDate)}{' '}
              · {entry.programType} · {entry.usageLocation}
            </DialogDescription>
          </div>
          <ScopedAskAiButton
            target={{
              type: 'request',
              requestId: entry.requestId,
              requesterName: entry.requesterName,
            }}
            label="Ask about this request"
          />
        </div>
      </DialogHeader>

      {entry.remarks && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Remarks:</span> {entry.remarks}
        </p>
      )}

      {entry.assignments.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Assets
          </p>
          <div className="overflow-x-auto rounded-[10px] border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Asset</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Booked</TableHead>
                  <TableHead>Checkout</TableHead>
                  <TableHead>Returned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.assignments.map((a) => (
                  <TableRow key={a.assignmentId}>
                    <TableCell>
                      {a.slotMark ? (
                        <span
                          className={cn(
                            'text-sm font-medium',
                            a.slotMark === 'not_taken'
                              ? 'text-muted-foreground'
                              : 'text-amber-800 dark:text-amber-200',
                          )}
                        >
                          {a.slotMark === 'not_taken' ? 'Not taken' : 'Unavailable'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          {a.kind === 'laptop' ? (
                            <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Tv className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {assetLabel(a)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{a.assetType ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.slotMark ? (
                        '—'
                      ) : (
                        <ManagedStamp at={a.assignedAt} by={a.bookedBy} />
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <ManagedStamp at={a.checkoutAt} by={a.bookedBy} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <ManagedStamp at={a.returnedAt} by={a.returnedBy} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}
