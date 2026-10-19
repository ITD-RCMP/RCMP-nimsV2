import type { ElementType } from 'react';
import { PackageCheck, PackageX } from 'lucide-react';
import { countStockAssets, type StockStatusCount } from '@/hooks/assets';
import { STATUS_ID } from '@shared/lib/asset-status-actions';
import { CAMPUS_BUILDINGS, canonicalizeCampusBuilding } from '@shared/lib/deploy-return-schema';
import { formatStatusLabel, OUTSTOCK_STATUS_IDS, type AssetKind } from '@shared/lib/inventory-schema';
import { InsightStatCard } from '@/components/insight-stat-card';
import { cn } from '@/lib/utils';

export type AssetStockBreakdownFilter =
  | { kind: 'status'; statusId: number }
  | { kind: 'building'; buildingKey: string };

type BreakdownRow = {
  key: string;
  label: string;
  count: number;
  filter: AssetStockBreakdownFilter;
};

function breakdownFiltersEqual(
  a: AssetStockBreakdownFilter | null | undefined,
  b: AssetStockBreakdownFilter,
): boolean {
  if (a == null) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'status' && b.kind === 'status') return a.statusId === b.statusId;
  if (a.kind === 'building' && b.kind === 'building') {
    return a.buildingKey.toLowerCase() === b.buildingKey.toLowerCase();
  }
  return false;
}

