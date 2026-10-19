import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  ClipboardCheck,
  Layers,
  Laptop,
  MapPin,
  Network,
  Tv,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
import { FormField } from '@/technician/deploy-return-fields';
import { TechnicianShell } from '@/technician/technician-shell';

type WizardStep = 0 | 1 | 2 | 3;

const STEPS = ['Building', 'Level', 'Room / zone', 'Asset condition'] as const;

const KIND_ICON: Record<AssetKind, typeof Laptop> = {
  laptop: Laptop,
  av: Tv,
  network: Network,
};

function ProgressBar({
  activeIndex,
  onStepClick,
}: {
  activeIndex: number;
  onStepClick: (step: WizardStep) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] sm:mb-5 sm:gap-2 sm:text-xs">
      {STEPS.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        const clickable = done;
        return (
          <div key={label} className="flex items-center gap-1.5 sm:gap-2">
            {i > 0 && <span className="text-muted-foreground/50">›</span>}
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick(i as WizardStep)}
                className="rounded-full px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
              >
                {label}
              </button>
            ) : (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-medium',
                  active && 'bg-lavender/20 text-[oklch(0.4_0.12_290)]',
                  !active && 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  icon: Icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Building2;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-[12px] border p-3.5 text-left transition-colors',
        selected
          ? 'border-[oklch(0.55_0.14_290)]/50 bg-lavender/10 shadow-sm'
          : 'border-border bg-card hover:bg-muted/40',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]',
          selected ? 'bg-lavender/25 text-[oklch(0.4_0.12_290)]' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {selected && <Check className="h-4 w-4 shrink-0 text-[oklch(0.45_0.12_290)]" />}
    </button>
  );
}

