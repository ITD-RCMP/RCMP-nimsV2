import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, FileDown, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { readTechnicianSession } from '@shared/lib/auth-session';
import { normalizeToIsoDate } from '@shared/lib/date-format';
import type { DeployReturnSearch } from '@shared/lib/deploy-return-schema';
import type { StaffRecipient } from '@shared/lib/deploy-return-schema';
import { missingStaffDirectoryFields, staffDirectoryIncompleteMessage } from '@shared/lib/deploy-return-schema';
import { parseAssetIdParam, parseAssetKindParam, sameAssetId } from '@shared/lib/inventory-schema';
import { ASSET_KIND_LABEL, ASSET_LIST_PATH, useAssets } from '@/hooks/assets';
import {
  deployLaptopPlaceFn,
  deployLaptopStaffFn,
  deployPlaceFn,
} from '@backend/server/requests/deploy-return.functions';
import { generateHandoverPdfFn } from '@backend/server/pdf/handover-pdf.functions';
import {
  getHandoverEmailStatusFn,
  queueHandoverEmailFn,
  sendHandoverEmailFn,
} from '@backend/server/email/handover-email.functions';
import { TechnicianShell } from '@/technician/technician-shell';
import { DatePickerField, CampusBuildingSelect, FormField } from '@/technician/deploy-return-fields';
import { StaffRecipientSearch } from '@/technician/staff-recipient-search';
import { isLeasingCategory } from '@/hooks/assetid-generator';

type LaptopDeployMode = 'staff' | 'place';

function parseSearch(search: Record<string, unknown>): DeployReturnSearch | null {
  const kind = parseAssetKindParam(search.kind);
  const assetId = parseAssetIdParam(search.assetId);
  if (!kind || !assetId) return null;
  return { kind, assetId };
}

