import { TableHead } from '@/components/ui/table';
import { canonicalizeCampusBuilding } from '@shared/lib/deploy-return-schema';
import type { PlaceFields } from '@shared/lib/inventory-schema';

export type PlaceColumnView = 'place' | 'building' | 'level' | 'zone';

const PLACE_VIEW_LABEL: Record<PlaceColumnView, string> = {
  place: 'Place',
  building: 'Building',
  level: 'Level',
  zone: 'Zone',
};

const PLACE_VIEW_NEXT: Record<PlaceColumnView, PlaceColumnView> = {
  place: 'building',
  building: 'level',
  level: 'zone',
  zone: 'place',
};

export function PlaceTableHead({
  view,
  onViewChange,
}: {
  view: PlaceColumnView;
  onViewChange: (view: PlaceColumnView) => void;
}) {
  const next = PLACE_VIEW_NEXT[view];

  return (
    <TableHead className="whitespace-nowrap font-semibold">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-[6px] px-1 -mx-1 text-left hover:text-foreground hover:underline underline-offset-2"
        title={`Show ${PLACE_VIEW_LABEL[next].toLowerCase()}`}
        onClick={() => onViewChange(next)}
      >
        {PLACE_VIEW_LABEL[view]}
      </button>
    </TableHead>
  );
}

export function formatPlaceCell(view: PlaceColumnView, place: PlaceFields): string {
  if (view === 'building') return place.building ?? '—';
  if (view === 'level') return place.level ?? '—';
  if (view === 'zone') return place.zone ?? '—';
  const parts = [place.building, place.level, place.zone].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

export type AssetPlaceFilter = {
  building: string | null;
  level: string | null;
  zone: string | null;
};

export const EMPTY_PLACE_FILTER: AssetPlaceFilter = {
  building: null,
  level: null,
  zone: null,
};

function normalizePlaceValue(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function placeValueKey(field: keyof PlaceFields, value: string): string {
  if (field === 'building') return canonicalizeCampusBuilding(value).toLowerCase();
  return value.trim().toLowerCase();
}

function placeValueLabel(field: keyof PlaceFields, value: string): string {
  if (field === 'building') return canonicalizeCampusBuilding(value);
  return value.trim();
}

export function isPlaceFilterActive(filter: AssetPlaceFilter): boolean {
  return Boolean(filter.building || filter.level || filter.zone);
}

export function matchesPlaceFilter(place: PlaceFields, filter: AssetPlaceFilter): boolean {
  if (filter.building) {
    if (placeValueKey('building', place.building ?? '') !== placeValueKey('building', filter.building)) {
      return false;
    }
  }
  if (filter.level) {
    if (placeValueKey('level', place.level ?? '') !== placeValueKey('level', filter.level)) {
      return false;
    }
  }
  if (filter.zone) {
    if (placeValueKey('zone', place.zone ?? '') !== placeValueKey('zone', filter.zone)) {
      return false;
    }
  }
  return true;
}

export function uniquePlaceOptions(
  items: PlaceFields[],
  field: keyof PlaceFields,
  filter: AssetPlaceFilter,
): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    if (field !== 'building' && filter.building) {
      if (placeValueKey('building', item.building ?? '') !== placeValueKey('building', filter.building)) {
        continue;
      }
    }
    if (field === 'zone' && filter.level) {
      if (placeValueKey('level', item.level ?? '') !== placeValueKey('level', filter.level)) {
        continue;
      }
    }
    const raw = normalizePlaceValue(item[field]);
    if (!raw) continue;
    const key = placeValueKey(field, raw);
    if (!seen.has(key)) seen.set(key, placeValueLabel(field, raw));
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
