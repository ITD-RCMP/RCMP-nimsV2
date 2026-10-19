import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, FileDown, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { readTechnicianSession } from '@shared/lib/auth-session';
import { formatDateLabel, normalizeToIsoDate } from '@shared/lib/date-format';
import type { OpenReturnContext } from '@shared/lib/deploy-return-schema';
import { missingStaffDirectoryFields, staffDirectoryIncompleteMessage } from '@shared/lib/deploy-return-schema';
import { sameAssetId } from '@shared/lib/inventory-schema';
import { ASSET_KIND_LABEL, ASSET_LIST_PATH, useAssets } from '@/hooks/assets';
import { Route } from '@/routes/technician/return';
import {
  getOpenReturnContextFn,
  returnLaptopPlaceFn,
  returnLaptopStaffFn,
  returnPlaceFn,
} from '@backend/server/requests/deploy-return.functions';
import { generateReturnPdfFn } from '@backend/server/pdf/return-pdf.functions';
import {
  getReturnEmailStatusFn,
  queueReturnEmailFn,
  sendReturnEmailFn,
} from '@backend/server/email/return-email.functions';
import { TechnicianShell } from '@/technician/technician-shell';
import { ReturnDetailsFields } from '@/technician/deploy-return-fields';
import { STATUS_ID } from '@shared/lib/asset-status-actions';
import { isLeasingCategory } from '@/hooks/assetid-generator';

function DeploymentSummary({ ctx }: { ctx: OpenReturnContext }) {
  if (ctx.kind === 'laptop') {
    const r = ctx.record;
    if (r.type === 'staff') {
      return (
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Staff handover</span> — {r.recipientName} (
            {r.employeeNo})
          </li>
          <li>Handover date: {formatDateLabel(r.handoverDate)}</li>
          {r.department && <li>Faculty: {r.department}</li>}
          {r.email && <li>Email: {r.email}</li>}
          {r.handoverRemarks && <li>Remarks: {r.handoverRemarks}</li>}
        </ul>
      );
    }
    return (
      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Place deployment</span>
        </li>
        {(r.building || r.level || r.zone) && (
          <li>
            {[r.building, r.level && `Level ${r.level}`, r.zone && `Zone ${r.zone}`]
              .filter(Boolean)
              .join(' · ')}
          </li>
        )}
        {r.handler && <li>Handler: {r.handler}</li>}
        <li>Handover date: {formatDateLabel(r.handoverDate)}</li>
        {r.handoverRemarks && <li>Remarks: {r.handoverRemarks}</li>}
      </ul>
    );
  }

  const r = ctx.record;
  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      <li>
        {r.building} · Level {r.level} · Zone {r.zone}
      </li>
      <li>Deployed: {formatDateLabel(r.deploymentDate)}</li>
      {r.deploymentRemarks && <li>Remarks: {r.deploymentRemarks}</li>}
    </ul>
  );
}

