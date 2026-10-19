import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DATE_FORMAT_DDMMYY,
  formatDateLabel,
  formatIsoToDdMmYy,
  isoToLocalDate,
  localDateToIso,
} from '@shared/lib/date-format';
import { RETURN_CONDITIONS, CAMPUS_BUILDINGS } from '@shared/lib/deploy-return-schema';
import { cn } from '@/lib/utils';

export function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        {hint ? <p className="text-xs leading-snug text-foreground/80">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Calendar picker; stores ISO date (YYYY-MM-DD). Shows DDMMYY hint for records. */
export function DatePickerField({
  label,
  value,
  onChange,
  required,
  hint,
  minDate,
  holidays = [],
}: {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  required?: boolean;
  hint?: string;
  minDate?: string;
  holidays?: { date: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? isoToLocalDate(value) : undefined;
  const minLocal = minDate ? isoToLocalDate(minDate) : undefined;
  const ddmmyy = value ? formatIsoToDdMmYy(value) : null;
  const holidayDates = holidays
    .map((holiday) => isoToLocalDate(holiday.date))
    .filter((date): date is Date => date != null);

  return (
    <FormField label={label} required={required} hint={hint}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'h-10 w-full justify-start rounded-[8px] px-3 font-normal',
              !selected && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            {selected ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
                <span>{formatDateLabel(value)}</span>
                {ddmmyy && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    ({DATE_FORMAT_DDMMYY}: {ddmmyy})
                  </span>
                )}
              </span>
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
          <Calendar
            className="[--cell-size:3rem]"
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (date) {
                onChange(localDateToIso(date));
                setOpen(false);
              }
            }}
            disabled={minLocal ? { before: minLocal } : undefined}
            defaultMonth={selected ?? minLocal}
            modifiers={{ holiday: holidayDates }}
            modifiersClassNames={{
              holiday: 'text-rose-600 dark:text-rose-400',
            }}
            initialFocus
          />
          {holidayDates.length > 0 ? (
            <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
              Dates in rose are Perak public holidays.
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
      <input
        type="hidden"
        name={label.replace(/\s+/g, '_').toLowerCase()}
        value={value}
        required={required}
      />
    </FormField>
  );
}

/** @deprecated Use DatePickerField */
export const DateDdMmYyField = DatePickerField;

export function CampusBuildingSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const buildings: string[] = [...CAMPUS_BUILDINGS];
  const current = value.trim();
  if (current && !buildings.some((building) => building.toLowerCase() === current.toLowerCase())) {
    buildings.unshift(current);
  }

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="rounded-[8px]">
        <SelectValue placeholder="Select building" />
      </SelectTrigger>
      <SelectContent>
        {buildings.map((building) => (
          <SelectItem key={building} value={building}>
            {building}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReturnDetailsFields({
  returnDate,
  setReturnDate,
  returnTime,
  setReturnTime,
  returnPlace,
  setReturnPlace,
  condition,
  setCondition,
  returnRemarks,
  setReturnRemarks,
}: {
  returnDate: string;
  setReturnDate: (v: string) => void;
  returnTime: string;
  setReturnTime: (v: string) => void;
  returnPlace: string;
  setReturnPlace: (v: string) => void;
  condition: string;
  setCondition: (v: string) => void;
  returnRemarks: string;
  setReturnRemarks: (v: string) => void;
}) {
  return (
    <>
      <DatePickerField label="Return date" value={returnDate} onChange={setReturnDate} required />
      <FormField label="Return time">
        <Input
          type="time"
          value={returnTime}
          onChange={(e) => setReturnTime(e.target.value)}
          className="rounded-[8px]"
        />
      </FormField>
      <FormField label="Return place">
        <CampusBuildingSelect value={returnPlace} onChange={setReturnPlace} />
      </FormField>
      <FormField label="Condition" required>
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger className="rounded-[8px]">
            <SelectValue placeholder="Select condition" />
          </SelectTrigger>
          <SelectContent>
            {RETURN_CONDITIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Good condition sets status to return; Bad condition sets status to pre-disposed.
        </p>
      </FormField>
      <FormField label="Return remarks">
        <Textarea
          value={returnRemarks}
          onChange={(e) => setReturnRemarks(e.target.value)}
          className="min-h-[80px] rounded-[8px]"
          placeholder="e.g. broken screen, missing keyboard, etc."
        />
      </FormField>
    </>
  );
}
