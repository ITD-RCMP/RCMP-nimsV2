import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  History,
  Layers,
  Laptop,
  Loader2,
  MapPin,
  Network,
  RotateCcw,
  Search,
  Tv,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { readTechnicianSession } from '@shared/lib/auth-session';
import { formatDateLabel, localDateToIso } from '@shared/lib/date-format';
import { ASSET_KIND_LABEL, type AssetKind } from '@shared/lib/inventory-schema';
import type { PmAssetCondition, PmLocationTree, PmPlaceAsset } from '@shared/lib/pm-schema';
import { pmAssetKey, pmZoneLookupKey } from '@shared/lib/pm-schema';
import { cn } from '@/lib/utils';
import {
  createPmLogFn,
  getPmLocationTreeFn,
  listPmAssetsAtPlaceFn,
} from '@backend/server/operations/pm.functions';
import { TechnicianShell } from '@/itd/technician-shell';

type WizardStep = 0 | 1 | 2 | 3;

const STEPS = ['Building', 'Level', 'Room / zone', 'Asset condition'] as const;

const KIND_ICON: Record<AssetKind, typeof Laptop> = {
  laptop: Laptop,
  av: Tv,
  network: Network,
};

const KIND_ORDER: AssetKind[] = ['laptop', 'av', 'network'];

type AssetFilter = 'all' | 'faulty' | 'open';

function haptic(pattern: number | number[] = 8) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}

function assetLabel(asset: PmPlaceAsset) {
  return [asset.brand, asset.model].filter(Boolean).join(' ') || `Asset #${asset.assetId}`;
}