function StepFooter({
  onBack,
  backHref,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  nextIcon,
}: {
  onBack?: () => void;
  backHref?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextIcon?: ReactNode;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
      {backHref ? (
        <Button type="button" variant="outline" className="rounded-[8px] gap-1.5" asChild>
          <Link to="/technician/preventive-maintenance">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      ) : (
        <Button type="button" variant="outline" className="rounded-[8px] gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      )}
      {onNext && (
        <Button
          type="button"
          className="rounded-[8px] gap-1.5"
          disabled={nextDisabled}
          onClick={onNext}
        >
          {nextIcon}
          {nextLabel}
          {!nextIcon && <ChevronRight className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}

function assetLabel(asset: PmPlaceAsset) {
  return [asset.brand, asset.model].filter(Boolean).join(' ') || `Asset #${asset.assetId}`;
}

function AssetConditionCard({
  asset,
  condition,
  remarks,
  onConditionChange,
  onRemarksChange,
}: {
  asset: PmPlaceAsset;
  condition: PmAssetCondition;
  remarks: string;
  onConditionChange: (next: PmAssetCondition) => void;
  onRemarksChange: (next: string) => void;
}) {
  const Icon = KIND_ICON[asset.kind];
  const faulty = condition === 'faulty';
  const missingRemarks = faulty && !remarks.trim();

  return (
    <div
      className={cn(
        'rounded-[12px] border p-3 transition-colors',
        !faulty && 'border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20',
        faulty && 'border-red-500/40 bg-red-50/60 dark:bg-red-950/20',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{assetLabel(asset)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {asset.serialNum ?? `#${asset.assetId}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="rounded-[6px] text-[10px]">
              {ASSET_KIND_LABEL[asset.kind]}
            </Badge>
            {asset.category && (
              <Badge variant="secondary" className="rounded-[6px] text-[10px]">
                {asset.category}
              </Badge>
            )}
            {asset.pendingFollowUp && (
              <Badge
                variant="outline"
                className="rounded-[6px] border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300"
              >
                Open issue{asset.lastFaultDate ? ` · ${formatDateLabel(asset.lastFaultDate)}` : ''}
              </Badge>
            )}
          </div>
          {asset.pendingFollowUp && asset.lastFaultRemarks && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              Previous remarks: {asset.lastFaultRemarks}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={faulty ? 'outline' : 'default'}
            className={cn(
              'h-8 flex-1 rounded-[8px] gap-1',
              !faulty && 'bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-700',
            )}
            onClick={() => onConditionChange('good')}
          >
            <Check className="h-3.5 w-3.5" />
            Good
          </Button>
          <Button
            type="button"
            size="sm"
            variant={faulty ? 'default' : 'outline'}
            className={cn(
              'h-8 flex-1 rounded-[8px] gap-1',
              faulty && 'bg-red-600 hover:bg-red-600/90 dark:bg-red-700',
            )}
            onClick={() => onConditionChange('faulty')}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Needs action
          </Button>
        </div>
        {faulty && (
          <Textarea
            value={remarks}
            onChange={(e) => onRemarksChange(e.target.value)}
            placeholder="What is wrong with this asset? (required)"
            className={cn(
              'min-h-[64px] rounded-[8px] text-sm',
              missingRemarks && 'border-red-500 focus-visible:ring-red-500',
            )}
          />
        )}
      </div>
    </div>
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

  const defaultConditions = (rows: PmPlaceAsset[]) =>
    Object.fromEntries(rows.map((a) => [pmAssetKey(a.kind, a.assetId), 'good' as const]));

  const resetChecks = () => {
    setConditions({});
    setAssetRemarks({});
    setRemarks('');
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

  const handleSubmit = async () => {
    if (!canSave) {
      toast.error('Add remarks for every asset that needs action');
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
      await navigate({ to: '/technician/preventive-maintenance' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save maintenance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TechnicianShell>
      <div className="mb-4 sm:mb-5">
        <Button variant="ghost" size="sm" type="button" className="-ml-2 mb-2 gap-1.5" asChild>
          <Link to="/technician/preventive-maintenance">
            <ArrowLeft className="h-4 w-4" />
            Exit
          </Link>
        </Button>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Run maintenance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      <ProgressBar activeIndex={step} onStepClick={goToStep} />

      {step === 0 && (
        <Card className="rounded-[14px] border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select building</CardTitle>
            <CardDescription>Buildings with currently deployed / placed assets</CardDescription>
          </CardHeader>
          <CardContent>
            {treeLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading locations…</p>
            ) : !tree || tree.buildings.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No deployed assets with building / level / zone found.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {tree.buildings.map((b) => (
                  <ChoiceButton
                    key={b}
                    selected={building === b}
                    onClick={() => pickBuilding(b)}
                    icon={Building2}
                    title={b}
                    subtitle={`${tree.levelsByBuilding[b]?.length ?? 0} levels`}
                  />
                ))}
              </div>
            )}
            <StepFooter backHref="/technician/preventive-maintenance" />
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card className="rounded-[14px] border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select level</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {building}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {levels.map((l) => (
                <ChoiceButton
                  key={l}
                  selected={level === l}
                  onClick={() => pickLevel(l)}
                  icon={Layers}
                  title={l}
                  subtitle={`${tree?.zonesByBuildingLevel[pmZoneLookupKey(building, l)]?.length ?? 0} rooms / zones`}
                />
              ))}
            </div>
            <StepFooter onBack={goBack} />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="rounded-[14px] border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select room / zone</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {building} · {level}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {zones.map((z) => (
                <ChoiceButton
                  key={z}
                  selected={zone === z}
                  onClick={() => pickZone(z)}
                  icon={MapPin}
                  title={z}
                />
              ))}
            </div>
            {assetsLoading && (
              <p className="mt-4 text-center text-sm text-muted-foreground">Loading assets…</p>
            )}
            <StepFooter onBack={goBack} />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="rounded-[14px] border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Confirm asset condition</CardTitle>
                <CardDescription className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {building} · {level} · {zone}
                </CardDescription>
              </div>
              <p className="text-xs tabular-nums text-muted-foreground sm:pt-1">
                {assets.length} asset{assets.length === 1 ? '' : 's'}
                {faultyKeys.length > 0 &&
                  ` · ${faultyKeys.length} need${faultyKeys.length === 1 ? 's' : ''} action`}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {assets.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No assets are currently placed in this room.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  All assets start as good. Mark any that need further action and add remarks.
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {assets.map((asset) => {
                    const key = pmAssetKey(asset.kind, asset.assetId);
                    return (
                      <AssetConditionCard
                        key={key}
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
                </div>

                <FormField label="Visit remarks">
                  <Textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional notes for this maintenance visit…"
                    className="min-h-[72px] rounded-[8px]"
                  />
                </FormField>
              </>
            )}

            <StepFooter
              onBack={goBack}
              onNext={assets.length > 0 ? () => void handleSubmit() : undefined}
              nextLabel={saving ? 'Saving…' : 'Save maintenance'}
              nextDisabled={!canSave}
              nextIcon={<ClipboardCheck className="h-4 w-4" />}
            />
          </CardContent>
        </Card>
      )}
    </TechnicianShell>
  );
}
