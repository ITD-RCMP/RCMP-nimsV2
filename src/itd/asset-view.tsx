import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Barcode,
  Clock,
  ExternalLink,
  Hash,
  History,
  MapPin,
  Package,
  Pencil,
  Shield,
  Truck,
  User,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AssetDetail, AssetDetailResponse, AssetId, AssetKind, AssetTrailEvent } from '@shared/lib/inventory-schema';
import { ASSET_KIND_LABEL, ASSET_LIST_PATH, formatAccCodeDisplay } from '@shared/lib/inventory-schema';
import type { OpenReturnContext } from '@shared/lib/deploy-return-schema';
import {
  formatAssetAge,
  formatDateLabel,
  formatPurchaseDateLabel,
  formatWarrantyRemaining,
  isoToLocalDate,
  normalizeToIsoDate,
  parseDdMmYyToIso,
} from '@shared/lib/date-format';
import type { WarrantyContext } from '@shared/lib/warranty-repair-schema';
import { getWarrantyContextFn } from '@backend/server/requests/warranty-repair.functions';
import { formatPurchaseCost } from '@shared/lib/purchase-field-utils';
import { cn } from '@/lib/utils';
import { AssetStatusBadge } from '@/technician/asset-status-badge';
import { AssetStatusActions } from '@/technician/asset-status-actions';
import { AssetDetailsForm } from '@/technician/asset-details-form';
import { TechnicianShell } from '@/technician/technician-shell';
import { getAssetDetailFn } from '@backend/server/assets/assets.functions';
import { getOpenReturnContextFn } from '@backend/server/requests/deploy-return.functions';

const bentoTile =
  'rounded-[22px] border border-border/60 bg-card shadow-[0_18px_40px_-30px_oklch(0.22_0.03_280/0.55)]';

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  const text = value?.trim() ? value : '—';
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[15px] leading-snug text-foreground break-words">{text}</p>
    </div>
  );
}

function RowField({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string | null | undefined;
  emphasis?: boolean;
}) {
  const text = value?.trim() ? value : '—';
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-6 py-3',
        emphasis && 'mt-1 border-t border-foreground/15 pt-3.5',
      )}
    >
      <p className={cn('text-sm', emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</p>
      <p className={cn('text-right text-sm text-foreground', emphasis && 'font-semibold')}>{text}</p>
    </div>
  );
}

function FactTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  const text = value?.trim() ? value : '—';
  return (
    <div className={cn(bentoTile, 'px-4 py-4')}>
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lavender/30 text-[oklch(0.4_0.12_290)]">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-[15px] font-semibold tracking-tight text-foreground break-words">{text}</p>
    </div>
  );
}

function DeploymentDetails({ deployment }: { deployment: OpenReturnContext | null }) {
  if (!deployment) {
    return (
      <p className="text-sm text-muted-foreground">
        No active deployment. This asset is not currently handed over or deployed to a place.
      </p>
    );
  }

  if (deployment.kind === 'laptop') {
    const r = deployment.record;
    if (r.type === 'staff') {
      return (
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Handover date" value={formatDateLabel(r.handoverDate)} />
          <DetailItem label="Employee number" value={r.employeeNo} />
          <DetailItem label="Name" value={r.recipientName} />
          <DetailItem label="Faculty" value={r.department} />
          <DetailItem label="Remarks" value={r.handoverRemarks} />
        </div>
      );
    }

    return (
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem label="Deployment date" value={formatDateLabel(r.handoverDate)} />
        <DetailItem label="Building" value={r.building} />
        <DetailItem label="Level" value={r.level} />
        <DetailItem label="Zone" value={r.zone} />
        <DetailItem label="Handler" value={r.handler} />
        <DetailItem label="Handled by" value={r.handledBy} />
        <DetailItem label="Remarks" value={r.handoverRemarks} />
      </div>
    );
  }

  const r = deployment.record;
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      <DetailItem label="Deployment date" value={formatDateLabel(r.deploymentDate)} />
      <DetailItem label="Building" value={r.building} />
      <DetailItem label="Level" value={r.level} />
      <DetailItem label="Zone" value={r.zone} />
      <DetailItem label="Handled by" value={r.handledBy} />
      <DetailItem label="Remarks" value={r.deploymentRemarks} />
    </div>
  );
}

