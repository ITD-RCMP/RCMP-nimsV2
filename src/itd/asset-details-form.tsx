import { useEffect, useMemo, useState } from 'react';
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
import {
  ACC_CODE_OPTIONS,
  type AssetDetail,
  type UpdateAssetInput,
} from '@shared/lib/inventory-schema';
import {
  purchaseFieldsToFormState,
  purchaseFormToInput,
  type PurchaseFormState,
} from '@shared/lib/purchase-field-utils';
import { canonicalizeLaptopCategory } from '@/hooks/assetid-generator';
import { PurchaseFieldsSection } from '@/technician/asset-purchase-fields';
import { LaptopCategoryFields } from '@/technician/laptop-category-fields';
import {
  AssetDeploymentEditFields,
  buildDeploymentUpdateInput,
  deploymentToEditState,
  validateDeploymentEdit,
  type DeploymentEditState,
} from '@/technician/asset-deployment-fields';
import { updateAssetFn } from '@backend/server/assets/assets.functions';
import { updateOpenDeploymentFn } from '@backend/server/requests/deploy-return.functions';
import type { OpenReturnContext } from '@shared/lib/deploy-return-schema';

type AssetDetailsFormState = {
  accCode: string;
  category: string;
  serialNum: string;
  brand: string;
  model: string;
  supplier: string;
  remarks: string;
  partNumber: string;
  processor: string;
  memory: string;
  os: string;
  storage: string;
  gpu: string;
  assetIdOld: string;
  macAddress: string;
  ipAddress: string;
  purchase: PurchaseFormState;
};

