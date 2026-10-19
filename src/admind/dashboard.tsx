import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Clock3, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InsightStatCard } from '@/components/insight-stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DisposalUnitShell } from '@/disposal-unit/disposal-unit-shell';
import { usePagination } from '@/hooks/use-pagination';
import { formatAssetLifespan, formatDateLabel } from '@shared/lib/date-format';
import type { DisposalDashboardStats, PreDisposedAsset } from '@shared/lib/disposal-schema';
import { picturesComplete, PREDISPOSAL_REASON_LABEL } from '@shared/lib/disposal-schema';
import { cn } from '@/lib/utils';
import {
  getDisposalDashboardStatsFn,
  listDisposalQueueAssetsFn,
} from '@backend/server/assets/assets.functions';
import { AssetTablePagination } from '@/technician/asset-table-pagination';

function AttachmentStatusBadge({ complete }: { complete: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-[8px] whitespace-nowrap text-[10px] font-semibold',
        complete
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
      )}
    >
      {complete ? 'Complete' : 'Incomplete'}
    </Badge>
  );
}

function formatAssetName(asset: PreDisposedAsset) {
  const name = [asset.brand, asset.model].filter(Boolean).join(' ').trim();
  return name || '—';
}

function formatProposedDate(value: string | null) {
  if (!value) return '—';
  return formatDateLabel(value);
}

export function DisposalUnitDashboardPage() {
  const [assets, setAssets] = useState<PreDisposedAsset[]>([]);
  const [stats, setStats] = useState<DisposalDashboardStats>({
    pending: 0,
    disposedThisMonth: 0,
    disposedThisYear: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, dashboardStats] = await Promise.all([
        listDisposalQueueAssetsFn(),
        getDisposalDashboardStatsFn(),
      ]);
      setAssets(rows);
      setStats(dashboardStats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load disposal queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pagination = usePagination(assets, { resetKey: assets.length });

  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  return (
    <DisposalUnitShell>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="shrink-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Dashboard</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {todayLabel} · Disposal queue overview
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <InsightStatCard
            icon={Clock3}
            label="Pending"
            value={stats.pending}
            hint="Awaiting disposal review"
            tone="amber"
          />
          <InsightStatCard
            icon={CalendarCheck}
            label="Disposed (This month)"
            value={stats.disposedThisMonth}
            hint="Completed this month"
            tone="emerald"
          />
          <InsightStatCard
            icon={Trash2}
            label="Total Disposed (Year)"
            value={stats.disposedThisYear}
            hint="Completed this year"
            tone="violet"
          />
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border-border shadow-sm">
          <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b border-border/70 px-4 py-3 sm:px-5">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight">Disposal queue</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${assets.length} pre-disposed asset${assets.length === 1 ? '' : 's'} listed`}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="min-h-0 flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-11 px-4 sm:px-5">Asset ID</TableHead>
                    <TableHead className="h-11 px-4">Asset Name</TableHead>
                    <TableHead className="h-11 px-4">Serial Number</TableHead>
                    <TableHead className="h-11 px-4">Life span</TableHead>
                    <TableHead className="h-11 px-4">Proposed By</TableHead>
                    <TableHead className="h-11 px-4">Reason</TableHead>
                    <TableHead className="h-11 px-4 sm:px-5">Date Submitted</TableHead>
                    <TableHead className="h-11 px-4 sm:px-5">Status</TableHead>
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
                        No pre-disposed assets in the disposal queue.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagination.paginatedItems.map((asset) => (
                      <TableRow key={`${asset.kind}:${asset.assetId}`}>
                        <TableCell className="px-4 py-3 font-medium text-foreground sm:px-5">
                          <code className="text-xs">{asset.assetId}</code>
                          {asset.assetIdOld ? (
                            <p className="text-[10px] text-muted-foreground">{asset.assetIdOld}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-foreground">{formatAssetName(asset)}</TableCell>
                        <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {asset.serialNum ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatAssetLifespan(asset.poDate, asset.assetId)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground">
                          {asset.predisposedBy ?? '—'}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground">
                          {PREDISPOSAL_REASON_LABEL[asset.reason]}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground sm:px-5">
                          {formatProposedDate(asset.predisposedAt)}
                        </TableCell>
                        <TableCell className="px-4 py-3 sm:px-5">
                          <AttachmentStatusBadge complete={picturesComplete(asset)} />
                        </TableCell>
                      </TableRow>
                    ))
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
                totalLoaded={assets.length}
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
