import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  ExternalLink,
  History,
  MapPin,
  Package,
  Pencil,
  Shield,
  Truck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim() ? value : '—';
  return (
    <div className="rounded-[10px] border border-border/80 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground break-words">{text}</p>
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Handover date" value={formatDateLabel(r.handoverDate)} />
          <DetailItem label="Employee number" value={r.employeeNo} />
          <DetailItem label="Name" value={r.recipientName} />
          <DetailItem label="Faculty" value={r.department} />
          <DetailItem label="Remarks" value={r.handoverRemarks} />
        </div>
      );
    }

    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
    <>
      <DetailItem label="PO date" value={formatPurchaseDateLabel(asset.poDate)} />
      <DetailItem label="PO number" value={asset.poNum} />
      <DetailItem label="DO date" value={formatPurchaseDateLabel(asset.doDate)} />
      <DetailItem label="DO number" value={asset.doNum} />
      <DetailItem label="Invoice date" value={formatPurchaseDateLabel(asset.invoiceDate)} />
      <DetailItem label="Invoice number" value={asset.invoiceNum} />
      <DetailItem label="Purchase cost" value={formatPurchaseCost(asset.purchaseCost)} />
    </>
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
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8" />
            <TableHead className="w-44 whitespace-nowrap">When</TableHead>
            <TableHead className="w-36">Category</TableHead>
            <TableHead className="w-32">Event</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trails.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No trail events recorded yet.
              </TableCell>
            </TableRow>
          ) : (
            trails.map((ev, idx) => {
              const isOpen = openIndex === idx;
              const hasLink = ev.requestId != null;

              return (
                <Fragment key={`${ev.category}-${ev.title}-${ev.at}-${idx}`}>
                  <TableRow
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      isOpen && 'bg-muted/30',
                    )}
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                  >
                    <TableCell className="py-2 pr-0">
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTrailWhen(ev.at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-[6px] text-[10px] font-normal">
                        {ev.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{ev.title}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground sm:max-w-none">
                      {[ev.detail, ev.actor ? `Attended by ${ev.actor}` : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                      {hasLink && !isOpen && (
                        <span className="ml-2 text-xs text-[oklch(0.45_0.12_290)]">View</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="bg-muted/20 px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {ev.category} · {ev.title}
                          </p>
                          <p className="text-sm text-foreground">{ev.detail ?? 'No additional details.'}</p>
                          {ev.actor ? (
                            <p className="text-sm text-muted-foreground">Attended by {ev.actor}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">{formatTrailWhen(ev.at)}</p>
                          <TrailEventLinks event={ev} readOnly={readOnly} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
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

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="rounded-[8px]" asChild>
          <Link to={backTo}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading asset…</p>
      ) : !asset ? (
        <Card className="rounded-[14px]">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Asset not found.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {ASSET_KIND_LABEL[kind]}
                </p>
                {asset.category?.trim() ? (
                  <Badge
                    variant="outline"
                    className="rounded-[6px] px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                  >
                    {asset.category.trim()}
                  </Badge>
                ) : null}
              </div>
              <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                Asset <code className="text-lg">#{asset.assetId}</code>
              </h1>
              <p className="mt-1 text-sm font-medium text-foreground">{assetHeaderName(asset)}</p>
              {assetAge || warrantyLeft ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {assetAge ? (
                    <HeaderFact icon={Clock}>{assetAge}</HeaderFact>
                  ) : null}
                  {warrantyLeft && warranty ? (
                    <HeaderFact icon={Shield} tone={warrantyTone(warranty.startDate, warranty.endDate)}>
                      {warrantyLeft}
                    </HeaderFact>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {allowEdit && !editing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-[8px]"
                  onClick={() => {
                    setSection('details');
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit details
                </Button>
              ) : null}
              {readOnly ? (
                <AssetStatusBadge statusId={asset.statusId} />
              ) : (
                <AssetStatusActions
                  kind={kind}
                  assetId={asset.assetId}
                  statusId={asset.statusId}
                  onStatusChange={handleStatusChange}
                />
              )}
            </div>
          </div>

          <Tabs
            value={section}
            onValueChange={(v) => setSection(v as 'details' | 'activity')}
            className="w-full"
          >
            <TabsList className="mb-6 grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
              <TabsTrigger value="details" className="gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Details
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                <History className="h-3.5 w-3.5" />
                Activity trail
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-0">
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
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="rounded-[14px]">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Specifications</CardTitle>
                      <CardDescription>Core fields from the inventory record</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:grid-cols-2">
                      <AssetSpecs asset={asset} />
                      <DetailItem label="Remarks" value={asset.remarks} />
                    </CardContent>
                  </Card>

                  <Card className="rounded-[14px]">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Procurement</CardTitle>
                      <CardDescription>PO, delivery, and invoice details</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:grid-cols-2">
                      <PurchaseBlock asset={asset} />
                    </CardContent>
                  </Card>

                  <Card className="rounded-[14px] lg:col-span-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <DeploymentIcon deployment={deployment} />
                        {deploymentCardTitle(deployment)}
                      </CardTitle>
                      <CardDescription>{deploymentSummaryLabel(deployment)}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DeploymentDetails deployment={deployment} />
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <Card className="rounded-[14px]">
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                  <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="h-4 w-4" />
                      Activity trail
                    </CardTitle>
                    <CardDescription>
                      Handovers, deployments, borrow requests, repairs, and warranty events
                    </CardDescription>
                  </div>
                  {!readOnly ? (
                    <Button variant="outline" size="sm" className="shrink-0 rounded-[8px]" asChild>
                      <Link to="/technician/history">
                        Full history
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Click a row to view full event details.
                  </p>
                  <TrailsTable trails={data.trails} readOnly={readOnly} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
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

