import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { OpenReturnContext, StaffRecipient, UpdateOpenDeploymentInput } from '@shared/lib/deploy-return-schema';
import { missingStaffDirectoryFields, staffDirectoryIncompleteMessage } from '@shared/lib/deploy-return-schema';
import type { AssetId } from '@shared/lib/inventory-schema';
import { CampusBuildingSelect, DatePickerField, FormField } from '@/technician/deploy-return-fields';
import { StaffRecipientSearch } from '@/technician/staff-recipient-search';

export type DeploymentEditState = {
  recipient: StaffRecipient | null;
  date: string;
  remarks: string;
  building: string;
  level: string;
  zone: string;
  handler: string;
};

export function deploymentToEditState(deployment: OpenReturnContext): DeploymentEditState {
  if (deployment.kind === 'laptop') {
    const record = deployment.record;
    if (record.type === 'staff') {
      return {
        recipient: {
          employeeNo: record.employeeNo,
          fullName: record.recipientName,
          department: record.department,
          email: record.email,
          phone: null,
        },
        date: record.handoverDate,
        remarks: record.handoverRemarks ?? '',
        building: '',
        level: '',
        zone: '',
        handler: '',
      };
    }
    return {
      recipient: null,
      date: record.handoverDate,
      remarks: record.handoverRemarks ?? '',
      building: record.building ?? '',
      level: record.level ?? '',
      zone: record.zone ?? '',
      handler: record.handler ?? '',
    };
  }

  const record = deployment.record;
  return {
    recipient: null,
    date: record.deploymentDate,
    remarks: record.deploymentRemarks ?? '',
    building: record.building ?? '',
    level: record.level ?? '',
    zone: record.zone ?? '',
    handler: '',
  };
}

export function validateDeploymentEdit(deployment: OpenReturnContext, form: DeploymentEditState): string | null {
  if (!form.date.trim()) {
    return deployment.kind === 'laptop' && deployment.record.type === 'staff'
      ? 'Handover date is required.'
      : 'Deployment date is required.';
  }
  if (deployment.kind === 'laptop' && deployment.record.type === 'staff') {
    if (!form.recipient?.employeeNo.trim()) return 'Choose a staff recipient from the directory.';
    const missing = missingStaffDirectoryFields({
      fullName: form.recipient.fullName,
      email: form.recipient.email,
      faculty: form.recipient.department,
    });
    if (missing.length) return staffDirectoryIncompleteMessage(missing);
    return null;
  }
  if (!form.building.trim()) return 'Building is required.';
  if (deployment.kind === 'laptop') {
    if (!form.handler.trim()) return 'Handler is required.';
    return null;
  }
  if (!form.level.trim()) return 'Level is required.';
  if (!form.zone.trim()) return 'Zone is required.';
  return null;
}

export function buildDeploymentUpdateInput(
  assetId: AssetId,
  deployment: OpenReturnContext,
  form: DeploymentEditState,
): UpdateOpenDeploymentInput {
  const remarks = form.remarks.trim() || null;
  if (deployment.kind === 'laptop' && deployment.record.type === 'staff') {
    return {
      kind: 'laptop',
      type: 'staff',
      assetId,
      handoverId: deployment.record.handoverId,
      handoverStaffId: deployment.record.handoverStaffId,
      employeeNo: form.recipient?.employeeNo.trim() ?? '',
      handoverDate: form.date,
      handoverRemarks: remarks,
    };
  }
  if (deployment.kind === 'laptop') {
    return {
      kind: 'laptop',
      type: 'place',
      assetId,
      handoverId: deployment.record.handoverId,
      building: form.building.trim(),
      level: form.level.trim() || null,
      zone: form.zone.trim() || null,
      handler: form.handler.trim(),
      handoverDate: form.date,
      handoverRemarks: remarks,
    };
  }
  return {
    kind: deployment.kind,
    assetId,
    deploymentId: deployment.record.deploymentId,
    building: form.building.trim(),
    level: form.level.trim(),
    zone: form.zone.trim(),
    deploymentDate: form.date,
    deploymentRemarks: remarks,
  };
}

function handledBy(deployment: OpenReturnContext): string | null {
  return deployment.record.handledBy?.trim() || null;
}

function cardTitle(deployment: OpenReturnContext): string {
  if (deployment.kind === 'laptop' && deployment.record.type === 'staff') return 'Handover';
  return 'Place';
}

function cardDescription(deployment: OpenReturnContext): string {
  if (deployment.kind === 'laptop' && deployment.record.type === 'staff') {
    return 'Staff recipient and handover details';
  }
  return 'Location and deployment details';
}

export function AssetDeploymentEditFields({
  deployment,
  value,
  onChange,
}: {
  deployment: OpenReturnContext;
  value: DeploymentEditState;
  onChange: (patch: Partial<DeploymentEditState>) => void;
}) {
  const technician = handledBy(deployment);
  const isLaptopStaff = deployment.kind === 'laptop' && deployment.record.type === 'staff';
  const isLaptopPlace = deployment.kind === 'laptop' && deployment.record.type === 'place';
  const dateLabel = isLaptopStaff ? 'Handover date' : 'Deployment date';
  const remarksLabel = isLaptopStaff ? 'Handover remarks' : 'Deployment remarks';

  return (
    <Card className="rounded-[14px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{cardTitle(deployment)}</CardTitle>
        <CardDescription>{cardDescription(deployment)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {isLaptopStaff ? (
          <div className="sm:col-span-2">
            <FormField label="Recipient (staff directory)" required>
              <StaffRecipientSearch
                value={value.recipient}
                onSelect={(recipient) => onChange({ recipient })}
              />
            </FormField>
          </div>
        ) : (
          <>
            <FormField label="Building" required>
              {deployment.kind === 'network' ? (
                <Input
                  value={value.building}
                  onChange={(e) => onChange({ building: e.target.value })}
                  placeholder="Building name"
                  required
                  className="rounded-[8px]"
                />
              ) : (
                <CampusBuildingSelect
                  value={value.building}
                  onChange={(building) => onChange({ building })}
                />
              )}
            </FormField>
            <FormField label="Level" required={!isLaptopPlace}>
              <Input
                value={value.level}
                onChange={(e) => onChange({ level: e.target.value })}
                required={!isLaptopPlace}
                className="rounded-[8px]"
              />
            </FormField>
            <FormField label="Zone" required={!isLaptopPlace}>
              <Input
                value={value.zone}
                onChange={(e) => onChange({ zone: e.target.value })}
                required={!isLaptopPlace}
                className="rounded-[8px]"
              />
            </FormField>
            {isLaptopPlace ? (
              <FormField label="Handler" required>
                <Input
                  value={value.handler}
                  onChange={(e) => onChange({ handler: e.target.value })}
                  placeholder="On-site contact name"
                  required
                  className="rounded-[8px]"
                />
              </FormField>
            ) : null}
          </>
        )}
        <DatePickerField
          label={dateLabel}
          value={value.date}
          onChange={(date) => onChange({ date })}
          required
        />
        {technician ? (
          <FormField label="Handled by">
            <div className="flex h-10 items-center rounded-[8px] border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
              {technician}
            </div>
          </FormField>
        ) : null}
        <div className="sm:col-span-2">
          <FormField label={remarksLabel}>
            <Textarea
              value={value.remarks}
              onChange={(e) => onChange({ remarks: e.target.value })}
              className="min-h-[80px] rounded-[8px]"
              placeholder={isLaptopPlace ? 'Location / room / site details' : 'Optional notes'}
            />
          </FormField>
        </div>
      </CardContent>
    </Card>
  );
}
