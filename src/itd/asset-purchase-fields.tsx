import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PurchaseFormState } from '@shared/lib/purchase-field-utils';
import { DatePickerField } from '@/technician/deploy-return-fields';

export function PurchaseFieldsSection({
  values,
  onChange,
  hideHeading,
}: {
  values: PurchaseFormState;
  onChange: (patch: Partial<PurchaseFormState>) => void;
  hideHeading?: boolean;
}) {
  return (
    <section className="space-y-4">
      {hideHeading ? null : (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Procurement</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DatePickerField
          label="PO date"
          value={values.poDate}
          onChange={(v) => onChange({ poDate: v })}
        />
        <Field label="PO number">
          <Input value={values.poNum} onChange={(e) => onChange({ poNum: e.target.value })} className="rounded-[8px]" placeholder="Enter PO number (e.g. PO-123456)" />
        </Field>
        <DatePickerField
          label="DO date"
          value={values.doDate}
          onChange={(v) => onChange({ doDate: v })}
        />
        <Field label="DO number">
          <Input value={values.doNum} onChange={(e) => onChange({ doNum: e.target.value })} className="rounded-[8px]" placeholder="Enter DO number (e.g. DO-123456)" />
        </Field>
        <DatePickerField
          label="Invoice date"
          value={values.invoiceDate}
          onChange={(v) => onChange({ invoiceDate: v })}
        />
        <Field label="Invoice number">
          <Input value={values.invoiceNum} onChange={(e) => onChange({ invoiceNum: e.target.value })} className="rounded-[8px]" placeholder="Enter invoice number (e.g. INV-123456)" />
        </Field>
        <Field label="Purchase cost">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={values.purchaseCost}
            onChange={(e) => onChange({ purchaseCost: e.target.value })}
            placeholder="RM 0.00"
            className="rounded-[8px]"
          />
        </Field>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
