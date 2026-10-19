import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, FileX, Laptop, Network, Search, Trash2, Tv, Upload } from 'lucide-react';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { PREDISPOSAL_REASON_LABEL, picturesComplete, type PreDisposedAsset } from '@shared/lib/disposal-schema';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { AssetTablePagination } from '@/technician/asset-table-pagination';
import { TechnicianDisposalViewMenu } from '@/technician/disposal-view-menu';
import { TechnicianShell } from '@/technician/technician-shell';
import {
  listPreDisposedAssetsFn,
  removeAssetsFromPredisposalFn,
  removePredisposedPicturesFn,
} from '@backend/server/assets/assets.functions';
import { PredisposedPictureDialog } from '@/technician/predisposed-picture-dialog';

function assetKey(kind: AssetKind, assetId: PreDisposedAsset['assetId']) {
  return `${kind}:${assetId}`;
}

type KindFilter = 'all' | AssetKind;

export function TechnicianPreDisposedPage() {
  const [assets, setAssets] = useState<PreDisposedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [captureAsset, setCaptureAsset] = useState<PreDisposedAsset | null>(null);
  const [removePicturesAsset, setRemovePicturesAsset] = useState<PreDisposedAsset | null>(null);
  const [viewPicturesAsset, setViewPicturesAsset] = useState<PreDisposedAsset | null>(null);
  const [removingPictures, setRemovingPictures] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listPreDisposedAssetsFn();
      setAssets(rows);
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
    let list = assets;
    if (kindFilter !== 'all') {
      list = list.filter((a) => a.kind === kindFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) =>
      [
        String(a.assetId),
        a.assetIdOld,
        a.model,
        a.brand,
        a.category,
        a.serialNum,
        a.kind,
        a.predisposedBy,
        PREDISPOSAL_REASON_LABEL[a.reason],
        picturesComplete(a) ? 'complete' : 'upload picture',
      ]
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

  const handleRemove = async () => {
    if (selectedAssets.length === 0) {
      toast.error('Select at least one asset');
      return;
    }
    setSaving(true);
    try {
      const result = await removeAssetsFromPredisposalFn({
        data: {
          assets: selectedAssets.map((a) => ({ kind: a.kind, assetId: a.assetId })),
        },
      });
      if (result.updated > 0) {
        toast.success(
          `Removed ${result.updated} asset${result.updated === 1 ? '' : 's'} from the pre-disposed queue`,
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
      toast.error(e instanceof Error ? e.message : 'Could not remove assets from the queue');
    } finally {
      setSaving(false);
    }
  };

  const applyPictures = (
    asset: PreDisposedAsset,
    pictures: Pick<PreDisposedAsset, 'imageWholeAsset' | 'imageSerialNumber'>,
  ) => {
    setAssets((prev) =>
      prev.map((row) =>
        row.kind === asset.kind && row.assetId === asset.assetId ? { ...row, ...pictures } : row,
      ),
    );
    setCaptureAsset((current) =>
      current && current.kind === asset.kind && current.assetId === asset.assetId
        ? { ...current, ...pictures }
        : current,
    );
  };

  const handleRemovePictures = async () => {
    if (!removePicturesAsset) return;
    setRemovingPictures(true);
    try {
      await removePredisposedPicturesFn({
        data: { kind: removePicturesAsset.kind, assetId: removePicturesAsset.assetId },
      });
      applyPictures(removePicturesAsset, { imageWholeAsset: null, imageSerialNumber: null });
      setRemovePicturesAsset(null);
      toast.success('Pictures removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove pictures');
    } finally {
      setRemovingPictures(false);
    }
  };

  return (
    <TechnicianShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" type="button" className="-ml-2 mb-2 gap-1.5" asChild>
            <Link to="/technician/disposal">
              <ArrowLeft className="h-4 w-4" />
              Back to disposal
            </Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Pre-disposed assets</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">
            Assets marked as pre-disposed and queued for the disposal unit. Remove assets to revert
            them to return status.
          </p>
        </div>
        <TechnicianDisposalViewMenu />
      </div>

      <Card className="rounded-[14px] border-border shadow-sm">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Pre-disposed queue</CardTitle>
            <CardDescription>
              {filtered.length} shown · {assets.length} total · search by asset ID, legacy ID (AV),
              model, brand, category, serial, or pre-disposed by
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
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-[8px] text-destructive hover:text-destructive"
              disabled={selected.size === 0 || saving}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Remove from queue{selected.size > 0 ? ` (${selected.size})` : ''}
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
                  <TableHead className="font-semibold">Pre-disposed</TableHead>
                  <TableHead className="font-semibold">By</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                      {assets.length === 0
                        ? 'No assets are currently marked as pre-disposed.'
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
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatPredisposedAt(a.predisposedAt)}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate text-sm text-muted-foreground">
                          {a.predisposedBy ?? '—'}
                        </TableCell>
                        <TableCell>
                          <PredisposalPictureStatusBadge complete={picturesComplete(a)} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center">
                            {a.imageWholeAsset || a.imageSerialNumber ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground transition-transform duration-100 ease-out hover:text-foreground active:scale-[0.97]"
                                aria-label={`View pictures for ${a.kind} ${a.assetId}`}
                                onClick={() => setViewPicturesAsset(a)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {picturesComplete(a) ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground transition-transform duration-100 ease-out hover:text-destructive active:scale-[0.97]"
                                aria-label={`Remove pictures for ${a.kind} ${a.assetId}`}
                                onClick={() => setRemovePicturesAsset(a)}
                              >
                                <FileX className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground transition-transform duration-100 ease-out hover:text-foreground active:scale-[0.97]"
                                aria-label={`Upload for ${a.kind} ${a.assetId}`}
                                onClick={() => setCaptureAsset(a)}
                              >
                                <Upload className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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
            <AlertDialogTitle>Remove selected assets from the pre-disposed queue?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedAssets.length} asset{selectedAssets.length === 1 ? '' : 's'} will be reverted
              to return status (status 2) and removed from the disposal queue.
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
              className="rounded-[8px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void handleRemove();
              }}
            >
              {saving ? 'Removing…' : 'Confirm removal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={viewPicturesAsset != null}
        onOpenChange={(open) => {
          if (!open) setViewPicturesAsset(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[14px] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Uploaded pictures</DialogTitle>
            <DialogDescription>
              {viewPicturesAsset
                ? `${ASSET_KIND_LABEL[viewPicturesAsset.kind]} · ${viewPicturesAsset.assetId}`
                : 'Whole asset and serial number'}
            </DialogDescription>
          </DialogHeader>
          {viewPicturesAsset ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <RemovePicturePreview title="Whole asset" src={viewPicturesAsset.imageWholeAsset} large />
              <RemovePicturePreview title="Serial number" src={viewPicturesAsset.imageSerialNumber} large />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <PredisposedPictureDialog
        asset={captureAsset}
        open={captureAsset != null}
        onOpenChange={(open) => {
          if (!open) setCaptureAsset(null);
        }}
        onPicturesChange={applyPictures}
      />

      <AlertDialog
        open={removePicturesAsset != null}
        onOpenChange={(open) => {
          if (!open && !removingPictures) setRemovePicturesAsset(null);
        }}
      >
        <AlertDialogContent className="rounded-[14px] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove uploaded pictures?</AlertDialogTitle>
            <AlertDialogDescription>
              Both photos for {removePicturesAsset ? String(removePicturesAsset.assetId) : 'this asset'} will
              be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removePicturesAsset ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <RemovePicturePreview
                title="Whole asset"
                src={removePicturesAsset.imageWholeAsset}
              />
              <RemovePicturePreview
                title="Serial number"
                src={removePicturesAsset.imageSerialNumber}
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[8px]" disabled={removingPictures}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[8px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removingPictures}
              onClick={(e) => {
                e.preventDefault();
                void handleRemovePictures();
              }}
            >
              {removingPictures ? 'Removing…' : 'Remove pictures'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TechnicianShell>
  );
}

function PredisposalPictureStatusBadge({ complete }: { complete: boolean }) {
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
      {complete ? 'Complete' : 'Upload picture'}
    </Badge>
  );
}

function RemovePicturePreview({
  title,
  src,
  large = false,
}: {
  title: string;
  src: string | null;
  large?: boolean;
}) {
  const frame = large ? 'aspect-[4/3] h-auto' : 'h-32';
  return (
    <div className="min-w-0">
      <p className={cn('mb-1.5 font-medium text-muted-foreground', large ? 'text-xs' : 'text-[11px]')}>
        {title}
      </p>
      {src ? (
        <img
          src={src}
          alt={title}
          className={cn('w-full rounded-[8px] border border-border object-cover', frame)}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-[8px] border border-dashed border-border text-xs text-muted-foreground',
            frame,
          )}
        >
          No photo
        </div>
      )}
    </div>
  );
}

function formatPredisposedAt(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
