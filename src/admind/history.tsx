import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, History, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DisposalUnitShell } from '@/disposal-unit/disposal-unit-shell';
import { isoToLocalDate, localDateToIso } from '@shared/lib/date-format';
import { ASSET_KIND_LABEL } from '@shared/lib/inventory-schema';
import type { DisposalHistoryBatch, DisposalReport } from '@shared/lib/disposal-schema';
import { DatePickerField } from '@/technician/deploy-return-fields';
import { disposalPhotoPath } from '@shared/lib/disposal-photo';
import {
  downloadDisposalBundle,
  downloadDisposalLampiran1,
  downloadDisposalLampiran2,
  downloadDisposalTpa10,
} from '@/lib/disposal-documents';
import {
  getDisposalReportFn,
  listDisposalHistoryFn,
} from '@backend/server/assets/assets.functions';

const REPORT_DOWNLOADS = [
  { label: 'Lampiran 1', download: downloadDisposalLampiran1 },
  { label: 'Lampiran 2', download: downloadDisposalLampiran2 },
  { label: 'TPA10', download: downloadDisposalTpa10 },
] as const;

function startOfDayMs(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDayMs(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

function batchDateIso(batch: DisposalHistoryBatch): string | null {
  return batch.disposalDate ?? batch.submittedAt?.slice(0, 10) ?? null;
}

function matchesDateFilter(isoDate: string | null, fromIso: string, toIso: string) {
  if (!fromIso && !toIso) return true;
  if (!isoDate) return false;
  const event = isoToLocalDate(isoDate);
  if (!event) return false;
  const eventMs = event.getTime();
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

function storedImageSrc(value: string) {
  return disposalPhotoPath(value);
}

function formatAssetLabel(asset: DisposalHistoryBatch['assets'][number]) {
  const name = [asset.brand, asset.model].filter(Boolean).join(' ').trim();
  return name || String(asset.assetId);
}

export function DisposalUnitHistoryPage() {
  const [batches, setBatches] = useState<DisposalHistoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<DisposalReport | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (label: string, download: () => Promise<void>) => {
    setDownloading(label);
    try {
      await download();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not generate ${label}`);
    } finally {
      setDownloading(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await listDisposalHistoryFn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load disposal history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dateRangeInvalid = useMemo(() => {
    if (!dateFrom || !dateTo) return false;
    const from = isoToLocalDate(dateFrom);
    const to = isoToLocalDate(dateTo);
    return Boolean(from && to && from > to);
  }, [dateFrom, dateTo]);

  const hasDateFilter = Boolean(dateFrom || dateTo);

  const filtered = useMemo(() => {
    if (dateRangeInvalid) return [];
    const q = search.trim().toLowerCase();
    return batches.filter((batch) => {
      if (!matchesDateFilter(batchDateIso(batch), dateFrom, dateTo)) return false;
      if (!q) return true;
      const haystack = [
        batch.batch,
        batch.noRujukanPelupusan,
        batch.pusat,
        batch.submittedBy ?? '',
        batch.remarks ?? '',
        ...batch.assets.flatMap((asset) => [
          formatAssetLabel(asset),
          String(asset.assetId),
          asset.serialNum ?? '',
          ASSET_KIND_LABEL[asset.kind],
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [batches, search, dateFrom, dateTo, dateRangeInvalid]);

  const openReport = async (noRujukanPelupusan: string) => {
    setReportOpen(true);
    setReportLoading(true);
    setReport(null);
    try {
      setReport(await getDisposalReportFn({ data: noRujukanPelupusan }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load disposal forms');
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <DisposalUnitShell>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="shrink-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading submitted batches…'
              : `${filtered.length} batch${filtered.length === 1 ? '' : 'es'}${
                  filtered.length !== batches.length ? ` of ${batches.length}` : ''
                } · Grouped by no. rujukan pelupusan`}
          </p>
        </div>

        <Card className="shrink-0 rounded-[14px] border-border shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="min-w-0 max-w-sm">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rujukan, asset, serial…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-[8px] pl-9"
                />
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
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Quick range</Label>
                <div className="flex h-10 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-[8px] px-3"
                    disabled={!hasDateFilter}
                    onClick={() => {
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
                      const today = new Date();
                      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                      setDateFrom(localDateToIso(monthStart));
                      setDateTo(localDateToIso(today));
                    }}
                  >
                    This month
                  </Button>
                </div>
              </div>
            </div>

            {dateRangeInvalid ? (
              <p className="text-xs text-destructive">End date must be on or after start date.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border-border shadow-sm">
          <CardContent className="min-h-0 flex-1 overflow-auto p-0">
            {loading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <History className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No disposal history matches your filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-11 px-4 sm:px-5">Batch</TableHead>
                    <TableHead className="h-11 px-4">Assets</TableHead>
                    <TableHead className="h-11 px-4">Pusat</TableHead>
                    <TableHead className="h-11 px-4">Submitted by</TableHead>
                    <TableHead className="h-11 px-4">Disposed on</TableHead>
                    <TableHead className="h-11 px-4 sm:px-5">Forms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((batch) => (
                    <TableRow key={batch.batch}>
                      <TableCell className="px-4 py-3 font-medium text-foreground sm:px-5">
                        <code className="text-xs">{batch.batch}</code>
                        <p className="text-[10px] text-muted-foreground">
                          {batch.assetCount} asset{batch.assetCount === 1 ? '' : 's'}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        <ul className="space-y-1">
                          {batch.assets.map((asset) => (
                            <li key={`${asset.kind}:${asset.assetId}`}>
                              <span className="text-foreground">{formatAssetLabel(asset)}</span>
                              <span className="ml-2 font-mono text-[10px]">{asset.assetId}</span>
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{batch.pusat}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {batch.submittedBy ?? '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {formatDate(batchDateIso(batch))}
                      </TableCell>
                      <TableCell className="px-4 py-3 sm:px-5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 rounded-[8px]"
                          onClick={() => void openReport(batch.noRujukanPelupusan)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Disposal forms</DialogTitle>
            <DialogDescription>
              {report
                ? `${report.batch} · ${report.noRujukanPelupusan} · ${report.pusat}`
                : 'Lampiran 1, Lampiran 2, and Borang TP10'}
            </DialogDescription>
          </DialogHeader>
          {reportLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading forms…</p>
          ) : report ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 rounded-[8px]"
                  disabled={downloading !== null}
                  onClick={() =>
                    void handleDownload('All forms', () => downloadDisposalBundle(report))
                  }
                >
                  <Download className="h-4 w-4" />
                  {downloading === 'All forms' ? 'Preparing…' : 'All forms'}
                </Button>
                {REPORT_DOWNLOADS.map(({ label, download }) => (
                  <Button
                    key={label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-[8px]"
                    disabled={downloading !== null}
                    onClick={() => void handleDownload(label, () => download(report))}
                  >
                    <Download className="h-4 w-4" />
                    {downloading === label ? 'Preparing…' : label}
                  </Button>
                ))}
              </div>
              <ul className="divide-y divide-border rounded-[10px] border border-border">
                {report.lampiran1.map((asset, index) => (
                  <li key={`${asset.kind}:${asset.assetId}`} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{asset.nama}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ASSET_KIND_LABEL[asset.kind]} · {asset.assetId}
                        {asset.serialNum ? ` · ${asset.serialNum}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {[asset.imageWholeAsset, asset.imageSerialNumber].map((src, i) => {
                        const imageSrc = src ? storedImageSrc(src) : null;
                        return imageSrc ? (
                          <img
                            key={i}
                            src={imageSrc}
                            alt=""
                            className="h-10 w-10 rounded-[6px] border border-border object-cover"
                          />
                        ) : (
                          <span key={i} className="h-10 w-10 rounded-[6px] border border-dashed border-border" />
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DisposalUnitShell>
  );
}
