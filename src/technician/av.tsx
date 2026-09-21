import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Search, Tv } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TechnicianShell } from '@/technician/technician-shell';
import { AssetStatusActions } from '@/technician/asset-status-actions';
import { AssetStatusBadge } from '@/technician/asset-status-badge';
import { RegisterAssetActions } from '@/technician/register-asset-actions';
import { filterBySearch, useAssets } from '@/hooks/assets';
import { usePagination } from '@/hooks/use-pagination';
import {
  AssetStockSummary,
  matchesAssetStockFilter,
  type AssetStockBreakdownFilter,
} from '@/technician/asset-stock-summary';
import { AssetTablePagination } from '@/technician/asset-table-pagination';
import {
  EMPTY_PLACE_FILTER,
  formatPlaceCell,
  matchesPlaceFilter,
  PlaceTableHead,
  type AssetPlaceFilter,
  type PlaceColumnView,
} from '@/technician/asset-place-column';

export function TechnicianAvPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<AssetStockBreakdownFilter | null>(null);
  const [placeFilter, setPlaceFilter] = useState<AssetPlaceFilter>(EMPTY_PLACE_FILTER);
  const [placeColumnView, setPlaceColumnView] = useState<PlaceColumnView>('place');
  const { items, isLoading, error, updateStatus } = useAssets('av');

  const handleStockFilterClick = (filter: AssetStockBreakdownFilter) => {
    setStockFilter((current) => {
      if (current == null) return filter;
      if (current.kind === 'status' && filter.kind === 'status' && current.statusId === filter.statusId) {
        return null;
      }
      if (
        current.kind === 'building' &&
        filter.kind === 'building' &&
        current.buildingKey.toLowerCase() === filter.buildingKey.toLowerCase()
      ) {
        return null;
      }
      return filter;
    });
  };

  const filtered = useMemo(() => {
    const bySearch = filterBySearch(items, search, (item) =>
      [item.category ?? '', item.assetIdOld ?? ''].join(' '),
    );
    return bySearch
      .filter((item) => matchesAssetStockFilter(item, stockFilter))
      .filter((item) => matchesPlaceFilter(item, placeFilter));
  }, [items, search, stockFilter, placeFilter]);

  const pagination = usePagination(filtered, {
    resetKey: `${search}|${stockFilter?.kind ?? ''}|${
      stockFilter?.kind === 'status'
        ? stockFilter.statusId
        : stockFilter?.kind === 'building'
          ? stockFilter.buildingKey
          : ''
    }|${placeFilter.building ?? ''}|${placeFilter.level ?? ''}|${placeFilter.zone ?? ''}`,
  });

  const statusFilter = stockFilter?.kind === 'status' ? stockFilter.statusId : null;

  return (
    <TechnicianShell>
      <div className="mb-5 flex flex-col gap-1 sm:mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">AV equipment</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">List of AV equipment in the system</p>
      </div>

      <AssetStockSummary
        kind="av"
        items={items}
        activeFilter={stockFilter}
        onFilterClick={handleStockFilterClick}
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search asset ID, legacy ID, model, brand, serial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-[10px] pl-9"
          />
        </div>
        <RegisterAssetActions
          kind="av"
          statusFilter={statusFilter}
          onStatusFilterChange={(statusId) => {
            setStockFilter(statusId == null ? null : { kind: 'status', statusId });
          }}
          placeItems={items}
          placeFilter={placeFilter}
          onPlaceFilterChange={setPlaceFilter}
        />
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Card className="overflow-hidden rounded-[14px] border-border shadow-sm">
        <CardContent className="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent [&>th]:text-muted-foreground">
                  <TableHead className="whitespace-nowrap font-semibold">ID</TableHead>
                  <TableHead className="whitespace-nowrap font-semibold">Category</TableHead>
                  <TableHead className="min-w-[180px] font-semibold">Model</TableHead>
                  <TableHead className="whitespace-nowrap font-semibold">Brand</TableHead>
                  <TableHead className="whitespace-nowrap font-semibold">Serial</TableHead>
                  <PlaceTableHead view={placeColumnView} onViewChange={setPlaceColumnView} />
                  <TableHead className="whitespace-nowrap font-semibold">Status</TableHead>
                  <TableHead className="min-w-[140px] font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      No assets match your search or status filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.paginatedItems.map((item) => (
                    <TableRow
                      key={item.assetId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        void navigate({
                          to: '/technician/asset/$kind/$assetId',
                          params: { kind: 'av', assetId: String(item.assetId) },
                        })
                      }
                    >
                      <TableCell>
                        <Link
                          to="/technician/asset/$kind/$assetId"
                          params={{ kind: 'av', assetId: String(item.assetId) }}
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <code className="text-xs">{item.assetId}</code>
                        </Link>
                        {item.assetIdOld ? (
                          <p className="text-[10px] text-muted-foreground">{item.assetIdOld}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Tv className="h-4 w-4 text-[oklch(0.45_0.12_290)]" />
                          {item.category ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{item.model}</TableCell>
                      <TableCell className="text-muted-foreground">{item.brand ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{item.serialNum ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatPlaceCell(placeColumnView, item)}
                      </TableCell>
                      <TableCell>
                        <AssetStatusBadge statusId={item.statusId} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <AssetStatusActions
                          kind="av"
                          assetId={item.assetId}
                          statusId={item.statusId}
                          onStatusChange={updateStatus}
                          disabled={isLoading}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <AssetTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            totalItems={pagination.totalItems}
            totalLoaded={items.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </CardContent>
      </Card>
    </TechnicianShell>
  );
}
