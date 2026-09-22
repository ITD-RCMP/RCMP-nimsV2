import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Laptop, Network, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { INVENTORY_STATUSES, ACC_CODE_OPTIONS } from '@shared/lib/inventory-schema';
import { STATUS_ID } from '@shared/lib/asset-status-actions';
import { coerceToIsoDate } from '@shared/lib/date-format';
import {
  emptyPurchaseFormState,
  purchaseFormToInput,
  type PurchaseFormState,
} from '@shared/lib/purchase-field-utils';
import {
  emptyWarrantyFormState,
  warrantyFormToInput,
  type WarrantyFormState,
} from '@/lib/warranty-field-utils';
import {
  ASSET_ID_PREFIX,
  ASSET_ID_SEQUENCE_MAX,
  canonicalizeLaptopCategory,
  composeAssetId,
  formatAssetId,
  getAssetIdYearDigits,
  getLaptopAssetIdPrefix,
  getPrefixForKind,
  isKnownLaptopCategory,
  isValidAssetTag,
  LAPTOP_CATEGORY_OPTIONS,
  normalizeAssetTag,
  parseAssetId,
} from '@/hooks/assetid-generator';
import { useNextAssetId } from '@/hooks/use-next-asset-id';
import { cn } from '@/lib/utils';
import { TechnicianShell } from '@/technician/technician-shell';
import { LaptopCategoryFields } from '@/technician/laptop-category-fields';
import { PurchaseFieldsSection } from '@/technician/asset-purchase-fields';
import { WarrantyFieldsSection } from '@/technician/warranty-fields';
import {
  ASSET_KIND_LABEL,
  ASSET_LIST_PATH,
  type AssetKind,
  type CreateAvInput,
  type CreateLaptopInput,
  type CreateNetworkInput,
  useAssets,
} from '@/hooks/assets';

type AddAssetSearch = { kind?: AssetKind };

type AssetEntry = {
  key: string;
  accCode: string;
  brand: string;
  model: string;
  supplier: string;
  serialNum: string;
  remarks: string;
  category: string;
  partNumber: string;
  processor: string;
  memory: string;
  os: string;
  storage: string;
  gpu: string;
  assetIdOld: string;
  macAddress: string;
  ipAddress: string;
  tagging: string;
  purchase: PurchaseFormState;
  warranty: WarrantyFormState;
};

const KIND_OPTIONS: { kind: AssetKind; icon: typeof Laptop; description: string }[] = [
  { kind: 'laptop', icon: Laptop, description: 'Full laptop table incl. PO / DO / invoice fields' },
  { kind: 'av', icon: Tv, description: 'Full av table incl. asset_id_old & procurement' },
  { kind: 'network', icon: Network, description: 'Full network table incl. MAC, IP & procurement' },
];

function isAssetKind(value: unknown): value is AssetKind {
  return value === 'laptop' || value === 'av' || value === 'network';
}

function newEntry(kind: AssetKind): AssetEntry {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    accCode: '',
    brand: '',
    model: '',
    supplier: '',
    serialNum: '',
    remarks: '',
    category: kind === 'laptop' ? LAPTOP_CATEGORY_OPTIONS[0] : '',
    partNumber: '',
    processor: '',
    memory: '',
    os: '',
    storage: '',
    gpu: '',
    assetIdOld: '',
    macAddress: '',
    ipAddress: '',
    tagging: '',
    purchase: emptyPurchaseFormState(),
    warranty: emptyWarrantyFormState(),
  };
}

function assetIdHint(kind: AssetKind, category: string): string {
  const year = String(getAssetIdYearDigits()).padStart(2, '0');
  if (kind === 'av') return `${ASSET_ID_PREFIX.av}-${year}-xxx`;
  if (kind === 'network') return `${ASSET_ID_PREFIX.network}-${year}-xxx`;
  if (!category.trim() || !isKnownLaptopCategory(category)) {
    return `${ASSET_ID_PREFIX.other}-${year}-xxx`;
  }
  return `${getLaptopAssetIdPrefix(category)}-${year}-xxx`;
}

function entrySummary(entry: AssetEntry, index: number): { title: string; subtitle: string } {
  const title = entry.serialNum.trim() || entry.model.trim() || `Asset ${index + 1}`;
  const bits = [entry.brand, entry.model, entry.category].map((v) => v.trim()).filter(Boolean);
  const subtitle = bits.filter((bit) => bit !== title).join(' · ') || 'No details yet';
  return { title, subtitle };
}

