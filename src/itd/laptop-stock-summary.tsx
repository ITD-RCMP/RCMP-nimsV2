import type { ElementType } from 'react';
import { Box, Laptop as LaptopIcon, Layers, Monitor } from 'lucide-react';
import {
  isLeasingCategory,
  isOtherLaptopCategory,
  isOwnedDesktopCategory,
  isOwnedNotebookCategory,
  normalizeCategory,
} from '@/hooks/assetid-generator';
import {
  formatStatusLabel,
  LAPTOP_ASSIGNMENT_BUCKETS,
  matchesAssignmentBucket,
  type LaptopAsset,
  type LaptopAssignmentBucket,
} from '@shared/lib/inventory-schema';
import { InsightStatCard } from '@/components/insight-stat-card';
import { cn } from '@/lib/utils';

export type LaptopFormFactor = 'laptop' | 'desktop' | 'leasing' | 'other';
export type LaptopFormFactorFilter = 'all' | LaptopFormFactor;

const STOCK_SUMMARY_STATUS_IDS = [1, 2, 3, 4] as const;

type StatusCount = {
  statusId: number;
  label: string;
  count: number;
};

type LabelCount = {
  label: LaptopAssignmentBucket;
  count: number;
};

function CompactMetricRow({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={`Filter table by ${label}`}
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center justify-between gap-2 rounded-[8px] bg-background/80 px-2.5 py-1.5 text-left ring-1 ring-border/50 transition-colors',
        'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive && 'bg-primary/10 ring-2 ring-primary/40',
        count === 0 && 'opacity-60',
      )}
    >
      <span className="min-w-0 truncate text-[11px] capitalize leading-tight text-muted-foreground">{label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{count}</span>
    </button>
  );
}

function StatusMetricGrid({
  rows,
  formFactor,
  statusFilter,
  formFactorFilter,
  onStatusClick,
}: {
  rows: StatusCount[];
  formFactor: LaptopFormFactor;
  statusFilter: number | null;
  formFactorFilter: LaptopFormFactorFilter;
  onStatusClick: (formFactor: LaptopFormFactor, statusId: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map(({ statusId, label, count }) => (
        <CompactMetricRow
          key={statusId}
          label={label}
          count={count}
          isActive={statusFilter === statusId && formFactorFilter === formFactor}
          onClick={() => onStatusClick(formFactor, statusId)}
        />
      ))}
    </div>
  );
}

function DivisionSplit({
  rows,
  formFactor,
  divisionFilter,
  formFactorFilter,
  onDivisionClick,
}: {
  rows: LabelCount[];
  formFactor: LaptopFormFactor;
  divisionFilter: LaptopAssignmentBucket | null;
  formFactorFilter: LaptopFormFactorFilter;
  onDivisionClick: (formFactor: LaptopFormFactor, division: LaptopAssignmentBucket) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map(({ label, count }) => (
        <CompactMetricRow
          key={label}
          label={label}
          count={count}
          isActive={divisionFilter === label && formFactorFilter === formFactor}
          onClick={() => onDivisionClick(formFactor, label)}
        />
      ))}
    </div>
  );
}

function FormFactorCard({
  icon: Icon,
  label,
  formFactor,
  value,
  statusRows,
  divisionRows,
  tone,
  statusFilter,
  formFactorFilter,
  divisionFilter,
  onStatusClick,
  onDivisionClick,
}: {
  icon: ElementType;
  label: string;
  formFactor: LaptopFormFactor;
  value: number;
  statusRows: StatusCount[];
  divisionRows: LabelCount[];
  tone: 'lime' | 'violet' | 'amber';
  statusFilter: number | null;
  formFactorFilter: LaptopFormFactorFilter;
  divisionFilter: LaptopAssignmentBucket | null;
  onStatusClick: (formFactor: LaptopFormFactor, statusId: number) => void;
  onDivisionClick: (formFactor: LaptopFormFactor, division: LaptopAssignmentBucket) => void;
}) {
  return (
    <InsightStatCard icon={Icon} label={label} value={value} tone={tone}>
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            By status
          </p>
          <StatusMetricGrid
            rows={statusRows}
            formFactor={formFactor}
            statusFilter={statusFilter}
            formFactorFilter={formFactorFilter}
            onStatusClick={onStatusClick}
          />
        </div>

        <div>
          <p className="mb-2 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            By assignment
          </p>
          <DivisionSplit
            rows={divisionRows}
            formFactor={formFactor}
            divisionFilter={divisionFilter}
            formFactorFilter={formFactorFilter}
            onDivisionClick={onDivisionClick}
          />
        </div>
      </div>
    </InsightStatCard>
  );
}

