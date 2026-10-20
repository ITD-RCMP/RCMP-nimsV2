import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  PackageCheck,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import type {
  AdminDashboardData,
  AdminPeriodDays,
  AssetKindDetail,
} from '@shared/lib/admin-dashboard-schema';
import { getAdminDashboardFn } from '@backend/server/admin/admin-dashboard.functions';
import { AdminShell } from '@/admin/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InsightStatCard } from '@/components/insight-stat-card';
import { dashboardTodayLine } from '@/dashboard/dashboard-widgets';
import { cn } from '@/lib/utils';

const PERIOD_OPTIONS: { value: AdminPeriodDays; label: string }[] = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

const ASSET_KIND_OPTIONS: { value: AssetKindDetail['kind']; label: string }[] = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'av', label: 'AV' },
  { value: 'network', label: 'Network' },
];

function PeriodToggle({
  value,
  onChange,
}: {
  value: AdminPeriodDays;
  onChange: (value: AdminPeriodDays) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function StatRows({ rows }: { rows: { label: string; count: number }[] }) {
  return (
    <ul className="relative z-10 space-y-1 border-t border-border/60 pt-2">
      {rows.map(({ label, count }) => (
        <li
          key={label}
          className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <span className="min-w-0 truncate capitalize">{label}</span>
          <span className="shrink-0 tabular-nums font-medium text-foreground">{count}</span>
        </li>
      ))}
    </ul>
  );
}

function AssetKindDetails({ assetsByKind }: { assetsByKind: AssetKindDetail[] }) {
  const [kind, setKind] = useState<AssetKindDetail['kind']>('laptop');
  const detail = assetsByKind.find((a) => a.kind === kind);
  const kindLabel = ASSET_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? '';

  return (
    <div className="relative z-10 space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {ASSET_KIND_OPTIONS.map((opt) => {
          const isActive = kind === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setKind(opt.value)}
              aria-pressed={isActive}
              className={cn(
                'rounded-xl px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'count-glass-chip-active text-foreground'
                  : 'count-glass-chip text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Total {kindLabel.toLowerCase()}</span>
        <span className="text-base font-semibold tabular-nums text-foreground">{detail?.total ?? 0}</span>
      </div>
      {(detail?.byStatus ?? []).length === 0 ? (
        <p className="border-t border-border/60 pt-2 text-xs text-muted-foreground">No assets recorded.</p>
      ) : (
        <StatRows
          rows={(detail?.byStatus ?? []).map((s) => ({ label: s.statusName, count: s.count }))}
        />
      )}
      <Button variant="outline" size="sm" className="h-8 w-full rounded-lg" asChild>
        <Link to={`/admin/${kind}`}>
          Open {kindLabel} list
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function LifecyclePanel({ data }: { data: AdminDashboardData | null }) {
  const lc = data?.lifecycle;
  const stats = data?.stats;

  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Asset lifecycle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Deployed
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {lc?.deployedAssets ?? 0}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
            <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Available
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
              {lc?.availableAssets ?? 0}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Warranty exp. (30d)
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-800 dark:text-amber-300">
              {lc?.warrantiesExpiringSoon ?? 0}
            </p>
          </div>
          <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30">
            <p className="text-[10px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-400">
              Pre-disposed
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-800 dark:text-rose-300">
              {lc?.preDisposedAssets ?? 0}
            </p>
          </div>
        </div>
        <ul className="space-y-1 border-t border-border/60 pt-2">
          {[
            { label: 'On loan now', value: stats?.onLoanNow ?? 0 },
            { label: 'Due in 7 days', value: stats?.onLoanDueSoon ?? 0 },
            { label: 'Overdue returns', value: stats?.onLoanOverdue ?? 0, warn: true },
          ].map(({ label, value, warn }) => (
            <li key={label} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{label}</span>
              <span className={cn('tabular-nums font-medium', warn && value > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground')}>
                {value}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TopRequestersPanel({ data }: { data: AdminDashboardData | null }) {
  const rows = data?.topRequesters ?? [];

  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Top requesters
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests in this period.</p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 6).map((r, i) => (
              <li key={r.staffId} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 truncate font-medium text-foreground">{r.fullName}</span>
                </div>
                <span className="shrink-0 tabular-nums text-xs font-semibold text-foreground">
                  {r.requestCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentRejectionsPanel({ data }: { data: AdminDashboardData | null }) {
  const rows = data?.recentRejections ?? [];

  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          Recent rejections
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rejected requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.slice(0, 5).map((r) => (
              <li key={r.requestId} className="border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{r.requesterName}</span>
                  <Badge variant="outline" className="shrink-0 rounded-md text-[10px]">
                    #{r.requestId}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.programType} · {r.rejectedAt}
                </p>
                <p className="mt-0.5 truncate text-xs text-rose-600 dark:text-rose-400">
                  {r.rejectionReason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminDashboardPage() {
  const [periodDays, setPeriodDays] = useState<AdminPeriodDays>(30);
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (period: AdminPeriodDays) => {
    setLoading(true);
    try {
      setData(await getAdminDashboardFn({ data: { periodDays: period } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(periodDays);
  }, [load, periodDays]);

  const stats = data?.stats;

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Admin overview
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {dashboardTodayLine('System-wide stats across users, assets & requests')}
          </p>
        </div>
        <PeriodToggle value={periodDays} onChange={setPeriodDays} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <InsightStatCard
          icon={Boxes}
          label="Total assets"
          value={stats?.totalAssets ?? 0}
          hint="Laptop, AV & network combined"
          tone="lime"
        >
          <AssetKindDetails assetsByKind={data?.assetsByKind ?? []} />
        </InsightStatCard>
        <InsightStatCard
          icon={Users}
          label="Registered users"
          value={stats?.registeredUsers ?? 0}
          hint="Requester accounts"
          tone="sky"
          href="/admin/users"
        >
          <StatRows
            rows={(data?.usersByRole ?? []).map((r) => ({ label: r.roleName, count: r.count }))}
          />
        </InsightStatCard>
        <InsightStatCard
          icon={ClipboardList}
          label="Requests"
          value={stats?.requestsInPeriod ?? 0}
          hint={`Last ${periodDays} days`}
          tone="violet"
          href="/admin/request"
        >
          <StatRows
            rows={[
              { label: 'Rejected', count: stats?.rejectedInPeriod ?? 0 },
              ...(data?.programBreakdown ?? [])
                .slice(0, 3)
                .map((p) => ({ label: p.programType, count: p.count })),
            ]}
          />
        </InsightStatCard>
        <InsightStatCard
          icon={PackageCheck}
          label="On loan now"
          value={stats?.onLoanNow ?? 0}
          hint="Checked out, not yet returned"
          tone="amber"
          href="/admin/request"
        >
          <StatRows
            rows={[
              { label: 'Due in 7 days', count: stats?.onLoanDueSoon ?? 0 },
              { label: 'Overdue', count: stats?.onLoanOverdue ?? 0 },
            ]}
          />
        </InsightStatCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopRequestersPanel data={data} />
        <RecentRejectionsPanel data={data} />
        <LifecyclePanel data={data} />
      </div>

      {loading && !data ? (
        <p className="text-center text-sm text-muted-foreground">Loading admin overview…</p>
      ) : null}

      <br />
      <div className="text-right text-[11px] text-muted-foreground">
        <span className="font-medium">Created for Information Technology Department UniKL RCMP</span>
      </div>
    </AdminShell>
  );
}