export function TechnicianAddAssetPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as AddAssetSearch;
  const presetKind = isAssetKind(search.kind) ? search.kind : undefined;

  const [selectedKind, setSelectedKind] = useState<AssetKind | null>(presetKind ?? null);
  const kind = selectedKind ?? presetKind ?? null;

  const laptop = useAssets('laptop');
  const av = useAssets('av');
  const network = useAssets('network');

  if (!kind) {
    return (
      <TechnicianShell>
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Register asset</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Choose a category to add the asset to the inventory system.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {KIND_OPTIONS.map(({ kind: k, icon: Icon, description }) => (
            <Card key={k} className="rounded-[14px] border-border/80 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-lavender/15 text-[oklch(0.45_0.12_290)]">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{ASSET_KIND_LABEL[k]}</CardTitle>
                <CardDescription className="text-xs">{description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-0">
                <Button variant="outline" size="sm" className="w-full rounded-[8px]" asChild>
                  <Link to="/technician/add-asset" search={{ kind: k }}>
                    Register assets
                  </Link>
                </Button>
                <Button variant="secondary" size="sm" className="w-full rounded-[8px]" asChild>
                  <Link to="/technician/bulk-import" search={{ kind: k }}>
                    Bulk import
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </TechnicianShell>
    );
  }

  return (
    <TechnicianShell>
      <AssetForm
        kind={kind}
        onBack={() => {
          setSelectedKind(null);
          void navigate({ to: '/technician/add-asset', search: {} });
        }}
        onCreated={(createdKind, count) => {
          toast.success(
            count === 1
              ? `${ASSET_KIND_LABEL[createdKind]} registered`
              : `Registered ${count} ${ASSET_KIND_LABEL[createdKind].toLowerCase()} assets`,
          );
          void navigate({ to: ASSET_LIST_PATH[createdKind] });
        }}
        bulkCreateLaptop={laptop.bulkCreate}
        bulkCreateAv={av.bulkCreate}
        bulkCreateNetwork={network.bulkCreate}
      />
    </TechnicianShell>
  );
}

function AssetForm({
  kind,
  onBack,
  onCreated,
  bulkCreateLaptop,
  bulkCreateAv,
  bulkCreateNetwork,
}: {
  kind: AssetKind;
  onBack: () => void;
  onCreated: (kind: AssetKind, count: number) => void;
  bulkCreateLaptop: (
    rows: Array<Omit<CreateLaptopInput, 'assetId'> & { assetId?: string | number; tagging?: string | null }>,
  ) => Promise<number>;
  bulkCreateAv: (
    rows: Array<Omit<CreateAvInput, 'assetId'> & { assetId?: string | number; tagging?: string | null }>,
  ) => Promise<number>;
  bulkCreateNetwork: (
    rows: Array<Omit<CreateNetworkInput, 'assetId'> & { assetId?: string | number; tagging?: string | null }>,
  ) => Promise<number>;
}) {
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<AssetEntry[]>(() => [newEntry(kind)]);
  const [selectedKey, setSelectedKey] = useState(entries[0].key);
  const statusId = STATUS_ID.NEW;
  const selectedIndex = entries.findIndex((entry) => entry.key === selectedKey);
  const selected = entries[selectedIndex] ?? entries[0];

  const updateEntry = (key: string, patch: Partial<AssetEntry>) => {
    setEntries((current) => current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  };

  const addEntry = () => {
    const next = newEntry(kind);
    setEntries((current) => [...current, next]);
    setSelectedKey(next.key);
  };

  const removeEntry = (key: string) => {
    setEntries((current) => {
      const index = current.findIndex((entry) => entry.key === key);
      const remaining = current.filter((entry) => entry.key !== key);
      const fallback = remaining[Math.max(0, index - 1)] ?? remaining[0];
      if (fallback) setSelectedKey(fallback.key);
      return remaining;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (entries.length === 0) {
      toast.error('Add at least one asset.');
      return;
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (kind === 'laptop' && !entry.serialNum.trim()) {
        toast.error(`Serial number is required for asset ${i + 1}.`);
        setSelectedKey(entry.key);
        return;
      }
      if (kind === 'laptop' && !canonicalizeLaptopCategory(entry.category)) {
        toast.error(`Enter a category name for asset ${i + 1}.`);
        setSelectedKey(entry.key);
        return;
      }
      const tagging = normalizeAssetTag(entry.tagging);
      if (tagging && !isValidAssetTag(tagging)) {
        toast.error(
          `Tagging on asset ${i + 1} is optional. Use 1–16 letters, numbers, hyphens, or underscores.`,
        );
        setSelectedKey(entry.key);
        return;
      }
      const warranty = warrantyFormToInput(entry.warranty);
      const hasWarrantyPartial =
        Boolean(coerceToIsoDate(entry.warranty.startDate)) ||
        Boolean(coerceToIsoDate(entry.warranty.endDate)) ||
        Boolean(entry.warranty.remarks.trim());
      if (hasWarrantyPartial && !warranty) {
        toast.error(
          `Warranty on asset ${i + 1} needs a start date on or before the end date, or leave warranty blank.`,
        );
        setSelectedKey(entry.key);
        return;
      }
    }

    const serials = entries.map((entry) => entry.serialNum.trim().toLowerCase()).filter(Boolean);
    const duplicate = serials.find((serial, index) => serials.indexOf(serial) !== index);
    if (duplicate) {
      toast.error(`Serial number "${duplicate}" is used more than once in this batch.`);
      return;
    }

    setSaving(true);
    try {
      if (kind === 'laptop') {
        await bulkCreateLaptop(
          entries.map((entry) => ({
            accCode: entry.accCode.trim() || null,
            serialNum: entry.serialNum.trim(),
            category: canonicalizeLaptopCategory(entry.category),
            brand: entry.brand.trim() || null,
            model: entry.model.trim() || null,
            supplier: entry.supplier.trim() || null,
            partNumber: entry.partNumber.trim() || null,
            processor: entry.processor.trim() || null,
            memory: entry.memory.trim() || null,
            os: entry.os.trim() || null,
            storage: entry.storage.trim() || null,
            gpu: entry.gpu.trim() || null,
            ...purchaseFormToInput(entry.purchase),
            statusId,
            remarks: entry.remarks.trim() || null,
            tagging: normalizeAssetTag(entry.tagging) || null,
            warranty: warrantyFormToInput(entry.warranty),
          })),
        );
      } else if (kind === 'av') {
        await bulkCreateAv(
          entries.map((entry) => ({
            accCode: entry.accCode.trim() || null,
            assetIdOld: entry.assetIdOld.trim() || null,
            category: entry.category.trim() || null,
            brand: entry.brand.trim() || null,
            model: entry.model.trim() || null,
            supplier: entry.supplier.trim() || null,
            serialNum: entry.serialNum.trim() || null,
            ...purchaseFormToInput(entry.purchase),
            statusId,
            remarks: entry.remarks.trim() || null,
            tagging: normalizeAssetTag(entry.tagging) || null,
            warranty: warrantyFormToInput(entry.warranty),
          })),
        );
      } else {
        await bulkCreateNetwork(
          entries.map((entry) => ({
            accCode: entry.accCode.trim() || null,
            category: entry.category.trim() || null,
            serialNum: entry.serialNum.trim() || null,
            brand: entry.brand.trim() || null,
            model: entry.model.trim() || null,
            supplier: entry.supplier.trim() || null,
            macAddress: entry.macAddress.trim() || null,
            ipAddress: entry.ipAddress.trim() || null,
            ...purchaseFormToInput(entry.purchase),
            statusId,
            remarks: entry.remarks.trim() || null,
            tagging: normalizeAssetTag(entry.tagging) || null,
            warranty: warrantyFormToInput(entry.warranty),
          })),
        );
      }
      onCreated(kind, entries.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The assets could not be saved. Try again.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" type="button" className="-ml-2 mb-2 gap-1.5" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Change category
          </Button>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Add {ASSET_KIND_LABEL[kind]}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Fill one asset at a time. Use the rail to switch or add more.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-[8px]" asChild>
          <Link to={ASSET_LIST_PATH[kind]}>Cancel</Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-1 overflow-x-auto rounded-[12px] border border-border bg-muted/40 p-1">
          {entries.map((entry, index) => {
            const summary = entrySummary(entry, index);
            const active = entry.key === selected.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setSelectedKey(entry.key)}
                className={cn(
                  'flex min-w-[160px] max-w-[220px] shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-left transition-colors',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                    active ? 'bg-foreground text-background' : 'bg-background text-muted-foreground',
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-foreground">{summary.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{summary.subtitle}</span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={addEntry}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {selected ? (
          <AssetEntryCard
            kind={kind}
            index={Math.max(0, selectedIndex)}
            entry={selected}
            sequenceOffset={assetSequenceOffset(kind, entries, Math.max(0, selectedIndex))}
            canRemove={entries.length > 1}
            onChange={(patch) => updateEntry(selected.key, patch)}
            onRemove={() => removeEntry(selected.key)}
          />
        ) : null}

        <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-[12px] border border-border bg-card/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="rounded-[8px]" asChild>
            <Link to={ASSET_LIST_PATH[kind]}>Cancel</Link>
          </Button>
          <Button
            type="submit"
            className="rounded-[8px] bg-foreground text-background hover:opacity-90"
            disabled={saving}
          >
            {saving
              ? 'Saving…'
              : entries.length === 1
                ? 'Register asset'
                : `Register ${entries.length} assets`}
          </Button>
        </div>
      </form>
    </>
  );
}

function assetSequenceOffset(kind: AssetKind, entries: AssetEntry[], index: number): number {
  const current = prefixForEntry(kind, entries[index]?.category ?? '');
  if (current == null) return 0;
  return entries
    .slice(0, index)
    .filter((entry) => prefixForEntry(kind, entry.category) === current).length;
}

function prefixForEntry(kind: AssetKind, category: string): number | null {
  try {
    return getPrefixForKind(kind, { category });
  } catch {
    return null;
  }
}

function offsetAssetId(base: number, offset: number): number | null {
  const { prefix, year, sequence } = parseAssetId(base);
  const next = sequence + offset;
  if (next > ASSET_ID_SEQUENCE_MAX) return null;
  return formatAssetId(prefix, year, next);
}

function AssetEntryCard({
  kind,
  index,
  entry,
  sequenceOffset,
  canRemove,
  onChange,
  onRemove,
}: {
  kind: AssetKind;
  index: number;
  entry: AssetEntry;
  sequenceOffset: number;
  canRemove: boolean;
  onChange: (patch: Partial<AssetEntry>) => void;
  onRemove: () => void;
}) {
  const statusId = STATUS_ID.NEW;
  const hint = assetIdHint(kind, entry.category);
  const { assetId, isLoading } = useNextAssetId(kind, kind === 'laptop' ? entry.category : undefined);
  const numericId = assetId == null ? null : offsetAssetId(assetId, sequenceOffset);
  const tagging = normalizeAssetTag(entry.tagging);
  const taggingInvalid = Boolean(tagging) && !isValidAssetTag(tagging);
  let assetIdPreview = hint;
  if (isLoading) assetIdPreview = 'Generating…';
  else if (numericId != null) {
    assetIdPreview = taggingInvalid ? String(numericId) : composeAssetId(numericId, tagging);
  }

  return (
    <Card className="rounded-[14px] border-border shadow-sm">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-row items-start justify-between gap-3">
          <CardTitle className="text-base">Asset {index + 1}</CardTitle>
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-[8px] px-2 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Asset ID">
            <Input
              value={assetIdPreview}
              disabled
              readOnly
              className="rounded-[8px] font-mono disabled:opacity-100"
            />
            <p className="text-[11px] text-muted-foreground">Assigned on save. This field cannot be edited.</p>
          </Field>
          <Field label="Tagging">
            <Input
              value={entry.tagging}
              onChange={(e) => onChange({ tagging: e.target.value })}
              className="rounded-[8px]"
              placeholder="RMK"
              maxLength={16}
            />
            <p className="text-[11px] text-muted-foreground">
              {taggingInvalid
                ? 'Use 1–16 letters, numbers, hyphens, or underscores.'
                : 'Optional. Leave blank, or add a short tag. It is saved in brackets, for example 1226001 (RMK).'}
            </p>
          </Field>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Main details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account code">
              <Select
                value={entry.accCode || undefined}
                onValueChange={(value) => onChange({ accCode: value })}
              >
                <SelectTrigger className="rounded-[8px]">
                  <SelectValue placeholder="Select account code" />
                </SelectTrigger>
                <SelectContent>
                  {ACC_CODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.value} ({opt.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status" required>
              <div className="flex h-10 items-center rounded-[8px] border border-input bg-muted/40 px-3 text-sm capitalize text-muted-foreground">
                {statusId} — {INVENTORY_STATUSES.find((s) => s.statusId === statusId)?.name ?? 'new'}
              </div>
            </Field>
            <Field label="Brand">
              <Input
                value={entry.brand}
                onChange={(e) => onChange({ brand: e.target.value })}
                className="rounded-[8px]"
                placeholder="Lenovo, HP, Dell, etc."
              />
            </Field>
            <Field label="Model">
              <Input
                value={entry.model}
                onChange={(e) => onChange({ model: e.target.value })}
                className="rounded-[8px]"
                placeholder="ThinkPad X1 Carbon, HP EliteBook 840 G8, etc."
              />
            </Field>
            <Field label="Supplier">
              <Input
                value={entry.supplier}
                onChange={(e) => onChange({ supplier: e.target.value })}
                className="rounded-[8px]"
                placeholder="Enter supplier name"
              />
            </Field>
            <Field label="Serial number" required={kind === 'laptop'}>
              <Input
                value={entry.serialNum}
                onChange={(e) => onChange({ serialNum: e.target.value })}
                required={kind === 'laptop'}
                className="rounded-[8px]"
                placeholder="Enter serial number"
              />
            </Field>
            {kind === 'laptop' && (
              <LaptopCategoryFields
                category={entry.category}
                onCategoryChange={(category) => onChange({ category })}
              />
            )}
            {kind === 'av' && (
              <>
                <Field label="Category">
                  <Input
                    value={entry.category}
                    onChange={(e) => onChange({ category: e.target.value })}
                    placeholder="display, projector…"
                    className="rounded-[8px]"
                  />
                </Field>
                <Field label="Legacy ID">
                  <Input
                    value={entry.assetIdOld}
                    onChange={(e) => onChange({ assetIdOld: e.target.value })}
                    className="rounded-[8px]"
                  />
                </Field>
              </>
            )}
            {kind === 'network' && (
              <>
                <Field label="Category">
                  <Input
                    value={entry.category}
                    onChange={(e) => onChange({ category: e.target.value })}
                    placeholder="switch, router, AP…"
                    className="rounded-[8px]"
                  />
                </Field>
                <Field label="MAC address">
                  <Input
                    value={entry.macAddress}
                    onChange={(e) => onChange({ macAddress: e.target.value })}
                    className="rounded-[8px]"
                  />
                </Field>
                <Field label="IP address">
                  <Input
                    value={entry.ipAddress}
                    onChange={(e) => onChange({ ipAddress: e.target.value })}
                    className="rounded-[8px]"
                  />
                </Field>
              </>
            )}
            <div className="sm:col-span-2">
              <Field label="Remarks">
                <Textarea
                  value={entry.remarks}
                  onChange={(e) => onChange({ remarks: e.target.value })}
                  className="min-h-[72px] rounded-[8px]"
                  placeholder="Optional notes for this asset"
                />
              </Field>
            </div>
          </div>
        </section>

        {kind === 'laptop' && (
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Laptop specs</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Part number">
                <Input
                  value={entry.partNumber}
                  onChange={(e) => onChange({ partNumber: e.target.value })}
                  className="rounded-[8px]"
                  placeholder="Enter part number"
                />
              </Field>
              <Field label="Processor">
                <Input
                  value={entry.processor}
                  onChange={(e) => onChange({ processor: e.target.value })}
                  className="rounded-[8px]"
                  placeholder="Enter processor"
                />
              </Field>
              <Field label="Memory">
                <Input
                  value={entry.memory}
                  onChange={(e) => onChange({ memory: e.target.value })}
                  className="rounded-[8px]"
                  placeholder="Enter memory"
                />
              </Field>
              <Field label="OS">
                <Input
                  value={entry.os}
                  onChange={(e) => onChange({ os: e.target.value })}
                  className="rounded-[8px]"
                  placeholder="Enter OS"
                />
              </Field>
              <Field label="Storage">
                <Input
                  value={entry.storage}
                  onChange={(e) => onChange({ storage: e.target.value })}
                  className="rounded-[8px]"
                  placeholder="Enter storage"
                />
              </Field>
              <Field label="GPU">
                <Input
                  value={entry.gpu}
                  onChange={(e) => onChange({ gpu: e.target.value })}
                  className="rounded-[8px]"
                  placeholder="Enter GPU"
                />
              </Field>
            </div>
          </section>
        )}

        <PurchaseFieldsSection
          values={entry.purchase}
          onChange={(patch) => onChange({ purchase: { ...entry.purchase, ...patch } })}
        />

        <WarrantyFieldsSection
          values={entry.warranty}
          onChange={(patch) => onChange({ warranty: { ...entry.warranty, ...patch } })}
        />
      </CardContent>
    </Card>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