function countStatusRows(items: LaptopAsset[]): StatusCount[] {
  const counts = new Map<number, number>();
  for (const item of items) {
    counts.set(item.statusId, (counts.get(item.statusId) ?? 0) + 1);
  }
  return STOCK_SUMMARY_STATUS_IDS.map((statusId) => ({
    statusId,
    label: formatStatusLabel(statusId),
    count: counts.get(statusId) ?? 0,
  }));
}

function countDivisionRows(items: LaptopAsset[]): LabelCount[] {
  return LAPTOP_ASSIGNMENT_BUCKETS.map((bucket) => ({
    label: bucket,
    count: items.filter((item) => matchesAssignmentBucket(item, bucket)).length,
  }));
}

function countOtherCategoryRows(items: LaptopAsset[]): { label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const label = item.category?.trim();
    if (!label) continue;
    const key = normalizeCategory(label);
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { label, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

type LaptopAssetStockSummaryProps = {
  items: LaptopAsset[];
  statusFilter: number | null;
  formFactorFilter: LaptopFormFactorFilter;
  divisionFilter: LaptopAssignmentBucket | null;
  otherCategoryFilter: string | null;
  onStatusClick: (formFactor: LaptopFormFactor, statusId: number) => void;
  onDivisionClick: (formFactor: LaptopFormFactor, division: LaptopAssignmentBucket) => void;
  onOtherCategoryClick: (category: string) => void;
};

export function LaptopAssetStockSummary({
  items,
  statusFilter,
  formFactorFilter,
  divisionFilter,
  otherCategoryFilter,
  onStatusClick,
  onDivisionClick,
  onOtherCategoryClick,
}: LaptopAssetStockSummaryProps) {
  const laptopItems = items.filter((item) => isOwnedNotebookCategory(item.category));
  const desktopItems = items.filter((item) => isOwnedDesktopCategory(item.category));
  const leasingItems = items.filter((item) => isLeasingCategory(item.category));
  const otherItems = items.filter((item) => isOtherLaptopCategory(item.category));
  const otherCategoryRows = countOtherCategoryRows(otherItems);

  return (
    <div className="mb-5 flex gap-3 overflow-x-auto pb-2 sm:mb-6">
      <div className="flex min-w-[16.5rem] flex-1 flex-col">
        <FormFactorCard
          icon={LaptopIcon}
          label="Laptop"
          formFactor="laptop"
          value={laptopItems.length}
          statusRows={countStatusRows(laptopItems)}
          divisionRows={countDivisionRows(laptopItems)}
          tone="lime"
          statusFilter={statusFilter}
          formFactorFilter={formFactorFilter}
          divisionFilter={divisionFilter}
          onStatusClick={onStatusClick}
          onDivisionClick={onDivisionClick}
        />
      </div>
      <div className="flex min-w-[16.5rem] flex-1 flex-col">
        <FormFactorCard
          icon={Monitor}
          label="Desktop"
          formFactor="desktop"
          value={desktopItems.length}
          statusRows={countStatusRows(desktopItems)}
          divisionRows={countDivisionRows(desktopItems)}
          tone="violet"
          statusFilter={statusFilter}
          formFactorFilter={formFactorFilter}
          divisionFilter={divisionFilter}
          onStatusClick={onStatusClick}
          onDivisionClick={onDivisionClick}
        />
      </div>
      <div className="flex min-w-[16.5rem] flex-1 flex-col">
        <FormFactorCard
          icon={Layers}
          label="Leasing Laptop / Desktop"
          formFactor="leasing"
          value={leasingItems.length}
          statusRows={countStatusRows(leasingItems)}
          divisionRows={countDivisionRows(leasingItems)}
          tone="amber"
          statusFilter={statusFilter}
          formFactorFilter={formFactorFilter}
          divisionFilter={divisionFilter}
          onStatusClick={onStatusClick}
          onDivisionClick={onDivisionClick}
        />
      </div>
      <div className="flex min-w-[16.5rem] flex-1 flex-col">
        <InsightStatCard icon={Box} label="Other" value={otherItems.length} tone="sky">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              By category
            </p>
            {otherCategoryRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom categories yet.</p>
            ) : (
              <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                {otherCategoryRows.map(({ label, count }) => (
                  <CompactMetricRow
                    key={label}
                    label={label}
                    count={count}
                    isActive={
                      formFactorFilter === 'other' &&
                      normalizeCategory(otherCategoryFilter ?? '') === normalizeCategory(label)
                    }
                    onClick={() => onOtherCategoryClick(label)}
                  />
                ))}
              </div>
            )}
          </div>
        </InsightStatCard>
      </div>
    </div>
  );
}
