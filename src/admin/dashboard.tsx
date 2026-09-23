import { useCallback, useEffect, useState } from 'react';
import { Laptop, Network, Tv } from 'lucide-react';
import { toast } from 'sonner';
import {
  type DashboardAssetKindStats,
  type DashboardDisposedYearStats,
  type TechnicianDashboardData,
} from '@shared/lib/dashboard-schema';
import { ASSET_KIND_LABEL } from '@shared/lib/inventory-schema';
import { getTechnicianDashboardFn } from '@backend/server/operations/dashboard.functions';
import { AdminShell } from '@/admin/admin-shell';
import {
  dashboardTodayLine,
  DisposedStatCard,
  InventoryStatCard,
  RequestTimetable,
  useDashboardMonthState,
} from '@/dashboard/dashboard-widgets';

const EMPTY_ASSET_STATS: DashboardAssetKindStats = {
  store: 0,
  deploy: 0,
  total: 0,
  registeredTotal: 0,
  byStatus: [],
};

const EMPTY_DISPOSED_YEAR: DashboardDisposedYearStats = {
  year: new Date().getFullYear(),
  batchCount: 0,
  assetCount: 0,
  byKind: { laptop: 0, av: 0, network: 0 },
};

export function AdminDashboardPage() {
  const { viewMonth, isCurrentMonth, shiftMonth, goToThisMonth } = useDashboardMonthState();
  const [data, setData] = useState<TechnicianDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getTechnicianDashboardFn({ data: viewMonth }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [viewMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = data?.stats;
  const timetable = data?.timetable ?? [];
  const holidays = data?.holidays ?? [];

  return (
    <AdminShell>
      <div className="mb-5 sm:mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Dashboard</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {dashboardTodayLine('Live inventory & requests')}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <InventoryStatCard
          icon={Laptop}
          label={ASSET_KIND_LABEL.laptop}
          stats={stats?.laptop ?? EMPTY_ASSET_STATS}
          tone="lime"
          href="/admin/laptop"
        />
        <InventoryStatCard
          icon={Tv}
          label={ASSET_KIND_LABEL.av}
          stats={stats?.av ?? EMPTY_ASSET_STATS}
          tone="sky"
          href="/admin/av"
        />
        <InventoryStatCard
          icon={Network}
          label={ASSET_KIND_LABEL.network}
          stats={stats?.network ?? EMPTY_ASSET_STATS}
          tone="violet"
          href="/admin/network"
        />
        <DisposedStatCard
          stats={stats?.disposedYear ?? EMPTY_DISPOSED_YEAR}
          href="/admin/disposed"
        />
      </div>

      <div className="mb-6">
        <RequestTimetable
          entries={timetable}
          holidays={holidays}
          viewMonth={viewMonth}
          loading={loading}
          isCurrentMonth={isCurrentMonth}
          onPrevMonth={() => shiftMonth(-1)}
          onNextMonth={() => shiftMonth(1)}
          onThisMonth={() => goToThisMonth()}
        />
      </div>
      <br />
      <div className="text-right text-[11px] text-muted-foreground">
        <span className="font-medium">Created for Information Technology Department UniKL RCMP</span>
      </div>
    </AdminShell>
  );
}