function MetricList({
  rows,
  activeFilter,
  onFilterClick,
}: {
  rows: BreakdownRow[];
  activeFilter: AssetStockBreakdownFilter | null;
  onFilterClick: (filter: AssetStockBreakdownFilter) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row) => {
        const isActive = breakdownFiltersEqual(activeFilter, row.filter);
        return (
          <li key={row.key}>
            <button
              type="button"
              title={`Filter table by ${row.label}`}
              onClick={() => onFilterClick(row.filter)}
              className={cn(
                'flex w-full items-center justify-between gap-3 py-1.5 text-left transition-colors',
                'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive ? 'text-foreground' : 'text-muted-foreground',
                row.count === 0 && !isActive && 'opacity-60',
              )}
            >
              <span className="min-w-0 truncate text-xs capitalize">{row.label}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{row.count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function BreakdownList({
  sections,
  activeFilter,
  onFilterClick,
}: {
  sections: { title?: string; rows: BreakdownRow[] }[];
  activeFilter: AssetStockBreakdownFilter | null;
  onFilterClick: (filter: AssetStockBreakdownFilter) => void;
}) {
  const visible = sections.filter((section) => section.rows.length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      {visible.map((section) => (
        <div key={section.title ?? 'default'}>
          {section.title ? (
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
          ) : null}
          <MetricList
            rows={section.rows}
            activeFilter={activeFilter}
            onFilterClick={onFilterClick}
          />
        </div>
      ))}
    </div>
  );
}

function statusRowsToBreakdown(rows: StockStatusCount[]): BreakdownRow[] {
  return rows.map(({ statusId, count }) => ({
    key: `status:${statusId}`,
    label: formatStatusLabel(statusId),
    count,
    filter: { kind: 'status', statusId },
  }));
}

const OUTSTOCK_STATUS_BREAKDOWN_IDS = OUTSTOCK_STATUS_IDS.filter(
  (statusId) => statusId !== STATUS_ID.DEPLOY,
);

function outstockStatusRows(counts: Map<number, number>): BreakdownRow[] {
  return OUTSTOCK_STATUS_BREAKDOWN_IDS.map((statusId) => ({
    key: `status:${statusId}`,
    label: formatStatusLabel(statusId),
    count: counts.get(statusId) ?? 0,
    filter: { kind: 'status' as const, statusId },
  }));
}

function outstockBuildingBreakdown(
  items: { statusId: number; building?: string | null }[],
  kind: 'av' | 'network',
): { place: BreakdownRow[]; status: BreakdownRow[] } {
  const campusSet = new Set<string>(CAMPUS_BUILDINGS);
  const buildingCounts = new Map<string, number>();
  const buildingLabels = new Map<string, string>();
  if (kind === 'av') {
    for (const building of CAMPUS_BUILDINGS) {
      buildingCounts.set(building, 0);
      buildingLabels.set(building, building);
    }
  }

  const otherStatusCounts = new Map<number, number>();

  for (const item of items) {
    if (item.statusId === STATUS_ID.DEPLOY) {
      const building = canonicalizeCampusBuilding(item.building);
      if (kind === 'av') {
        if (!campusSet.has(building)) continue;
        buildingCounts.set(building, (buildingCounts.get(building) ?? 0) + 1);
        continue;
      }
      const key = building.toLowerCase();
      buildingLabels.set(key, buildingLabels.get(key) ?? building);
      buildingCounts.set(key, (buildingCounts.get(key) ?? 0) + 1);
      continue;
    }
    if (!(OUTSTOCK_STATUS_IDS as readonly number[]).includes(item.statusId)) continue;
    otherStatusCounts.set(item.statusId, (otherStatusCounts.get(item.statusId) ?? 0) + 1);
  }

  const place: BreakdownRow[] =
    kind === 'av'
      ? CAMPUS_BUILDINGS.map((building) => ({
          key: `building:${building}`,
          label: building,
          count: buildingCounts.get(building) ?? 0,
          filter: { kind: 'building' as const, buildingKey: building },
        }))
      : [...buildingCounts.entries()]
          .sort((a, b) => {
            const labelA = buildingLabels.get(a[0]) ?? a[0];
            const labelB = buildingLabels.get(b[0]) ?? b[0];
            return b[1] - a[1] || labelA.localeCompare(labelB);
          })
          .map(([key, count]) => ({
            key: `building:${key}`,
            label: buildingLabels.get(key) ?? key,
            count,
            filter: { kind: 'building' as const, buildingKey: key },
          }));

  return {
    place,
    status: outstockStatusRows(otherStatusCounts),
  };
}

function StockCountCard({
  icon: Icon,
  label,
  value,
  sections,
  tone,
  activeFilter,
  onFilterClick,
}: {
  icon: ElementType;
  label: string;
  value: number;
  sections: { title?: string; rows: BreakdownRow[] }[];
  tone: 'emerald' | 'rose';
  activeFilter: AssetStockBreakdownFilter | null;
  onFilterClick: (filter: AssetStockBreakdownFilter) => void;
}) {
  return (
    <InsightStatCard icon={Icon} label={label} value={value} tone={tone}>
      <BreakdownList
        sections={sections}
        activeFilter={activeFilter}
        onFilterClick={onFilterClick}
      />
    </InsightStatCard>
  );
}

export function matchesAssetStockFilter<T extends { statusId: number; building?: string | null }>(
  item: T,
  filter: AssetStockBreakdownFilter | null,
): boolean {
  if (filter == null) return true;
  if (filter.kind === 'status') return item.statusId === filter.statusId;
  if (item.statusId !== STATUS_ID.DEPLOY) return false;
  return (
    canonicalizeCampusBuilding(item.building).toLowerCase() === filter.buildingKey.toLowerCase()
  );
}

export function AssetStockSummary({
  items,
  kind,
  activeFilter,
  onFilterClick,
}: {
  items: { statusId: number; building?: string | null }[];
  kind: Extract<AssetKind, 'av' | 'network'>;
  activeFilter: AssetStockBreakdownFilter | null;
  onFilterClick: (filter: AssetStockBreakdownFilter) => void;
}) {
  const { instock, outstock, instockByStatus } = countStockAssets(items);
  const outstockSections = outstockBuildingBreakdown(items, kind);
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:mb-6">
      <StockCountCard
        icon={PackageCheck}
        label="In stock"
        value={instock}
        sections={[{ rows: statusRowsToBreakdown(instockByStatus) }]}
        tone="emerald"
        activeFilter={activeFilter}
        onFilterClick={onFilterClick}
      />
      <StockCountCard
        icon={PackageX}
        label="Out of stock"
        value={outstock}
        sections={[
          { title: 'Place', rows: outstockSections.place },
          { title: 'Status', rows: outstockSections.status },
        ]}
        tone="rose"
        activeFilter={activeFilter}
        onFilterClick={onFilterClick}
      />
    </div>
  );
}