export function TechnicianReturnPage() {
  const navigate = useNavigate();
  const { kind, assetId } = Route.useSearch();

  const laptop = useAssets('laptop');
  const av = useAssets('av');
  const network = useAssets('network');

  const [openCtx, setOpenCtx] = useState<OpenReturnContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [returnPlace, setReturnPlace] = useState('');
  const [condition, setCondition] = useState('Good');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastReturnId, setLastReturnId] = useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const asset = useMemo(() => {
    if (!kind || !assetId) return null;
    const items = kind === 'laptop' ? laptop.items : kind === 'av' ? av.items : network.items;
    return items.find((i) => sameAssetId(i.assetId, assetId)) ?? null;
  }, [kind, assetId, laptop.items, av.items, network.items]);

  const statusIsDeployed = asset?.statusId === STATUS_ID.DEPLOY;

  useEffect(() => {
    if (!kind || !assetId) {
      setLoadingCtx(false);
      setOpenCtx(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadingCtx(true);
    setLoadError(null);

    void getOpenReturnContextFn({ data: { kind, assetId } })
      .then((ctx) => {
        if (!cancelled) setOpenCtx(ctx);
      })
      .catch((e) => {
        if (!cancelled) {
          setOpenCtx(null);
          setLoadError(e instanceof Error ? e.message : 'Failed to load deployment');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCtx(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, assetId]);

  if (!kind || !assetId) {
    return (
      <TechnicianShell>
        <p className="text-sm text-destructive">Invalid return link. Open return from an asset listing.</p>
        <Button variant="outline" className="mt-4 rounded-[8px]" asChild>
          <Link to="/technician/dashboard">Back to dashboard</Link>
        </Button>
      </TechnicianShell>
    );
  }

  const session = readTechnicianSession();

  const isStaffLaptopReturn =
    openCtx?.kind === 'laptop' && openCtx.record.type === 'staff';
  const isLeasingAsset = isLeasingCategory(asset?.category);
  const staffReturnMissing =
    openCtx?.kind === 'laptop' && openCtx.record.type === 'staff'
      ? missingStaffDirectoryFields({
          fullName: openCtx.record.recipientName,
          email: openCtx.record.email,
          faculty: openCtx.record.department,
        })
      : [];

  const handleSendReturnEmail = async (returnId?: number) => {
    const id = returnId ?? lastReturnId;
    if (id == null) return;
    setEmailLoading(true);
    try {
      const result = await sendReturnEmailFn({ data: id });
      setEmailSent(true);
      toast.success(`Return email sent to ${result.to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send return email');
    } finally {
      setEmailLoading(false);
    }
  };

  const pollReturnEmailStatus = async (returnId: number) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const status = await getReturnEmailStatusFn({ data: returnId });
        if (!status || status.status === 'pending' || status.status === 'sending') continue;
        if (status.status === 'sent') {
          setEmailSent(true);
          toast.success('Return email sent to the staff recipient');
        } else {
          toast.error(
            status.error ?? 'Could not send return email automatically. Use the button below to retry.',
          );
        }
        return;
      } catch {
        return;
      }
    }
  };

  /** Queues the email in the background so the technician isn't blocked waiting for PDF generation + SMTP. */
  const handleQueueReturnEmail = async (returnId: number) => {
    try {
      await queueReturnEmailFn({ data: returnId });
      toast('Return recorded. Sending confirmation email in the background…');
      void pollReturnEmailStatus(returnId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not queue return email');
    }
  };

  const handleDownloadReturnPdf = async () => {
    if (lastReturnId == null) return;
    setPdfLoading(true);
    try {
      const { base64, filename } = await generateReturnPdfFn({ data: lastReturnId });
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Return form downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate return PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return;
    }
    if (!openCtx) {
      toast.error('No open deployment to return');
      return;
    }

    const isoDate = normalizeToIsoDate(returnDate);
    if (!isoDate) {
      toast.error('Select a return date');
      return;
    }
    if (!condition) {
      toast.error('Select equipment condition');
      return;
    }

    setSaving(true);
    try {
      let returnId: number | undefined;
      if (openCtx.kind === 'laptop') {
        const r = openCtx.record;
        if (r.type === 'staff') {
          if (staffReturnMissing.length) {
            toast.error(staffDirectoryIncompleteMessage(staffReturnMissing));
            setSaving(false);
            return;
          }
          const result = await returnLaptopStaffFn({
            data: {
              handoverStaffId: r.handoverStaffId,
              returnedBy: session.staffId,
              returnDate: isoDate,
              returnTime: returnTime || null,
              returnPlace: returnPlace.trim() || null,
              condition,
              returnRemarks: returnRemarks.trim() || null,
              returnedByName: session.fullName,
            },
          });
          returnId = result.returnId;
        } else {
          const result = await returnLaptopPlaceFn({
            data: {
              handoverId: r.handoverId,
              returnedBy: session.staffId,
              returnDate: isoDate,
              returnTime: returnTime || null,
              returnPlace: returnPlace.trim() || null,
              condition,
              returnRemarks: returnRemarks.trim() || null,
              returnedByName: session.fullName,
            },
          });
          returnId = result.returnId;
        }
      } else {
        await returnPlaceFn({
          data: {
            kind: openCtx.kind,
            deploymentId: openCtx.record.deploymentId,
            returnedBy: session.staffId,
            returnDate: isoDate,
            returnTime: returnTime || null,
            returnPlace: returnPlace.trim() || null,
            condition,
            returnRemarks: returnRemarks.trim() || null,
          },
        });
      }
      if (returnId != null) {
        setLastReturnId(returnId);
        toast.success('Asset returned');
        setSaving(false);
        if (openCtx.kind === 'laptop' && openCtx.record.type === 'staff') {
          void handleQueueReturnEmail(returnId);
        }
        return;
      }
      toast.success('Asset returned');
      void navigate({ to: ASSET_LIST_PATH[kind] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Return failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TechnicianShell>
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5" asChild>
          <Link to={ASSET_LIST_PATH[kind]}>
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Link>
        </Button>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Return asset</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          {ASSET_KIND_LABEL[kind]} · Asset ID <code className="text-[11px]">{assetId}</code>
          {asset?.model ? ` · ${asset.model}` : ''}
        </p>
      </div>

      <Card className="mb-4 rounded-[14px] border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Current deployment</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCtx ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading deployment record…
            </p>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : openCtx ? (
            <div className="space-y-2">
              <DeploymentSummary ctx={openCtx} />
              {staffReturnMissing.length > 0 && (
                <p className="text-sm text-destructive">{staffDirectoryIncompleteMessage(staffReturnMissing)}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-destructive">
              <p>No open deployment record found for this asset.</p>
              {statusIsDeployed && (
                <p className="text-muted-foreground">
                  Status is &quot;deploy&quot; but there is no row in{' '}
                  {kind === 'laptop' ? 'handover' : 'it_deploy'}.
                  Use the Deploy form first, or fix status if it was changed manually.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[14px] border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Return details</CardTitle>
          <CardDescription>
            Please fill in the return details below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ReturnDetailsFields
                returnDate={returnDate}
                setReturnDate={setReturnDate}
                returnTime={returnTime}
                setReturnTime={setReturnTime}
                returnPlace={returnPlace}
                setReturnPlace={setReturnPlace}
                condition={condition}
                setCondition={setCondition}
                returnRemarks={returnRemarks}
                setReturnRemarks={setReturnRemarks}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="rounded-[8px]" asChild>
                <Link to={ASSET_LIST_PATH[kind]}>Cancel</Link>
              </Button>
              <Button
                type="submit"
                className="rounded-[8px] bg-foreground text-background hover:opacity-90"
                disabled={saving || !openCtx || loadingCtx || staffReturnMissing.length > 0}
              >
                {saving ? 'Saving…' : 'Confirm return'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {lastReturnId != null && (isStaffLaptopReturn || !isLeasingAsset) && (
        <Card className="mt-4 rounded-[14px] border-emerald-500/30 bg-emerald-50/50 shadow-sm dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isLeasingAsset ? 'Return notification' : 'Return form'}</CardTitle>
            <CardDescription>
              {isStaffLaptopReturn
                ? isLeasingAsset
                  ? `An email is sent automatically to the staff recipient. Leasing return does not include a PDF.${emailSent ? ' Sent successfully.' : ' Use the button below if it did not send.'}`
                  : `An email with the return PDF is sent automatically to the staff recipient.${emailSent ? ' Sent successfully.' : ' Use the buttons below if it did not send.'}`
                : isLeasingAsset
                  ? 'Leasing return does not include a PDF.'
                  : 'Return form PDF is available below.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {isStaffLaptopReturn && (
              <Button
                type="button"
                variant="default"
                className="rounded-[8px] gap-2 bg-foreground text-background hover:opacity-90"
                disabled={emailLoading}
                onClick={() => void handleSendReturnEmail()}
              >
                {emailLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {emailSent ? 'Resend return email' : 'Send return email'}
              </Button>
            )}
            {!isLeasingAsset && (
              <Button
                type="button"
                variant="outline"
                className="rounded-[8px] gap-2"
                disabled={pdfLoading}
                onClick={() => void handleDownloadReturnPdf()}
              >
                {pdfLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Download PDF
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </TechnicianShell>
  );
}
