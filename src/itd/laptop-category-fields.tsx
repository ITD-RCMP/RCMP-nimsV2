import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  isKnownLaptopCategory,
  LAPTOP_CATEGORY_OTHERS,
  LAPTOP_CATEGORY_SELECT_OPTIONS,
  laptopCategorySelectValue,
} from '@/hooks/assetid-generator';

export function LaptopCategoryFields({
  category,
  onCategoryChange,
}: {
  category: string;
  onCategoryChange: (category: string) => void;
}) {
  const selectValue = laptopCategorySelectValue(category);
  const isOthers = selectValue === LAPTOP_CATEGORY_OTHERS;

  return (
    <>
      <div className="space-y-2">
        <Label>
          Category
          <span className="text-destructive"> *</span>
        </Label>
        <Select
          value={selectValue}
          onValueChange={(value) => {
            if (value === LAPTOP_CATEGORY_OTHERS) {
              onCategoryChange(isKnownLaptopCategory(category) ? '' : category);
              return;
            }
            onCategoryChange(value);
          }}
        >
          <SelectTrigger className="rounded-[8px]">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {LAPTOP_CATEGORY_SELECT_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isOthers ? (
        <div className="space-y-2">
          <Label>
            Custom category
            <span className="text-destructive"> *</span>
          </Label>
          <Input
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="rounded-[8px]"
            placeholder="Monitor, Docking Station, etc."
            required
          />
        </div>
      ) : null}
    </>
  );
}
