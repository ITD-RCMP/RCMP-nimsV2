import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RETURN_CONDITIONS } from '@shared/lib/deploy-return-schema';

export function RequestReturnFields({
  returnCondition,
  setReturnCondition,
  remarks,
  setRemarks,
}: {
  returnCondition: string;
  setReturnCondition: (v: string) => void;
  remarks: string;
  setRemarks: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">
          Condition<span className="text-destructive"> *</span>
        </Label>
        <Select value={returnCondition} onValueChange={setReturnCondition}>
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
          Saved to <code className="text-[10px]">return_condition</code> on the assignment.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="request-return-remarks" className="text-xs">
          Remarks
        </Label>
        <Textarea
          id="request-return-remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Optional notes at return…"
          className="min-h-[80px] rounded-[8px]"
        />
      </div>
    </div>
  );
}