export function TechnicianDeployPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const params = parseSearch(search);

  const laptop = useAssets('laptop');
  const av = useAssets('av');
  const network = useAssets('network');

  const asset = useMemo(() => {
    if (!params) return null;
    const items =
      params.kind === 'laptop' ? laptop.items : params.kind === 'av' ? av.items : network.items;
    return items.find((i) => sameAssetId(i.assetId, params.assetId)) ?? null;
  }, [params, laptop.items, av.items, network.items]);

  const [laptopMode, setLaptopMode] = useState<LaptopDeployMode>('staff');
  const [recipient, setRecipient] = useState<StaffRecipient | null>(null);
  const [handoverDate, setHandoverDate] = useState('');
  const [handoverRemarks, setHandoverRemarks] = useState('');
  const [building, setBuilding] = useState('');
  const [level, setLevel] = useState('');
  const [zone, setZone] = useState('');
  const [handler, setHandler] = useState('');
  const [deploymentDate, setDeploymentDate] = useState('');
  const [deploymentRemarks, setDeploymentRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastHandoverId, setLastHandoverId] = useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  if (!params) {
    return (
      <TechnicianShell>
        <p className="text-sm text-destructive">Invalid deploy link. Open deploy from an asset listing.</p>
        <Button variant="outline" className="mt-4 rounded-[8px]" asChild>
          <Link to="/technician/dashboard">Back to dashboard</Link>
        </Button>
      </TechnicianShell>
    );
  }

  const { kind, assetId } = params;
  const session = readTechnicianSession();
  const isLeasingAsset = isLeasingCategory(asset?.category);

  const handleSendHandoverEmail = async (handoverId: number) => {
    setEmailLoading(true);
    try {
      const result = await sendHandoverEmailFn({ data: handoverId });
      setEmailSent(true);
      toast.success(`Handover email sent to ${result.to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send handover email');
    } finally {
      setEmailLoading(false);
    }
  };

  const pollHandoverEmailStatus = async (handoverId: number) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const status = await getHandoverEmailStatusFn({ data: handoverId });
        if (!status || status.status === 'pending' || status.status === 'sending') continue;
        if (status.status === 'sent') {
          setEmailSent(true);
          toast.success('Handover email sent to the staff recipient');
        } else {
          toast.error(
            status.error ?? 'Could not send handover email automatically. Use the button below to retry.',
          );
        }
        return;
      } catch {
        return;
      }
    }
  };

  /** Queues the email in the background so the technician isn't blocked waiting for PDF generation + SMTP. */
  const handleQueueHandoverEmail = async (handoverId: number) => {
    try {
      await queueHandoverEmailFn({ data: handoverId });
      toast('Handover recorded. Sending confirmation email in the background…');
      void pollHandoverEmailStatus(handoverId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not queue handover email');
    }
  };

  const handleDownloadHandoverPdf = async () => {
    if (lastHandoverId == null) return;
    setPdfLoading(true);
    try {
      const { base64, filename } = await generateHandoverPdfFn({ data: lastHandoverId });
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
      toast.success('Handover form downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate PDF');
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

    setSaving(true);
    try {
      if (kind === 'laptop') {
        const isoDate = normalizeToIsoDate(handoverDate);
        if (!isoDate) {
          toast.error('Select a handover date');
          setSaving(false);
          return;
        }
        if (laptopMode === 'staff') {
          if (!recipient) {
            toast.error('Select a staff recipient');
            setSaving(false);
            return;
          }
          const missingStaff = missingStaffDirectoryFields({
            fullName: recipient.fullName,
            email: recipient.email,
            faculty: recipient.department,
          });
          if (missingStaff.length) {
            toast.error(staffDirectoryIncompleteMessage(missingStaff));
            setSaving(false);
            return;
          }
          const result = await deployLaptopStaffFn({
            data: {
              assetId,
              staffId: session.staffId,
              employeeNo: recipient.employeeNo,
              handoverDate: isoDate,
              handoverRemarks: handoverRemarks.trim() || null,
              handledByName: session.fullName,
            },
          });
          setLastHandoverId(result.handoverId);
          toast.success('Asset deployed');
          setSaving(false);
          void handleQueueHandoverEmail(result.handoverId);
          return;
        } else {
          if (!building.trim()) {
            toast.error('Building is required');
            setSaving(false);
            return;
          }
          if (!handler.trim()) {
            toast.error('Handler is required');
            setSaving(false);
            return;
          }
          await deployLaptopPlaceFn({
            data: {
              assetId,
              staffId: session.staffId,
              building: building.trim(),
              level: level.trim() || null,
              zone: zone.trim() || null,
              handler: handler.trim(),
              handoverDate: isoDate,
              handoverRemarks: handoverRemarks.trim() || null,
              handledByName: session.fullName,
            },
          });
        }
      } else {
        const isoDate = normalizeToIsoDate(deploymentDate);
        if (!isoDate) {
          toast.error('Select a deployment date');
          setSaving(false);
          return;
        }
        if (!building.trim() || !level.trim() || !zone.trim()) {
          toast.error('Building, level, and zone are required');
          setSaving(false);
          return;
        }
        await deployPlaceFn({
          data: {
            kind,
            assetId,
            staffId: session.staffId,
            building: building.trim(),
            level: level.trim(),
            zone: zone.trim(),
            deploymentDate: isoDate,
            deploymentRemarks: deploymentRemarks.trim() || null,
          },
        });
      }
      if (!(kind === 'laptop' && laptopMode === 'staff')) {
        toast.success('Asset deployed');
        void navigate({ to: ASSET_LIST_PATH[kind] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deploy failed');
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
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Deploy asset</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          {ASSET_KIND_LABEL[kind]} · Asset ID <code className="text-[11px]">{assetId}</code>
          {asset?.model ? ` · ${asset.model}` : ''}
        </p>
      </div>

      <Card className="rounded-[14px] border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Deployment details</CardTitle>
          <CardDescription>
            {kind === 'laptop'
              ? 'Handover to staff or deploy to a place.'
              : 'Record location deployment.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {kind === 'laptop' ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={laptopMode === 'staff' ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-[8px]"
                    onClick={() => setLaptopMode('staff')}
                  >
                    Handover to staff
                  </Button>
                  <Button
                    type="button"
                    variant={laptopMode === 'place' ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-[8px]"
                    onClick={() => setLaptopMode('place')}
                  >
                    Deploy to place
                  </Button>
                </div>

                {laptopMode === 'staff' && (
                  <FormField label="Recipient (staff directory)" required>
                    <StaffRecipientSearch value={recipient} onSelect={setRecipient} />
                  </FormField>
                )}

                {laptopMode === 'place' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Building" required>
                      <CampusBuildingSelect value={building} onChange={setBuilding} />
                    </FormField>
                    <FormField label="Level">
                      <Input value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-[8px]" />
                    </FormField>
                    <FormField label="Zone">
                      <Input value={zone} onChange={(e) => setZone(e.target.value)} className="rounded-[8px]" />
                    </FormField>
                    <FormField label="Handler" required>
                      <Input
                        value={handler}
                        onChange={(e) => setHandler(e.target.value)}
                        placeholder="On-site contact name"
                        required
                        className="rounded-[8px]"
                      />
                    </FormField>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <DatePickerField
                    label="Handover date"
                    value={handoverDate}
                    onChange={setHandoverDate}
                    required
                  />
                  <FormField label="Handover remarks">
                    <Textarea
                      value={handoverRemarks}
                      onChange={(e) => setHandoverRemarks(e.target.value)}
                      placeholder={
                        laptopMode === 'place'
                          ? 'Location / room / site details'
                          : 'Optional notes'
                      }
                      className="min-h-[80px] rounded-[8px]"
                    />
                  </FormField>
                </div>
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Building" required>
                  {kind === 'network' ? (
                    <Input
                      value={building}
                      onChange={(e) => setBuilding(e.target.value)}
                      placeholder="Building name"
                      required
                      className="rounded-[8px]"
                    />
                  ) : (
                    <CampusBuildingSelect value={building} onChange={setBuilding} />
                  )}
                </FormField>
                <FormField label="Level" required>
                  <Input value={level} onChange={(e) => setLevel(e.target.value)} required className="rounded-[8px]" />
                </FormField>
                <FormField label="Zone" required>
                  <Input value={zone} onChange={(e) => setZone(e.target.value)} required className="rounded-[8px]" />
                </FormField>
                <DatePickerField
                  label="Deployment date"
                  value={deploymentDate}
                  onChange={setDeploymentDate}
                  required
                />
                <FormField label="Deployment remarks" >
                  <Textarea
                    value={deploymentRemarks}
                    onChange={(e) => setDeploymentRemarks(e.target.value)}
                    className="min-h-[80px] rounded-[8px] sm:col-span-2"
                  />
                </FormField>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="rounded-[8px]" asChild>
                <Link to={ASSET_LIST_PATH[kind]}>Cancel</Link>
              </Button>
              <Button
                type="submit"
                className="rounded-[8px] bg-foreground text-background hover:opacity-90"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Confirm deploy'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {lastHandoverId != null && (
        <Card className="mt-4 rounded-[14px] border-emerald-500/30 bg-emerald-50/50 shadow-sm dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isLeasingAsset ? 'Handover notification' : 'Handover form (3 pages)'}
            </CardTitle>
            <CardDescription>
              {isLeasingAsset
                ? `An email is sent automatically to the staff recipient. Leasing handover does not include a PDF.${emailSent ? ' Sent successfully.' : ' Use the button below if it did not send.'}`
                : `Software compliance, equipment handover, and liability acknowledgment. An email with the handover PDF is sent automatically to the staff recipient.${emailSent ? ' Sent successfully.' : ' Use the buttons below if it did not send.'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="default"
              className="rounded-[8px] gap-2 bg-foreground text-background hover:opacity-90"
              disabled={emailLoading}
              onClick={() => void handleSendHandoverEmail(lastHandoverId)}
            >
              {emailLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {emailSent ? 'Resend handover email' : 'Send handover email'}
            </Button>
            {!isLeasingAsset && (
              <Button
                type="button"
                variant="outline"
                className="rounded-[8px] gap-2"
                disabled={pdfLoading}
                onClick={() => void handleDownloadHandoverPdf()}
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