function deploymentCardTitle(deployment: OpenReturnContext | null): string {
  if (!deployment) return 'Deployment details';
  if (deployment.kind === 'laptop' && deployment.record.type === 'staff') return 'Handover';
  return 'Place';
}

function deploymentSummaryLabel(deployment: OpenReturnContext | null): string {
  if (!deployment) return 'Not currently deployed';
  if (deployment.kind === 'laptop') {
    const r = deployment.record;
    if (r.type === 'staff') return `Handover · ${r.recipientName}`;
    const loc = [r.building, r.level, r.zone].filter(Boolean).join(' · ');
    return loc ? `Place · ${loc}` : 'Place';
  }
  const r = deployment.record;
  return `Place · ${r.building}`;
}

function DeploymentIcon({ deployment }: { deployment: OpenReturnContext | null }) {
  if (!deployment) return <MapPin className="h-4 w-4 text-muted-foreground" />;
  if (deployment.kind === 'laptop' && deployment.record.type === 'staff') {
    return <User className="h-4 w-4" />;
  }
  return deployment.kind === 'laptop' ? <Truck className="h-4 w-4" /> : <MapPin className="h-4 w-4" />;
}

function formatTrailWhen(at: string): string {
  if (!at) return '—';
  const trimmed = at.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return formatDateLabel(trimmed.slice(0, 10));
  }
  const beforeT = trimmed.split('T')[0] ?? trimmed;
  const fromCompact = parseDdMmYyToIso(beforeT);
  if (fromCompact) return formatDateLabel(fromCompact);
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function uniqueHeaderParts(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts;
}

