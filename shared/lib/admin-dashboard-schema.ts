import type { TechnicianDashboardCharts } from '@shared/lib/dashboard-schema';

export type AdminPeriodDays = 7 | 30 | 90;

export type AdminDashboardStats = {
  totalAssets: number;
  registeredUsers: number;
  requestsInPeriod: number;
  rejectedInPeriod: number;
  onLoanNow: number;
  onLoanDueSoon: number;
  onLoanOverdue: number;
};

export type ProgramCountSlice = {
  programType: string;
  count: number;
};

export type RoleCountSlice = {
  roleName: string;
  count: number;
};

export type TopRequesterRow = {
  staffId: string;
  fullName: string;
  requestCount: number;
};

export type RecentRejectionRow = {
  requestId: number;
  rejectedAt: string;
  requesterName: string;
  programType: string;
  rejectionReason: string;
};

export type LifecycleSnapshot = {
  deployedAssets: number;
  availableAssets: number;
  preDisposedAssets: number;
  warrantiesExpiringSoon: number;
};

export type AssetKindStatusCount = {
  statusName: string;
  count: number;
};

export type AssetKindDetail = {
  kind: 'laptop' | 'av' | 'network';
  total: number;
  byStatus: AssetKindStatusCount[];
};

export type AdminDashboardData = {
  periodDays: AdminPeriodDays;
  stats: AdminDashboardStats;
  charts: TechnicianDashboardCharts;
  assetsByKind: AssetKindDetail[];
  programBreakdown: ProgramCountSlice[];
  usersByRole: RoleCountSlice[];
  topRequesters: TopRequesterRow[];
  recentRejections: RecentRejectionRow[];
  lifecycle: LifecycleSnapshot;
};
