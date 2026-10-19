import { Link } from '@tanstack/react-router';
import { Filter, PlusSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AssetKind } from '@/hooks/assets';
import { formatStatusLabel, INVENTORY_STATUSES } from '@shared/lib/inventory-schema';
import type { PlaceFields } from '@shared/lib/inventory-schema';
import { cn } from '@/lib/utils';
import {
  EMPTY_PLACE_FILTER,
  isPlaceFilterActive,
  uniquePlaceOptions,
  type AssetPlaceFilter,
} from '@/technician/asset-place-column';

type RegisterAssetActionsProps = {
  kind: AssetKind;
  statusFilter: number | null;
  onStatusFilterChange: (statusId: number | null) => void;
  placeItems?: PlaceFields[];
  placeFilter?: AssetPlaceFilter;
  onPlaceFilterChange?: (filter: AssetPlaceFilter) => void;
  leading?: ReactNode;
};

function filterButtonLabel(statusFilter: number | null, placeFilter: AssetPlaceFilter | undefined) {
  const parts: string[] = [];
  if (statusFilter != null) parts.push(formatStatusLabel(statusFilter));
  if (placeFilter?.building) parts.push(placeFilter.building);
  if (placeFilter?.level) parts.push(placeFilter.level);
  if (placeFilter?.zone) parts.push(placeFilter.zone);
  return parts.length ? parts.join(' · ') : 'Filter asset';
}

function PlaceRadioSubmenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (next: string | null) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 w-52 overflow-y-auto">
        <DropdownMenuRadioGroup
          value={value ?? 'all'}
          onValueChange={(next) => onChange(next === 'all' ? null : next)}
        >
          <DropdownMenuRadioItem value="all">All {label.toLowerCase()}s</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {option}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function RegisterAssetActions({
  kind,
  statusFilter,
  onStatusFilterChange,
  placeItems,
  placeFilter,
  onPlaceFilterChange,
  leading,
}: RegisterAssetActionsProps) {
  const place = placeFilter ?? EMPTY_PLACE_FILTER;
  const placeEnabled = placeItems != null && onPlaceFilterChange != null;
  const filterActive = statusFilter != null || (placeEnabled && isPlaceFilterActive(place));
  const radioValue = statusFilter == null ? 'all' : String(statusFilter);
  const buildings = placeEnabled ? uniquePlaceOptions(placeItems, 'building', place) : [];
  const levels = placeEnabled ? uniquePlaceOptions(placeItems, 'level', place) : [];
  const zones = placeEnabled ? uniquePlaceOptions(placeItems, 'zone', place) : [];

  return (
    <div className="ml-3 flex shrink-0 items-center gap-2">
      {leading}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={filterActive ? 'secondary' : 'outline'}
            size="sm"
            type="button"
            className={cn(filterActive && 'border-primary/30')}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden max-w-[10rem] truncate sm:inline">
              {filterButtonLabel(statusFilter, placeEnabled ? place : undefined)}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {filterActive ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  onStatusFilterChange(null);
                  onPlaceFilterChange?.(EMPTY_PLACE_FILTER);
                }}
              >
                Clear filters
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={radioValue}
            onValueChange={(value) => onStatusFilterChange(value === 'all' ? null : Number(value))}
          >
            <DropdownMenuRadioItem value="all">All statuses</DropdownMenuRadioItem>
            {INVENTORY_STATUSES.map((s) => (
              <DropdownMenuRadioItem key={s.statusId} value={String(s.statusId)}>
                {formatStatusLabel(s.statusId)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {placeEnabled ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Filter by place</DropdownMenuLabel>
              <PlaceRadioSubmenu
                label="Building"
                value={place.building}
                options={buildings}
                onChange={(building) =>
                  onPlaceFilterChange({
                    building,
                    level: building === place.building ? place.level : null,
                    zone: building === place.building ? place.zone : null,
                  })
                }
              />
              <PlaceRadioSubmenu
                label="Level"
                value={place.level}
                options={levels}
                onChange={(level) =>
                  onPlaceFilterChange({
                    ...place,
                    level,
                    zone: level === place.level ? place.zone : null,
                  })
                }
              />
              <PlaceRadioSubmenu
                label="Zone"
                value={place.zone}
                options={zones}
                onChange={(zone) => onPlaceFilterChange({ ...place, zone })}
              />
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" type="button">
            <PlusSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Register asset</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/technician/add-asset" search={{ kind }}>
              Single asset
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/technician/bulk-import" search={{ kind }}>
              Import bulk
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