function assetHeaderName(asset: AssetDetail): string {
  const parts = uniqueHeaderParts([asset.brand, asset.model]);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function warrantyTone(
  startDate: string,
  endDate: string,
): 'ok' | 'soon' | 'ended' | 'upcoming' {
  const end = isoToLocalDate(normalizeToIsoDate(endDate) ?? '');
  const start = isoToLocalDate(normalizeToIsoDate(startDate) ?? '');
  if (!end) return 'ok';
  const today = new Date();
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (start && todayLocal < start) return 'upcoming';
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.round((end.getTime() - todayLocal.getTime()) / msPerDay);
  if (daysLeft < 0) return 'ended';
  if (daysLeft <= 30) return 'soon';
  return 'ok';
}

function HeaderFact({
  icon: Icon,
  children,
  tone = 'neutral',
}: {
  icon: typeof Clock;
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'soon' | 'ended' | 'upcoming';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[8px] border px-2 py-1 text-xs font-medium',
        tone === 'ok' &&
          'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
        tone === 'soon' &&
          'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
        tone === 'ended' &&
          'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
        tone === 'upcoming' &&
          'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
        tone === 'neutral' && 'border-border bg-muted/60 text-foreground',
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-80" />
      {children}
    </span>
  );
}

function AssetSpecs({ asset }: { asset: AssetDetail }) {
  if (asset.kind === 'laptop') {
    return (
      <>
        <DetailItem label="Account code" value={formatAccCodeDisplay(asset.accCode)} />
        <DetailItem label="Category" value={asset.category} />
        <DetailItem label="Serial" value={asset.serialNum} />
        <DetailItem label="Brand" value={asset.brand} />
        <DetailItem label="Model" value={asset.model} />
        <DetailItem label="Supplier" value={asset.supplier} />
        <DetailItem label="Part number" value={asset.partNumber} />
        <DetailItem label="Processor" value={asset.processor} />
        <DetailItem label="Memory" value={asset.memory} />
        <DetailItem label="Storage" value={asset.storage} />
        <DetailItem label="OS" value={asset.os} />
        <DetailItem label="GPU" value={asset.gpu} />
      </>
    );
  }
  if (asset.kind === 'av') {
    return (
      <>
        <DetailItem label="Account code" value={formatAccCodeDisplay(asset.accCode)} />
        <DetailItem label="Legacy ID" value={asset.assetIdOld} />
        <DetailItem label="Category" value={asset.category} />
        <DetailItem label="Brand" value={asset.brand} />
        <DetailItem label="Model" value={asset.model} />
        <DetailItem label="Supplier" value={asset.supplier} />
        <DetailItem label="Serial" value={asset.serialNum} />
      </>
    );
  }
  return (
    <>
      <DetailItem label="Account code" value={formatAccCodeDisplay(asset.accCode)} />
      <DetailItem label="Category" value={asset.category} />
      <DetailItem label="Brand" value={asset.brand} />
      <DetailItem label="Model" value={asset.model} />
      <DetailItem label="Supplier" value={asset.supplier} />
      <DetailItem label="Serial" value={asset.serialNum} />
      <DetailItem label="IP address" value={asset.ipAddress} />
      <DetailItem label="MAC address" value={asset.macAddress} />
    </>
  );
}

function PurchaseBlock({ asset }: { asset: AssetDetail }) {
  return (
    <div>
      <div className="divide-y divide-border/80">
        <RowField label="PO date" value={formatPurchaseDateLabel(asset.poDate)} />
        <RowField label="PO number" value={asset.poNum} />
        <RowField label="DO date" value={formatPurchaseDateLabel(asset.doDate)} />
        <RowField label="DO number" value={asset.doNum} />
        <RowField label="Invoice date" value={formatPurchaseDateLabel(asset.invoiceDate)} />
        <RowField label="Invoice number" value={asset.invoiceNum} />
      </div>
      <RowField label="Purchase cost" value={formatPurchaseCost(asset.purchaseCost)} emphasis />
    </div>
  );
}

function TrailEventLinks({ event, readOnly }: { event: AssetTrailEvent; readOnly?: boolean }) {
  if (readOnly || event.requestId == null) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
      {event.requestId != null && (
        <Link
          to="/technician/request-log"
          className="inline-flex items-center gap-1 text-xs text-[oklch(0.45_0.12_290)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Request #{event.requestId}
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function TrailsTable({ trails, readOnly }: { trails: AssetTrailEvent[]; readOnly?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-44 whitespace-nowrap">When</TableHead>
            <TableHead className="w-36">Category</TableHead>
            <TableHead className="w-32">Event</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trails.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                No trail events recorded yet.
              </TableCell>
            </TableRow>
          ) : (
            trails.map((ev, idx) => {
              const detail = [ev.detail, ev.actor ? `Attended by ${ev.actor}` : null]
                .filter(Boolean)
                .join(' · ');

              return (
                <TableRow key={`${ev.category}-${ev.title}-${ev.at}-${idx}`} className="hover:bg-transparent">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top">
                    {formatTrailWhen(ev.at)}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline" className="rounded-[6px] text-[10px] font-normal">
                      {ev.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium align-top">{ev.title}</TableCell>
                  <TableCell className="whitespace-normal text-sm text-foreground align-top">
                    <p className="break-words">{detail || '—'}</p>
                    <TrailEventLinks event={ev} readOnly={readOnly} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

type AssetViewContentProps = {
  kind: AssetKind;
  assetId: AssetId;
  readOnly?: boolean;
  canEditDetails?: boolean;
  backTo: string;
  backLabel?: string;
};

export function AssetViewContent({
  kind,
  assetId,
  readOnly = false,
  canEditDetails,
  backTo,
  backLabel = 'Back to list',
}: AssetViewContentProps) {
  const allowEdit = canEditDetails ?? !readOnly;
  const [data, setData] = useState<AssetDetailResponse | null>(null);
  const [deployment, setDeployment] = useState<OpenReturnContext | null>(null);
  const [warranty, setWarranty] = useState<WarrantyContext['warranty']>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<'details' | 'activity'>('details');

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [result, openDeployment, warrantyCtx] = await Promise.all([
        getAssetDetailFn({ data: { kind, assetId } }),
        getOpenReturnContextFn({ data: { kind, assetId } }),
        getWarrantyContextFn({ data: { kind, assetId } }).catch(() => null),
      ]);
      setData(result);
      setDeployment(openDeployment);
      setWarranty(warrantyCtx?.warranty ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load asset');
      setData(null);
      setDeployment(null);
      setWarranty(null);
    } finally {
      setLoading(false);
    }
  }, [kind, assetId]);

  useEffect(() => {
    setEditing(false);
    void load();
  }, [load]);

  const asset = data?.asset;
  const assetAge = asset ? formatAssetAge(asset.poDate, asset.createdAt) : null;
  const warrantyLeft = warranty
    ? formatWarrantyRemaining(warranty.startDate, warranty.endDate)
    : null;

  const handleStatusChange = async (_assetId: AssetId, statusId: number) => {
    const { updateAssetStatusFn } = await import('@backend/server/assets/assets.functions');
    await updateAssetStatusFn({ data: { kind, assetId, statusId } });
    await load();
  };

  const headerName = asset ? assetHeaderName(asset) : '—';
  const title = !asset || headerName === '—' ? (asset ? `Asset #${asset.assetId}` : '') : headerName;
  const purchaseLabel = asset ? formatPurchaseCost(asset.purchaseCost) : null;
  const poLabel = asset ? formatPurchaseDateLabel(asset.poDate) : null;

  return (
    <>
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading asset…</p>
      ) : !asset ? (
        <Card className="rounded-[22px]">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Asset not found.
          </CardContent>
        </Card>
      ) : (
        <div className="@container grid gap-3">
          <div className="grid items-stretch gap-3 @min-[640px]:grid-cols-[minmax(0,1fr)_14.5rem]">
            <section className={cn(bentoTile, 'relative overflow-hidden bg-lavender/[0.07] px-5 py-5 sm:px-6')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                    {ASSET_KIND_LABEL[kind]}
                  </span>
                  <AssetStatusBadge statusId={asset.statusId} />
                  {asset.category?.trim() ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-border/80 bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {asset.category.trim()}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {allowEdit && !editing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full border-amber-200 bg-amber-50 px-3 text-amber-900 hover:bg-amber-100"
                      onClick={() => {
                        setSection('details');
                        setEditing(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {readOnly ? null : (
                    <AssetStatusActions
                      kind={kind}
                      assetId={asset.assetId}
                      statusId={asset.statusId}
                      onStatusChange={handleStatusChange}
                    />
                  )}
                </div>
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">{title}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {headerName === '—' ? ASSET_KIND_LABEL[kind] : `Asset #${asset.assetId}`}
                {asset.supplier?.trim() ? ` · ${asset.supplier.trim()}` : ''}
              </p>
              {assetAge || warrantyLeft ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {assetAge ? <HeaderFact icon={Clock}>{assetAge}</HeaderFact> : null}
                  {warrantyLeft && warranty ? (
                    <HeaderFact icon={Shield} tone={warrantyTone(warranty.startDate, warranty.endDate)}>
                      {warrantyLeft}
                    </HeaderFact>
                  ) : null}
                </div>
              ) : null}
            </section>

            <aside className="relative overflow-hidden rounded-[22px] bg-secondary px-5 py-5 text-secondary-foreground">
              <Wallet
                className="pointer-events-none absolute -right-3 -bottom-4 h-24 w-24 text-foreground/[0.06]"
                strokeWidth={1.25}
                aria-hidden
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Purchase cost
              </p>
              <p className="mt-3 text-3xl font-bold tracking-tight">{purchaseLabel ?? '—'}</p>
              <p className="mt-2 text-sm text-muted-foreground">{poLabel ?? 'No purchase order'}</p>
            </aside>
          </div>

          {editing && allowEdit ? (
            <AssetDetailsForm
              asset={asset}
              deployment={deployment}
              onCancel={() => setEditing(false)}
              onSaved={async () => {
                await load({ silent: true });
                setEditing(false);
              }}
            />
          ) : (
            <>
              <div className="grid gap-3 @min-[560px]:grid-cols-3">
                <FactTile
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Account code"
                  value={formatAccCodeDisplay(asset.accCode)}
                />
                <FactTile
                  icon={<Barcode className="h-3.5 w-3.5" />}
                  label="Serial"
                  value={asset.serialNum}
                />
                <FactTile
                  icon={<DeploymentIcon deployment={deployment} />}
                  label={deploymentCardTitle(deployment)}
                  value={deploymentSummaryLabel(deployment)}
                />
              </div>

              <Tabs
                value={section}
                onValueChange={(v) => setSection(v as 'details' | 'activity')}
                className="w-full"
              >
                <TabsList className="mb-3 grid h-10 w-full grid-cols-2 rounded-full bg-muted p-1 sm:w-auto sm:inline-grid">
                  <TabsTrigger value="details" className="gap-1.5 rounded-full">
                    <Package className="h-3.5 w-3.5" />
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="gap-1.5 rounded-full">
                    <History className="h-3.5 w-3.5" />
                    Activity trail
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-0">
                  <div className="grid gap-3 @min-[640px]:grid-cols-2">
                    <section className={cn(bentoTile, 'px-5 py-5 sm:px-6')}>
                      <h2 className="text-lg font-semibold tracking-tight">Specifications</h2>
                      <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                        <AssetSpecs asset={asset} />
                        <DetailItem className="sm:col-span-2" label="Remarks" value={asset.remarks} />
                      </div>
                    </section>

                    <section className={cn(bentoTile, 'px-5 py-5 sm:px-6')}>
                      <h2 className="text-lg font-semibold tracking-tight">Procurement</h2>
                      <div className="mt-3">
                        <PurchaseBlock asset={asset} />
                      </div>
                    </section>

                    <section className={cn(bentoTile, 'px-5 py-5 sm:px-6 @min-[640px]:col-span-2')}>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lavender/30 text-[oklch(0.4_0.12_290)]">
                          <DeploymentIcon deployment={deployment} />
                        </span>
                        <div>
                          <h2 className="text-lg font-semibold tracking-tight">{deploymentCardTitle(deployment)}</h2>
                          <p className="text-sm text-muted-foreground">{deploymentSummaryLabel(deployment)}</p>
                        </div>
                      </div>
                      <div className="mt-5">
                        <DeploymentDetails deployment={deployment} />
                      </div>
                    </section>
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-0">
                  <section className={cn(bentoTile, 'px-5 py-5 sm:px-6')}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                          <History className="h-4 w-4" />
                          Activity trail
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Handovers, deployments, and borrow requests
                        </p>
                      </div>
                      {!readOnly ? (
                        <Button variant="outline" size="sm" className="shrink-0 rounded-full" asChild>
                          <Link to="/technician/history">
                            Full history
                            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-4">
                      <TrailsTable trails={data.trails} readOnly={readOnly} />
                    </div>
                  </section>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      )}
    </>
  );
}

type TechnicianAssetViewPageProps = {
  kind: AssetKind;
  assetId: AssetId;
};

export function TechnicianAssetViewPage({ kind, assetId }: TechnicianAssetViewPageProps) {
  const listPath = ASSET_LIST_PATH[kind];

  return (
    <TechnicianShell>
      <AssetViewContent kind={kind} assetId={assetId} backTo={listPath} />
    </TechnicianShell>
  );
}