/** Tappable Building › Level › Room trail; tapping a filled crumb jumps back to that step. */
function LocationTrail({
  step,
  building,
  level,
  zone,
  onStepClick,
}: {
  step: WizardStep;
  building: string;
  level: string;
  zone: string;
  onStepClick: (step: WizardStep) => void;
}) {
  const crumbs = [
    { step: 0 as WizardStep, icon: Building2, value: building, placeholder: 'Building' },
    { step: 1 as WizardStep, icon: Layers, value: level, placeholder: 'Level' },
    { step: 2 as WizardStep, icon: MapPin, value: zone, placeholder: 'Room' },
  ];

  return (
    <nav aria-label="Location" className="liquid-card rounded-[18px] p-1.5">
      <ol className="flex items-stretch gap-1">
        {crumbs.map((c, i) => {
          const Icon = c.icon;
          const active = step === c.step;
          const done = step > c.step && Boolean(c.value);
          return (
            <li key={c.placeholder} className="flex min-w-0 flex-1 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />}
              <button
                type="button"
                disabled={!done}
                onClick={() => onStepClick(c.step)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-1.5 rounded-[12px] px-2 py-2 text-left transition-all',
                  active && 'bg-primary text-primary-foreground shadow-sm',
                  done && 'bg-lavender/20 text-[oklch(0.4_0.12_290)] active:scale-95',
                  !active && !done && 'text-muted-foreground/70',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-[12px] font-semibold">{c.value || c.placeholder}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function OptionList({
  items,
  icon: Icon,
  selected,
  loadingItem,
  subtitle,
  onPick,
  emptyText,
}: {
  items: string[];
  icon: typeof Building2;
  selected: string;
  loadingItem?: string;
  subtitle?: (item: string) => string | undefined;
  onPick: (item: string) => void;
  emptyText: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => item.toLowerCase().includes(q)) : items;
  }, [items, query]);

  return (
    <div className="space-y-3">
      {items.length > 6 && (
        <label className="flex h-11 items-center gap-2.5 rounded-[14px] border border-border bg-card px-3.5 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${items.length} options`}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-sm placeholder:text-muted-foreground"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </label>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {items.length === 0 ? emptyText : 'No matches'}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[18px] border border-border bg-card shadow-sm">
          {filtered.map((item, i) => {
            const isSelected = selected === item;
            const isLoading = loadingItem === item;
            const sub = subtitle?.(item);
            return (
              <li
                key={item}
                className="border-b border-border/70 last:border-b-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 fill-mode-both"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <button
                  type="button"
                  onClick={() => {
                    haptic(6);
                    onPick(item);
                  }}
                  disabled={Boolean(loadingItem)}
                  className={cn(
                    'flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted/60 disabled:opacity-60',
                    isSelected && 'bg-lavender/10',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]',
                      isSelected ? 'bg-lavender/30 text-[oklch(0.4_0.12_290)]' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{item}</span>
                    {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
                  </span>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ConditionToggle({
  faulty,
  onChange,
}: {
  faulty: boolean;
  onChange: (next: PmAssetCondition) => void;
}) {
  return (
    <div className="relative grid h-10 w-[148px] shrink-0 grid-cols-2 rounded-full bg-muted p-1" role="radiogroup" aria-label="Condition">
      <span
        className={cn(
          'absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full shadow-sm transition-all duration-300 ease-out',
          faulty ? 'translate-x-full bg-red-600' : 'translate-x-0 bg-emerald-600',
        )}
        aria-hidden
      />
      <button
        type="button"
        role="radio"
        aria-checked={!faulty}
        onClick={() => onChange('good')}
        className={cn(
          'relative z-[1] flex items-center justify-center gap-1 text-xs font-bold transition-colors',
          !faulty ? 'text-white' : 'text-muted-foreground',
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
        Good
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={faulty}
        onClick={() => onChange('faulty')}
        className={cn(
          'relative z-[1] flex items-center justify-center gap-1 text-xs font-bold transition-colors',
          faulty ? 'text-white' : 'text-muted-foreground',
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Issue
      </button>
    </div>
  );
}

function AssetConditionRow({
  asset,
  rowId,
  condition,
  remarks,
  onConditionChange,
  onRemarksChange,
}: {
  asset: PmPlaceAsset;
  rowId: string;
  condition: PmAssetCondition;
  remarks: string;
  onConditionChange: (next: PmAssetCondition) => void;
  onRemarksChange: (next: string) => void;
}) {
  const Icon = KIND_ICON[asset.kind];
  const faulty = condition === 'faulty';
  const missingRemarks = faulty && !remarks.trim();

  return (
    <li
      id={rowId}
      className={cn(
        'relative scroll-mt-24 px-4 py-3.5 transition-colors duration-300',
        faulty && 'bg-red-50/70 dark:bg-red-950/20',
      )}
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-1 transition-colors duration-300',
          faulty ? 'bg-red-500' : 'bg-emerald-500/70',
        )}
        aria-hidden
      />
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition-colors',
            faulty ? 'bg-red-100 text-red-600 dark:bg-red-950/50' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{assetLabel(asset)}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {asset.serialNum ?? `#${asset.assetId}`}
            {asset.category ? <span className="font-sans"> · {asset.category}</span> : null}
          </p>
        </div>
        <ConditionToggle
          faulty={faulty}
          onChange={(next) => {
            haptic(next === 'faulty' ? [12, 30, 12] : 8);
            onConditionChange(next);
          }}
        />
      </div>

      {asset.pendingFollowUp && (
        <div className="mt-2.5 flex gap-2 rounded-[12px] bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <History className="mt-px h-3.5 w-3.5 shrink-0" />
          <p>
            <span className="font-bold">
              Open issue{asset.lastFaultDate ? ` · ${formatDateLabel(asset.lastFaultDate)}` : ''}
            </span>
            {asset.lastFaultRemarks ? `: ${asset.lastFaultRemarks}` : ''}
          </p>
        </div>
      )}

      {faulty && (
        <div className="mt-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <textarea
            value={remarks}
            onChange={(e) => onRemarksChange(e.target.value)}
            placeholder="What is wrong with this asset? (required)"
            autoFocus
            rows={2}
            className={cn(
              'w-full resize-none rounded-[12px] border bg-card px-3 py-2.5 text-base outline-none transition-shadow placeholder:text-sm placeholder:text-muted-foreground focus:ring-2',
              missingRemarks ? 'border-red-400 focus:ring-red-300' : 'border-border focus:ring-ring',
            )}
          />
          {missingRemarks && <p className="mt-1 text-[11px] font-medium text-red-600">Remarks are required.</p>}
        </div>
      )}
    </li>
  );
}

export function PmFormPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>(0);
  const [tree, setTree] = useState<PmLocationTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [building, setBuilding] = useState('');
  const [level, setLevel] = useState('');
  const [zone, setZone] = useState('');
  const [assets, setAssets] = useState<PmPlaceAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [conditions, setConditions] = useState<Record<string, PmAssetCondition>>({});
  const [assetRemarks, setAssetRemarks] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<AssetFilter>('all');

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      setTree(await getPmLocationTreeFn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load locations');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const levels = building && tree ? (tree.levelsByBuilding[building] ?? []) : [];
  const zones =
    building && level && tree
      ? (tree.zonesByBuildingLevel[pmZoneLookupKey(building, level)] ?? [])
      : [];

  const faultyKeys = useMemo(
    () =>
      assets
        .map((a) => pmAssetKey(a.kind, a.assetId))
        .filter((key) => (conditions[key] ?? 'good') === 'faulty'),
    [assets, conditions],
  );
  const remarksMissing = faultyKeys.some((key) => !assetRemarks[key]?.trim());
  const canSave = assets.length > 0 && !remarksMissing && !saving;
  const openIssueCount = assets.filter((a) => a.pendingFollowUp).length;

  const groupedAssets = useMemo(() => {
    const visible = assets.filter((a) => {
      if (filter === 'faulty') return (conditions[pmAssetKey(a.kind, a.assetId)] ?? 'good') === 'faulty';
      if (filter === 'open') return a.pendingFollowUp;
      return true;
    });
    return KIND_ORDER.map((kind) => ({ kind, rows: visible.filter((a) => a.kind === kind) })).filter(
      (g) => g.rows.length > 0,
    );
  }, [assets, conditions, filter]);

  const defaultConditions = (rows: PmPlaceAsset[]) =>
    Object.fromEntries(rows.map((a) => [pmAssetKey(a.kind, a.assetId), 'good' as const]));

  const resetChecks = () => {
    setConditions({});
    setAssetRemarks({});
    setRemarks('');
    setFilter('all');
  };

  const goBack = () => {
    if (step === 0) return;
    goToStep((step - 1) as WizardStep);
  };

  const goToStep = (target: WizardStep) => {
    if (target >= step) return;
    if (target <= 0) {
      setLevel('');
      setZone('');
      setAssets([]);
      resetChecks();
    } else if (target === 1) {
      setZone('');
      setAssets([]);
      resetChecks();
    } else if (target === 2) {
      setAssets([]);
      resetChecks();
    }
    setStep(target);
  };

  const pickBuilding = (next: string) => {
    setBuilding(next);
    setLevel('');
    setZone('');
    setAssets([]);
    resetChecks();
    setStep(1);
  };

  const pickLevel = (next: string) => {
    setLevel(next);
    setZone('');
    setAssets([]);
    resetChecks();
    setStep(2);
  };

  const loadAssets = async (nextZone = zone) => {
    setAssetsLoading(true);
    try {
      const rows = await listPmAssetsAtPlaceFn({ data: { building, level, zone: nextZone } });
      setAssets(rows);
      setConditions(defaultConditions(rows));
      setAssetRemarks({});
      setRemarks('');
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      setAssetsLoading(false);
    }
  };

  const pickZone = (next: string) => {
    if (assetsLoading) return;
    setZone(next);
    setAssets([]);
    resetChecks();
    void loadAssets(next);
  };

  const markAllGood = () => {
    haptic(10);
    setConditions(defaultConditions(assets));
    setFilter('all');
  };

  const handleSubmit = async () => {
    if (!canSave) {
      toast.error('Add remarks for every asset that needs action');
      const firstMissing = faultyKeys.find((key) => !assetRemarks[key]?.trim());
      if (firstMissing) {
        setFilter('all');
        requestAnimationFrame(() =>
          document.getElementById(`pm-asset-${firstMissing}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        );
      }
      return;
    }
    const session = readTechnicianSession();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return;
    }

    setSaving(true);
    try {
      const result = await createPmLogFn({
        data: {
          building,
          level,
          zone,
          performedBy: session.staffId,
          pmDate: localDateToIso(new Date()),
          remarks: remarks.trim() || null,
          assets: assets.map((asset) => {
            const key = pmAssetKey(asset.kind, asset.assetId);
            const condition = conditions[key] ?? 'good';
            return {
              assetType: asset.kind,
              assetId: asset.assetId,
              condition,
              remarks: condition === 'faulty' ? assetRemarks[key]?.trim() || null : null,
            };
          }),
        },
      });
      toast.success(
        result.faultyCount === 0
          ? `Maintenance saved · ${result.assetsTotal} asset${result.assetsTotal === 1 ? '' : 's'} in good condition`
          : `Maintenance saved · ${result.faultyCount} asset${result.faultyCount === 1 ? '' : 's'} flagged for further action`,
      );
      await navigate({ to: '/itd/preventive-maintenance' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save maintenance');
    } finally {
      setSaving(false);
    }
  };

  const goodCount = assets.length - faultyKeys.length;

  return (
    <TechnicianShell>
      <div className={cn('mx-auto w-full max-w-xl', step === 3 && assets.length > 0 && 'pb-28')}>
        <div className="-mt-4 mb-4 flex items-center gap-3 sm:-mt-6">
          {step === 0 ? (
            <Link
              to="/itd/preventive-maintenance"
              aria-label="Exit maintenance"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-transform active:scale-90"
            >
              <X className="h-4 w-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={goBack}
              disabled={saving}
              aria-label="Back"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-transform active:scale-90"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">Run maintenance</h1>
            <p className="text-xs text-muted-foreground">
              {formatDateLabel(localDateToIso(new Date()))} · Step {step + 1} of {STEPS.length}
            </p>
          </div>
        </div>

        <LocationTrail step={step} building={building} level={level} zone={zone} onStepClick={goToStep} />

        <div
          key={step}
          className="mt-5 animate-in fade-in-0 slide-in-from-right-4 duration-300"
        >
          {step < 3 && (
            <div className="mb-3 px-1">
              <h2 className="text-base font-bold">
                {step === 0 ? 'Where are you?' : step === 1 ? `Which level in ${building}?` : `Which room on ${level}?`}
              </h2>
              <p className="text-xs text-muted-foreground">
                {step === 0
                  ? 'Buildings with currently deployed / placed assets'
                  : step === 1
                    ? 'Pick the level you are checking'
                    : 'All assets in the room will load, marked as good'}
              </p>
            </div>
          )}

          {step === 0 &&
            (treeLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[60px] animate-pulse rounded-[18px] bg-muted" />
                ))}
              </div>
            ) : (
              <OptionList
                items={tree?.buildings ?? []}
                icon={Building2}
                selected={building}
                onPick={pickBuilding}
                subtitle={(b) => {
                  const n = tree?.levelsByBuilding[b]?.length ?? 0;
                  return `${n} level${n === 1 ? '' : 's'}`;
                }}
                emptyText="No deployed assets with building / level / zone found."
              />
            ))}

          {step === 1 && (
            <OptionList
              items={levels}
              icon={Layers}
              selected={level}
              onPick={pickLevel}
              subtitle={(l) => {
                const n = tree?.zonesByBuildingLevel[pmZoneLookupKey(building, l)]?.length ?? 0;
                return `${n} room${n === 1 ? '' : 's'} / zone${n === 1 ? '' : 's'}`;
              }}
              emptyText="No levels found for this building."
            />
          )}

          {step === 2 && (
            <OptionList
              items={zones}
              icon={MapPin}
              selected={zone}
              loadingItem={assetsLoading ? zone : undefined}
              onPick={pickZone}
              emptyText="No rooms found on this level."
            />
          )}

          {step === 3 &&
            (assets.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-border bg-card py-12 text-center">
                <MapPin className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-semibold">No assets in this room</p>
                <p className="text-xs text-muted-foreground">Nothing is currently placed in {zone}.</p>
                <button
                  type="button"
                  onClick={goBack}
                  className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-semibold active:scale-95"
                >
                  Choose another room
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[20px] bg-primary p-4 text-primary-foreground shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lavender">Checking</p>
                      <p className="truncate text-lg font-bold leading-tight">{zone}</p>
                      <p className="truncate text-xs text-primary-foreground/70">
                        {building} · {level}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={markAllGood}
                      disabled={faultyKeys.length === 0}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-40"
                    >
                      <RotateCcw className="h-3 w-3" />
                      All good
                    </button>
                  </div>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-primary-foreground/15">
                    <span
                      className="h-full bg-emerald-400 transition-[width] duration-500"
                      style={{ width: `${(goodCount / assets.length) * 100}%` }}
                    />
                    <span
                      className="h-full bg-red-400 transition-[width] duration-500"
                      style={{ width: `${(faultyKeys.length / assets.length) * 100}%` }}
                    />
                  </div>
                  <div className="mt-2 flex gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <b className="tabular-nums">{goodCount}</b> good
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      <b className="tabular-nums">{faultyKeys.length}</b> need action
                    </span>
                    <span className="ml-auto text-primary-foreground/70">
                      {assets.length} asset{assets.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist">
                  {(
                    [
                      { id: 'all', label: `All ${assets.length}` },
                      { id: 'faulty', label: `Needs action ${faultyKeys.length}` },
                      ...(openIssueCount > 0 ? [{ id: 'open', label: `Open issues ${openIssueCount}` }] : []),
                    ] as { id: AssetFilter; label: string }[]
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.id}
                      onClick={() => setFilter(f.id)}
                      className={cn(
                        'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95',
                        filter === f.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <p className="px-1 text-xs text-muted-foreground">
                  Everything starts as <b className="text-emerald-700 dark:text-emerald-400">Good</b>. Switch an asset
                  to <b className="text-red-600">Issue</b> only if it needs further action.
                </p>

                {groupedAssets.length === 0 ? (
                  <p className="rounded-[18px] border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    {filter === 'faulty' ? 'No assets marked as needing action.' : 'Nothing to show.'}
                  </p>
                ) : (
                  groupedAssets.map((group) => {
                    const GroupIcon = KIND_ICON[group.kind];
                    return (
                      <section key={group.kind}>
                        <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          <GroupIcon className="h-3.5 w-3.5" />
                          {ASSET_KIND_LABEL[group.kind]}
                          <span className="font-semibold normal-case tracking-normal">· {group.rows.length}</span>
                        </p>
                        <ul className="divide-y divide-border/70 overflow-hidden rounded-[18px] border border-border bg-card shadow-sm">
                          {group.rows.map((asset) => {
                            const key = pmAssetKey(asset.kind, asset.assetId);
                            return (
                              <AssetConditionRow
                                key={key}
                                rowId={`pm-asset-${key}`}
                                asset={asset}
                                condition={conditions[key] ?? 'good'}
                                remarks={assetRemarks[key] ?? ''}
                                onConditionChange={(next) =>
                                  setConditions((prev) => ({ ...prev, [key]: next }))
                                }
                                onRemarksChange={(next) =>
                                  setAssetRemarks((prev) => ({ ...prev, [key]: next }))
                                }
                              />
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })
                )}

                <section>
                  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Visit remarks
                  </p>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional notes for this maintenance visit…"
                    rows={3}
                    className="w-full resize-none rounded-[18px] border border-border bg-card px-4 py-3 text-base shadow-sm outline-none placeholder:text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  />
                </section>
              </div>
            ))}
        </div>
      </div>

      {step === 3 && assets.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 pb-[max(1rem,env(safe-area-inset-bottom))] pl-4 pr-24 md:pl-[16.25rem] md:pr-24">
          <div className="liquid-card mx-auto flex max-w-xl items-center gap-3 rounded-full p-1.5 pl-4 shadow-lg">
            <div className="min-w-0 flex-1 text-xs leading-tight">
              {remarksMissing ? (
                <p className="font-semibold text-red-600">Remarks needed</p>
              ) : faultyKeys.length > 0 ? (
                <p className="font-semibold text-red-600">
                  {faultyKeys.length} issue{faultyKeys.length === 1 ? '' : 's'}
                </p>
              ) : (
                <p className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCheck className="h-3.5 w-3.5" />
                  All good
                </p>
              )}
              <p className="truncate text-muted-foreground">{assets.length} checked</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              aria-disabled={!canSave}
              className={cn(
                'flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-all active:scale-95',
                !canSave && 'opacity-50',
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </TechnicianShell>
  );
}
