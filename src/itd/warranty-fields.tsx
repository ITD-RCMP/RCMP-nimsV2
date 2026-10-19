import { Textarea } from '@/components/ui/textarea';
import type { WarrantyFormState } from '@/lib/warranty-field-utils';
import { DatePickerField, FormField } from '@/technician/deploy-return-fields';

export function WarrantyFieldsSection({
  values,
  onChange,
}: {
  values: WarrantyFormState;
  onChange: (patch: Partial<WarrantyFormState>) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor warranty (Optional)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Stored on first registration. Start date, end date, and remarks.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DatePickerField
          label="Warranty start"
          value={values.startDate}
          onChange={(v) => onChange({ startDate: v })}
        />
        <DatePickerField
          label="Warranty end"
          value={values.endDate}
          onChange={(v) => onChange({ endDate: v })}
        />
        <div className="sm:col-span-2">
        <FormField label="Warranty remarks">
          <Textarea
            value={values.remarks}
            onChange={(e) => onChange({ remarks: e.target.value })}
            className="min-h-[72px] rounded-[8px]"
            placeholder="Vendor, contract ref, notes…"
          />
        </FormField>
        </div>
      </div>
    </section>
  );
}
