import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Info, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { DisposalUnitShell } from '@/disposal-unit/disposal-unit-shell';
import { ASSET_KIND_LABEL } from '@shared/lib/inventory-schema';
import {
  DISPOSAL_PUSAT_DEFAULT,
  malaysiaNowTime,
  malaysiaTodayIso,
  parseDisposalBatchAssets,
  type PreDisposedAsset,
} from '@shared/lib/disposal-schema';
import { cn } from '@/lib/utils';
import { DatePickerField } from '@/technician/deploy-return-fields';
import { downloadDisposalBundle } from '@/lib/disposal-documents';
import {
  getDisposalReportFn,
  listDisposalQueueAssetsFn,
  peekNextDisposalBatchFn,
  submitDisposalBatchFn,
} from '@backend/server/assets/assets.functions';

type AssetFormFields = {
  latarBelakang: string;
  rekodFizikalHarta: string;
};

function assetKey(asset: Pick<PreDisposedAsset, 'kind' | 'assetId'>) {
  return `${asset.kind}:${asset.assetId}`;
}

function formatAssetName(asset: PreDisposedAsset) {
  const name = [asset.brand, asset.model].filter(Boolean).join(' ').trim();
  return name || '—';
}

function emptyAssetFields(): AssetFormFields {
  return {
    latarBelakang: '',
    rekodFizikalHarta: '',
  };
}

function filledCount(fields: AssetFormFields) {
  return [fields.latarBelakang.trim(), fields.rekodFizikalHarta.trim()].filter(Boolean).length;
}

export function DisposalUnitDisposalFormPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/disposal-unit/disposal-form' });
  const requested = useMemo(() => parseDisposalBatchAssets(search.assets), [search.assets]);

  const [queue, setQueue] = useState<PreDisposedAsset[]>([]);
  const [nextBatch, setNextBatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disposalDate, setDisposalDate] = useState(malaysiaTodayIso);
  const [disposalTime, setDisposalTime] = useState(malaysiaNowTime);
  const [pusat, setPusat] = useState(DISPOSAL_PUSAT_DEFAULT);
  const [remarks, setRemarks] = useState('');
  const [assetFields, setAssetFields] = useState<Record<string, AssetFormFields>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const assets = await listDisposalQueueAssetsFn();
      setQueue(assets);
      try {
        setNextBatch(await peekNextDisposalBatchFn());
      } catch {
        setNextBatch(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load selected assets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedAssets = useMemo(() => {
    const requestedKeys = new Set(requested.map((asset) => `${asset.kind}:${asset.assetId}`));
    return queue.filter((asset) => requestedKeys.has(assetKey(asset)));
  }, [queue, requested]);

  useEffect(() => {
    setAssetFields((prev) => {
      const next = { ...prev };
      for (const asset of selectedAssets) {
        const key = assetKey(asset);
        if (!next[key]) next[key] = emptyAssetFields();
      }
      return next;
    });
  }, [selectedAssets]);

  useEffect(() => {
    if (activeKey && selectedAssets.some((asset) => assetKey(asset) === activeKey)) return;
    setActiveKey(selectedAssets[0] ? assetKey(selectedAssets[0]) : null);
  }, [selectedAssets, activeKey]);

  const missingCount = requested.length - selectedAssets.length;

  const visibleAssets = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return selectedAssets;
    return selectedAssets.filter((asset) =>
      [formatAssetName(asset), String(asset.assetId), asset.serialNum ?? '', ASSET_KIND_LABEL[asset.kind]]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [selectedAssets, listSearch]);

  const activeAsset = selectedAssets.find((asset) => assetKey(asset) === activeKey) ?? null;
  const activeFields = activeKey ? (assetFields[activeKey] ?? emptyAssetFields()) : emptyAssetFields();

  const updateAssetField = (key: string, field: keyof AssetFormFields, value: string) => {
    setAssetFields((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? emptyAssetFields()), [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (selectedAssets.length === 0) {
      toast.error('No pending assets are available to submit.');
      return;
    }
    if (!disposalDate) {
      toast.error('Choose a disposal date.');
      return;
    }
    setSaving(true);
    try {
      const result = await submitDisposalBatchFn({
        data: {
          assets: selectedAssets.map((asset) => {
            const fields = assetFields[assetKey(asset)] ?? emptyAssetFields();
            return {
              kind: asset.kind,
              assetId: asset.assetId,
              latarBelakang: fields.latarBelakang,
              rekodFizikalHarta: fields.rekodFizikalHarta,
              imageWholeAsset: asset.imageWholeAsset,
              imageSerialNumber: asset.imageSerialNumber,
            };
          }),
          disposalDate,
          disposalTime,
          pusat,
          remarks,
        },
      });
      toast.success(
        `Submitted ${result.submitted} asset${result.submitted === 1 ? '' : 's'} as ${result.batch}`,
      );
      try {
        const report = await getDisposalReportFn({ data: result.noRujukanPelupusan });
        try {
          await downloadDisposalBundle(report);
        } catch (e) {
          toast.error(
            e instanceof Error
              ? `${e.message} Open History to download Lampiran 1, Lampiran 2, and TPA10.`
              : 'The automatic download was blocked. Open History to download Lampiran 1, Lampiran 2, and TPA10.',
          );
        }
      } catch (e) {
        toast.error(
          e instanceof Error
            ? `${e.message} Open History to download the forms.`
            : 'Could not generate disposal documents. Open History to download the forms.',
        );
      }
      await navigate({ to: '/disposal-unit/history' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit this disposal batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DisposalUnitShell>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" type="button" className="-ml-2 mb-1 gap-1.5" asChild>
              <Link to="/disposal-unit/disposal">
                <ArrowLeft className="h-4 w-4" />
                Back to queue
              </Link>
            </Button>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Disposal form</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? (
                'Loading selected assets…'
              ) : (
                <>
                  {nextBatch ? (
                    <>
                      Batch <code className="font-medium text-foreground">{nextBatch}</code>
                      {' · '}
                    </>
                  ) : null}
                  {`${selectedAssets.length} asset${selectedAssets.length === 1 ? '' : 's'} in this batch`}
                  {missingCount > 0 ? ` · ${missingCount} no longer pending` : ''}
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" className="rounded-[8px]" asChild>
              <Link to="/disposal-unit/disposal">Cancel</Link>
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5 rounded-[8px]"
              disabled={saving || loading || selectedAssets.length === 0}
              onClick={() => void handleSubmit()}
            >
              <Trash2 className="h-4 w-4" />
              {saving ? 'Submitting…' : `Submit (${selectedAssets.length})`}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading selected assets…</p>
        ) : requested.length === 0 ? (
          <Card className="rounded-[14px] border-border shadow-sm">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No assets were selected. Return to the queue and choose assets first.
            </CardContent>
          </Card>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] xl:overflow-hidden">
            <Card className="flex max-h-[40vh] min-h-0 flex-col overflow-hidden rounded-[14px] border-border shadow-sm xl:max-h-none">
              <div className="shrink-0 space-y-2 border-b border-border p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter assets…"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    className="h-9 rounded-[8px] pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {visibleAssets.length} shown · click a row to edit that asset
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
                {visibleAssets.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">No assets match.</p>
                ) : (
                  <ul>
                    {visibleAssets.map((asset, index) => {
                      const key = assetKey(asset);
                      const fields = assetFields[key] ?? emptyAssetFields();
                      const filled = filledCount(fields);
                      const isActive = key === activeKey;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => setActiveKey(key)}
                            className={cn(
                              'flex w-full items-start gap-2 border-b border-border/70 px-3 py-2.5 text-left',
                              isActive ? 'bg-lavender/10' : 'hover:bg-muted/40',
                            )}
                          >
                            <span className="w-6 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {formatAssetName(asset)}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                {asset.assetId}
                                {asset.serialNum ? ` · ${asset.serialNum}` : ''}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1 pt-0.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'rounded-[5px] px-1.5 text-[10px]',
                                  filled === 2
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                                    : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
                                )}
                              >
                                {filled === 2 ? 'Complete' : `${2 - filled} not filled`}
                              </Badge>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>

            <div className="flex min-w-0 flex-col gap-3 xl:min-h-0 xl:overflow-y-auto">
              <Card className="shrink-0 rounded-[14px] border-border shadow-sm">
                <CardContent className="space-y-3 p-4">
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                    These fields apply to all assets in this batch.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DatePickerField
                      label="Disposal date"
                      value={disposalDate}
                      onChange={setDisposalDate}
                      required
                    />
                    <div className="space-y-2">
                      <Label className="text-sm">Disposal time</Label>
                      <Input
                        type="time"
                        value={disposalTime}
                        onChange={(e) => setDisposalTime(e.target.value)}
                        className="h-10 rounded-[8px]"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-sm">Pusat</Label>
                      <Input
                        value={pusat}
                        onChange={(e) => setPusat(e.target.value)}
                        className="h-10 rounded-[8px]"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2 xl:col-span-4">
                      <Label className="text-sm">Disposal remarks</Label>
                      <Textarea
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Leave blank if not applicable"
                        className="min-h-[64px] rounded-[8px]"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card key={activeKey ?? 'empty'} className="rounded-[14px] border-border shadow-sm">
                {activeAsset && activeKey ? (
                  <>
                    <div className="border-b border-border px-4 py-3">
                      <p className="font-medium text-foreground">{formatAssetName(activeAsset)}</p>
                      <p className="text-xs text-muted-foreground">
                        {ASSET_KIND_LABEL[activeAsset.kind]} · {activeAsset.assetId}
                        {activeAsset.serialNum ? ` · SN ${activeAsset.serialNum}` : ''}
                      </p>
                    </div>
                    <div className="p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-sm">Latar Belakang</Label>
                          <Textarea
                            value={activeFields.latarBelakang}
                            onChange={(e) => updateAssetField(activeKey, 'latarBelakang', e.target.value)}
                            placeholder="Leave blank if not applicable"
                            className="min-h-[72px] rounded-[8px]"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-sm">Rekod Fizikal Harta</Label>
                          <Textarea
                            value={activeFields.rekodFizikalHarta}
                            onChange={(e) => updateAssetField(activeKey, 'rekodFizikalHarta', e.target.value)}
                            placeholder="Leave blank if not applicable"
                            className="min-h-[72px] rounded-[8px]"
                          />
                        </div>
                        <TechnicianPicturePreview
                          label="Whole asset"
                          src={activeAsset.imageWholeAsset}
                        />
                        <TechnicianPicturePreview
                          label="Serial number"
                          src={activeAsset.imageSerialNumber}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Select an asset from the list to edit its details.
                  </p>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </DisposalUnitShell>
  );
}

function TechnicianPicturePreview({ label, src }: { label: string; src: string | null }) {
  const [open, setOpen] = useState(false);
  const href = src ? (src.startsWith('/') ? src : `/${src}`) : null;
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      {href ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full overflow-hidden rounded-[8px] border border-border transition-transform duration-100 ease-out active:scale-[0.97]"
            aria-label={`View ${label} full size`}
          >
            <img src={href} alt="" className="h-36 w-full object-cover" />
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-h-[90vh] max-w-[min(90vw,56rem)] border-none bg-black p-3 text-white sm:rounded-[14px] [&>button]:text-white">
              <DialogTitle className="sr-only">{label}</DialogTitle>
              <img src={href} alt={label} className="max-h-[82vh] w-full object-contain" />
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-[8px] border border-dashed border-border text-xs text-muted-foreground">
          No technician photo
        </div>
      )}
    </div>
  );
}