function assetToFormState(asset: AssetDetail): AssetDetailsFormState {
  return {
    accCode: asset.accCode ?? '',
    category: asset.category ?? '',
    serialNum: asset.serialNum ?? '',
    brand: asset.brand ?? '',
    model: asset.model ?? '',
    supplier: asset.supplier ?? '',
    remarks: asset.remarks ?? '',
    partNumber: asset.kind === 'laptop' ? (asset.partNumber ?? '') : '',
    processor: asset.kind === 'laptop' ? (asset.processor ?? '') : '',
    memory: asset.kind === 'laptop' ? (asset.memory ?? '') : '',
    os: asset.kind === 'laptop' ? (asset.os ?? '') : '',
    storage: asset.kind === 'laptop' ? (asset.storage ?? '') : '',
    gpu: asset.kind === 'laptop' ? (asset.gpu ?? '') : '',
    assetIdOld: asset.kind === 'av' ? (asset.assetIdOld ?? '') : '',
    macAddress: asset.kind === 'network' ? (asset.macAddress ?? '') : '',
    ipAddress: asset.kind === 'network' ? (asset.ipAddress ?? '') : '',
    purchase: purchaseFieldsToFormState(asset),
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className ?? 'space-y-2'}>
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function buildUpdateInput(asset: AssetDetail, form: AssetDetailsFormState): UpdateAssetInput {
  const purchase = purchaseFormToInput(form.purchase);
  const shared = {
    assetId: asset.assetId,
    accCode: blankToNull(form.accCode),
    brand: blankToNull(form.brand),
    model: blankToNull(form.model),
    supplier: blankToNull(form.supplier),
    remarks: blankToNull(form.remarks),
    ...purchase,
  };

  if (asset.kind === 'laptop') {
    return {
      kind: 'laptop',
      ...shared,
      serialNum: form.serialNum.trim(),
      category: canonicalizeLaptopCategory(form.category),
      partNumber: blankToNull(form.partNumber),
      processor: blankToNull(form.processor),
      memory: blankToNull(form.memory),
      os: blankToNull(form.os),
      storage: blankToNull(form.storage),
      gpu: blankToNull(form.gpu),
    };
  }

  if (asset.kind === 'av') {
    return {
      kind: 'av',
      ...shared,
      assetIdOld: blankToNull(form.assetIdOld),
      category: blankToNull(form.category),
      serialNum: blankToNull(form.serialNum),
    };
  }

  return {
    kind: 'network',
    ...shared,
    category: blankToNull(form.category),
    serialNum: blankToNull(form.serialNum),
    macAddress: blankToNull(form.macAddress),
    ipAddress: blankToNull(form.ipAddress),
  };
}

export function AssetDetailsForm({
  asset,
  deployment,
  onCancel,
  onSaved,
}: {
  asset: AssetDetail;
  deployment: OpenReturnContext | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const initial = useMemo(() => assetToFormState(asset), [asset]);
  const initialDeployment = useMemo(
    () => (deployment ? deploymentToEditState(deployment) : null),
    [deployment],
  );
  const [form, setForm] = useState(initial);
  const [deploymentForm, setDeploymentForm] = useState<DeploymentEditState | null>(initialDeployment);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  useEffect(() => {
    setDeploymentForm(initialDeployment);
  }, [initialDeployment]);

  const patch = (next: Partial<AssetDetailsFormState>) => {
    setForm((current) => ({ ...current, ...next }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (asset.kind === 'laptop' && !form.serialNum.trim()) {
      toast.error('Serial number is required.');
      return;
    }
    if (asset.kind === 'laptop' && !canonicalizeLaptopCategory(form.category)) {
      toast.error('Enter a category name.');
      return;
    }
    const cost = form.purchase.purchaseCost.trim();
    if (cost && (!Number.isFinite(Number(cost)) || Number(cost) < 0)) {
      toast.error('Purchase cost must be a valid amount of 0 or more.');
      return;
    }
    if (deployment && deploymentForm) {
      const deploymentError = validateDeploymentEdit(deployment, deploymentForm);
      if (deploymentError) {
        toast.error(deploymentError);
        return;
      }
    }

    setSaving(true);
    try {
      await updateAssetFn({ data: buildUpdateInput(asset, form) });
      if (deployment && deploymentForm) {
        await updateOpenDeploymentFn({
          data: buildDeploymentUpdateInput(asset.assetId, deployment, deploymentForm),
        });
      }
      toast.success('Asset details saved');
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The asset could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const accCodeOptions = ACC_CODE_OPTIONS.some((opt) => opt.value === form.accCode)
    ? ACC_CODE_OPTIONS
    : form.accCode
      ? [{ value: form.accCode, label: form.accCode }, ...ACC_CODE_OPTIONS]
      : ACC_CODE_OPTIONS;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-[14px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Specifications</CardTitle>
            <CardDescription>Core fields from the inventory record</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Account code">
              <Select
                value={form.accCode || undefined}
                onValueChange={(value) => patch({ accCode: value })}
              >
                <SelectTrigger className="rounded-[8px]">
                  <SelectValue placeholder="Select account code" />
                </SelectTrigger>
                <SelectContent>
                  {accCodeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.value} ({opt.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {asset.kind === 'laptop' ? (
              <LaptopCategoryFields
                category={form.category}
                onCategoryChange={(category) => patch({ category })}
              />
            ) : (
              <Field label="Category">
                <Input
                  value={form.category}
                  onChange={(e) => patch({ category: e.target.value })}
                  className="rounded-[8px]"
                  placeholder={asset.kind === 'av' ? 'display, projector…' : 'switch, router, AP…'}
                />
              </Field>
            )}
            {asset.kind === 'av' ? (
              <Field label="Legacy ID">
                <Input
                  value={form.assetIdOld}
                  onChange={(e) => patch({ assetIdOld: e.target.value })}
                  className="rounded-[8px]"
                />
              </Field>
            ) : null}
            <Field label="Serial number" required={asset.kind === 'laptop'}>
              <Input
                value={form.serialNum}
                onChange={(e) => patch({ serialNum: e.target.value })}
                required={asset.kind === 'laptop'}
                className="rounded-[8px]"
                placeholder="Enter serial number"
              />
            </Field>
            <Field label="Brand">
              <Input
                value={form.brand}
                onChange={(e) => patch({ brand: e.target.value })}
                className="rounded-[8px]"
                placeholder="Lenovo, HP, Dell, etc."
              />
            </Field>
            <Field label="Model">
              <Input
                value={form.model}
                onChange={(e) => patch({ model: e.target.value })}
                className="rounded-[8px]"
                placeholder="ThinkPad X1 Carbon, HP EliteBook 840 G8, etc."
              />
            </Field>
            <Field label="Supplier">
              <Input
                value={form.supplier}
                onChange={(e) => patch({ supplier: e.target.value })}
                className="rounded-[8px]"
                placeholder="Enter supplier name"
              />
            </Field>
            {asset.kind === 'laptop' ? (
              <>
                <Field label="Part number">
                  <Input
                    value={form.partNumber}
                    onChange={(e) => patch({ partNumber: e.target.value })}
                    className="rounded-[8px]"
                    placeholder="Enter part number"
                  />
                </Field>
                <Field label="Processor">
                  <Input
                    value={form.processor}
                    onChange={(e) => patch({ processor: e.target.value })}
                    className="rounded-[8px]"
                    placeholder="Enter processor"
                  />
                </Field>
                <Field label="Memory">
                  <Input
                    value={form.memory}
                    onChange={(e) => patch({ memory: e.target.value })}
                    className="rounded-[8px]"
                    placeholder="Enter memory"
                  />
                </Field>
                <Field label="Storage">
                  <Input
                    value={form.storage}
                    onChange={(e) => patch({ storage: e.target.value })}
                    className="rounded-[8px]"
                    placeholder="Enter storage"
                  />
                </Field>
                <Field label="OS">
                  <Input
                    value={form.os}
                    onChange={(e) => patch({ os: e.target.value })}
                    className="rounded-[8px]"
                    placeholder="Enter OS"
                  />
                </Field>
                <Field label="GPU">
                  <Input
                    value={form.gpu}
                    onChange={(e) => patch({ gpu: e.target.value })}
                    className="rounded-[8px]"
                    placeholder="Enter GPU"
                  />
                </Field>
              </>
            ) : null}
            {asset.kind === 'network' ? (
              <>
                <Field label="IP address">
                  <Input
                    value={form.ipAddress}
                    onChange={(e) => patch({ ipAddress: e.target.value })}
                    className="rounded-[8px]"
                  />
                </Field>
                <Field label="MAC address">
                  <Input
                    value={form.macAddress}
                    onChange={(e) => patch({ macAddress: e.target.value })}
                    className="rounded-[8px]"
                  />
                </Field>
              </>
            ) : null}
            <Field label="Remarks" className="space-y-2 sm:col-span-2">
              <Textarea
                value={form.remarks}
                onChange={(e) => patch({ remarks: e.target.value })}
                className="min-h-[72px] rounded-[8px]"
                placeholder="Optional notes for this asset"
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="rounded-[14px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Procurement</CardTitle>
            <CardDescription>PO, delivery, and invoice details</CardDescription>
          </CardHeader>
          <CardContent>
            <PurchaseFieldsSection
              values={form.purchase}
              onChange={(next) => patch({ purchase: { ...form.purchase, ...next } })}
              hideHeading
            />
          </CardContent>
        </Card>
      </div>

      {deployment && deploymentForm ? (
        <AssetDeploymentEditFields
          deployment={deployment}
          value={deploymentForm}
          onChange={(next) => setDeploymentForm((current) => (current ? { ...current, ...next } : current))}
        />
      ) : (
        <Card className="rounded-[14px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Deployment details</CardTitle>
            <CardDescription>Not currently deployed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No active handover or deployment. Use deploy from the asset list to assign this asset.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-[12px] border border-border bg-card/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="rounded-[8px]" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="rounded-[8px] bg-foreground text-background hover:opacity-90"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </form>
  );
}
