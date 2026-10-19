import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, Laptop, Network, Search, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isoToLocalDate } from '@shared/lib/date-format';
import { ASSET_KIND_LABEL, type AssetId, type AssetKind } from '@shared/lib/inventory-schema';
import type { DisposalHistoryBatch } from '@shared/lib/disposal-schema';
import { cn } from '@/lib/utils';
import {
  listAdminDisposalHistoryFn,
  listStaffDisposalHistoryFn,
} from '@backend/server/assets/assets.functions';

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

function batchDateIso(batch: DisposalHistoryBatch): string | null {
  return batch.disposalDate ?? batch.submittedAt?.slice(0, 10) ?? null;
}

function formatAssetLabel(asset: DisposalHistoryBatch['assets'][number]) {
  const name = [asset.brand, asset.model].filter(Boolean).join(' ').trim();
  return name || String(asset.assetId);
}

function KindIcon({ kind }: { kind: AssetKind }) {
  const Icon = kind === 'laptop' ? Laptop : kind === 'av' ? Tv : Network;
  return <Icon className="h-3.5 w-3.5 text-[oklch(0.45_0.12_290)]" />;
}

function AssetIdLink({
  kind,
  assetId,
  viewer,
  children,
}: {
  kind: AssetKind;
  assetId: AssetId;
  viewer: 'admin' | 'technician';
  children: ReactNode;
}) {
  if (viewer === 'admin') {
    return (
      <Link
        to="/admin/asset/$kind/$assetId"
        params={{ kind, assetId: String(assetId) }}
        className="text-foreground underline-offset-2 hover:underline"
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      to="/itd/asset/$kind/$assetId"
      params={{ kind, assetId: String(assetId) }}
      className="text-foreground underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

export function DisposedHistoryList({ viewer }: { viewer: 'admin' | 'technician' }) {
  const [batches, setBatches] = useState<DisposalHistoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openBatch, setOpenBatch] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows =
        viewer === 'admin'
          ? await listAdminDisposalHistoryFn()
          : await listStaffDisposalHistoryFn();
      setBatches(rows);
      setOpenBatch(rows[0]?.batch ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load disposed assets');
    } finally {
      setLoading(false);
    }
  }, [viewer]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((batch) => {
      const haystack = [
        batch.batch,
        batch.noRujukanPelupusan,
        batch.pusat,
        batch.submittedBy ?? '',
        ...batch.assets.flatMap((asset) => [
          formatAssetLabel(asset),
          String(asset.assetId),
          asset.assetIdOld ?? '',
          asset.serialNum ?? '',
          ASSET_KIND_LABEL[asset.kind],
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [batches, search]);

  return (
    <>
      <p className="mb-4 text-xs text-muted-foreground sm:text-sm">
        {loading
          ? 'Loading submitted batches…'
          : `${filtered.length} batch${filtered.length === 1 ? '' : 'es'} · grouped by disposal batch`}
      </p>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search batch, asset ID, serial…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-[8px] pl-9"
        />
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="rounded-[14px] border-border shadow-sm">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {batches.length === 0
              ? 'No assets have been submitted for disposal yet.'
              : 'No batches match your search.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((batch) => {
            const open = openBatch === batch.batch;
            return (
              <Collapsible
                key={batch.batch}
                open={open}
                onOpenChange={(next) => setOpenBatch(next ? batch.batch : null)}
              >
                <Card className="overflow-hidden rounded-[14px] border-border shadow-sm">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-foreground">{batch.batch}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {batch.assetCount} asset{batch.assetCount === 1 ? '' : 's'}
                          {' · '}
                          {formatDate(batchDateIso(batch))}
                          {batch.submittedBy ? ` · ${batch.submittedBy}` : ''}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                          open && 'rotate-180',
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="overflow-x-auto border-t border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="font-semibold">Kind</TableHead>
                            <TableHead className="font-semibold">ID</TableHead>
                            <TableHead className="font-semibold">Asset</TableHead>
                            <TableHead className="font-semibold">Serial</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {batch.assets.map((asset) => (
                            <TableRow key={`${asset.kind}:${asset.assetId}`}>
                              <TableCell>
                                <span className="inline-flex items-center gap-1.5 text-sm">
                                  <KindIcon kind={asset.kind} />
                                  {ASSET_KIND_LABEL[asset.kind]}
                                </span>
                              </TableCell>
                              <TableCell>
                                <AssetIdLink kind={asset.kind} assetId={asset.assetId} viewer={viewer}>
                                  <code className="text-xs">{asset.assetId}</code>
                                </AssetIdLink>
                                {asset.assetIdOld ? (
                                  <p className="text-[10px] text-muted-foreground">{asset.assetIdOld}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="font-medium">{formatAssetLabel(asset)}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {asset.serialNum ?? '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </>
  );
}
