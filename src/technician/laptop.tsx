import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Box, Laptop as LaptopIcon, Monitor, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
	EMPTY_PLACE_FILTER,
	matchesPlaceFilter,
	type AssetPlaceFilter,
} from '@/technician/asset-place-column';
import { filterBySearch, filterByStatus, useAssets } from '@/hooks/assets';
import {
	isDesktopCategory,
	isLeasingCategory,
	isNotebookCategory,
	isOtherLaptopCategory,
	isOwnedDesktopCategory,
	isOwnedNotebookCategory,
	LAPTOP_CATEGORY_OPTIONS,
	LAPTOP_CATEGORY_OTHERS,
	normalizeCategory,
} from '@/hooks/assetid-generator';
import { usePagination } from '@/hooks/use-pagination';
import { STATUS_ID } from '@shared/lib/asset-status-actions';
import type { LaptopAsset, LaptopAssignmentBucket } from '@shared/lib/inventory-schema';
import { matchesAssignmentBucket } from '@shared/lib/inventory-schema';
import { AssetLifespanCell } from '@/components/asset-lifespan-cell';
import {
	LaptopAssetStockSummary,
	type LaptopFormFactor,
	type LaptopFormFactorFilter,
} from '@/technician/laptop-stock-summary';
import { AssetTablePagination } from '@/technician/asset-table-pagination';

type LaptopCategoryView = 'all' | (typeof LAPTOP_CATEGORY_OPTIONS)[number] | typeof LAPTOP_CATEGORY_OTHERS;

const LAPTOP_CATEGORY_VIEWS: LaptopCategoryView[] = ['all', ...LAPTOP_CATEGORY_OPTIONS, LAPTOP_CATEGORY_OTHERS];

function laptopCategoryHeaderLabel(view: LaptopCategoryView): string {
	return view === 'all' ? 'Category' : view;
}

function nextLaptopCategoryView(view: LaptopCategoryView): LaptopCategoryView {
	const index = LAPTOP_CATEGORY_VIEWS.indexOf(view);
	return LAPTOP_CATEGORY_VIEWS[(index + 1) % LAPTOP_CATEGORY_VIEWS.length];
}

function matchesLaptopCategory(category: string | null, view: LaptopCategoryView): boolean {
	if (view === 'all') return true;
	if (view === LAPTOP_CATEGORY_OTHERS) return isOtherLaptopCategory(category);
	return normalizeCategory(category ?? '') === normalizeCategory(view);
}

function handoverRecipient(
	asset: LaptopAsset,
): { name: string; kind: string } | null {
	const staff = asset.recipientName?.trim();
	if (staff) {
		const division = asset.recipientDivision?.trim();
		return {
			name: staff,
			kind: division ? `Staff · ${division}` : 'Staff',
		};
	}
	const handler = asset.placeHandler?.trim();
	if (handler) return { name: handler, kind: 'Handler' };
	return null;
}

function HandoverToCell({ asset }: { asset: LaptopAsset }) {
	const recipient = handoverRecipient(asset);
	if (!recipient) {
		return <span className="text-muted-foreground">—</span>;
	}
	return (
		<div className="min-w-0">
			<p className="truncate text-sm font-medium text-foreground">{recipient.name}</p>
			<p className="text-[11px] text-muted-foreground">{recipient.kind}</p>
		</div>
	);
}

function formatRegisteredAt(value: string | null): string {
	if (!value) return '—';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function matchesFormFactor(
	category: string | null,
	formFactorFilter: LaptopFormFactorFilter,
): boolean {
	if (formFactorFilter === 'all') return true;
	if (formFactorFilter === 'leasing') return isLeasingCategory(category);
	if (formFactorFilter === 'laptop') return isOwnedNotebookCategory(category);
	if (formFactorFilter === 'other') return isOtherLaptopCategory(category);
	return isOwnedDesktopCategory(category);
}

export function TechnicianLaptopPage() {
	const navigate = useNavigate();
	const [search, setSearch] = useState('');
	const [statusFilter, setStatusFilter] = useState<number | null>(null);
	const [placeFilter, setPlaceFilter] = useState<AssetPlaceFilter>(EMPTY_PLACE_FILTER);
	const [formFactorFilter, setFormFactorFilter] = useState<LaptopFormFactorFilter>('all');
	const [divisionFilter, setDivisionFilter] = useState<LaptopAssignmentBucket | null>(null);
	const [otherCategoryFilter, setOtherCategoryFilter] = useState<string | null>(null);
	const [categoryView, setCategoryView] = useState<LaptopCategoryView>('all');
	const { items, isLoading, error, updateStatus } = useAssets('laptop');

	const handleStatusMetricClick = (formFactor: LaptopFormFactor, statusId: number) => {
		if (statusFilter === statusId && formFactorFilter === formFactor) {
			setStatusFilter(null);
			setFormFactorFilter('all');
			setOtherCategoryFilter(null);
			return;
		}
		setFormFactorFilter(formFactor);
		setStatusFilter(statusId);
		setDivisionFilter(null);
		setOtherCategoryFilter(null);
	};

	const handleDivisionMetricClick = (
		formFactor: LaptopFormFactor,
		division: LaptopAssignmentBucket,
	) => {
		if (divisionFilter === division && formFactorFilter === formFactor) {
			setDivisionFilter(null);
			setFormFactorFilter('all');
			setOtherCategoryFilter(null);
			return;
		}
		setFormFactorFilter(formFactor);
		setDivisionFilter(division);
		setStatusFilter(null);
		setOtherCategoryFilter(null);
	};

	const handleOtherCategoryClick = (category: string) => {
		if (
			otherCategoryFilter &&
			normalizeCategory(otherCategoryFilter) === normalizeCategory(category) &&
			formFactorFilter === 'other'
		) {
			setOtherCategoryFilter(null);
			setFormFactorFilter('all');
			return;
		}
		setFormFactorFilter('other');
		setOtherCategoryFilter(category);
		setStatusFilter(null);
		setDivisionFilter(null);
		setCategoryView('all');
	};

	const filtered = useMemo(() => {
		const byFormFactor = items.filter((item) => matchesFormFactor(item.category, formFactorFilter));
		const byOtherCategory =
			formFactorFilter === 'other' && otherCategoryFilter
				? byFormFactor.filter(
						(item) => normalizeCategory(item.category ?? '') === normalizeCategory(otherCategoryFilter),
					)
				: byFormFactor;
		const byDivision =
			divisionFilter == null
				? byOtherCategory
				: byOtherCategory.filter((item) => matchesAssignmentBucket(item, divisionFilter));
		const byCategory = byDivision.filter((item) => matchesLaptopCategory(item.category, categoryView));
		const bySearch = filterBySearch(byCategory, search, (c) =>
			[c.category ?? '', c.recipientName ?? '', c.placeHandler ?? '', c.registeredBy ?? '', c.proposedBy ?? ''].join(' '),
		);
		const byStatus = filterByStatus(bySearch, statusFilter);
		return byStatus.filter((item) =>
			matchesPlaceFilter(
				{
					building: item.placeBuilding,
					level: item.placeLevel,
					zone: item.placeZone,
				},
				placeFilter,
			),
		);
	}, [items, search, statusFilter, placeFilter, categoryView, formFactorFilter, divisionFilter, otherCategoryFilter]);

	const pagination = usePagination(filtered, {
		resetKey: `${search}|${statusFilter ?? ''}|${placeFilter.building ?? ''}|${placeFilter.level ?? ''}|${placeFilter.zone ?? ''}|${categoryView}|${formFactorFilter}|${divisionFilter ?? ''}|${otherCategoryFilter ?? ''}`,
	});

	const showHandoverColumn =
		statusFilter === STATUS_ID.DEPLOY || divisionFilter != null || otherCategoryFilter != null;
	const showLifespanColumn = statusFilter === STATUS_ID.RETURN;
	const showRegistrationColumns = statusFilter === STATUS_ID.NEW;
	const showProposalColumns = statusFilter === STATUS_ID.PRE_DISPOSED;
	const showActionColumn = !showProposalColumns;
	const tableColSpan =
		6 +
		(showHandoverColumn ? 1 : 0) +
		(showLifespanColumn ? 1 : 0) +
		(showRegistrationColumns ? 2 : 0) +
		(showProposalColumns ? 2 : 0) +
		(showActionColumn ? 1 : 0);
	const nextCategoryView = nextLaptopCategoryView(categoryView);

	return (
		<TechnicianShell>
			<div className="mb-5 flex flex-col gap-1 sm:mb-6">
				<h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Laptop &amp; Desktop</h1>
				<p className="text-xs text-muted-foreground sm:text-sm">List of laptops and desktops in the system</p>
			</div>

			<LaptopAssetStockSummary
				items={items}
				statusFilter={statusFilter}
				formFactorFilter={formFactorFilter}
				divisionFilter={divisionFilter}
				otherCategoryFilter={otherCategoryFilter}
				onStatusClick={handleStatusMetricClick}
				onDivisionClick={handleDivisionMetricClick}
				onOtherCategoryClick={handleOtherCategoryClick}
			/>

			<div className="mb-4 flex items-center justify-between">
				<div className="relative w-full sm:max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search asset ID, model, brand, serial…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-10 rounded-[10px] pl-9"
					/>
				</div>
				<RegisterAssetActions
					kind="laptop"
					statusFilter={statusFilter}
					onStatusFilterChange={(statusId) => {
						setStatusFilter(statusId);
						if (statusId == null) {
							setFormFactorFilter('all');
							setDivisionFilter(null);
							setOtherCategoryFilter(null);
						}
					}}
					placeItems={items.map((item) => ({
						building: item.placeBuilding,
						level: item.placeLevel,
						zone: item.placeZone,
					}))}
					placeFilter={placeFilter}
					onPlaceFilterChange={setPlaceFilter}
					leading={
						<Button size="sm" variant="outline" asChild>
							<Link to="/technician/handover-staff">
								<Users className="h-4 w-4" />
								<span className="hidden sm:inline">Handover Directory</span>
							</Link>
						</Button>
					}
				/>
			</div>

			{error && (
				<p className="mb-4 text-sm text-destructive">
					{error} — check system database is running and `.env` matches database/schema.sql
				</p>
			)}

			<Card className="overflow-hidden rounded-[14px] border-border shadow-sm">
				<CardContent className="p-0 sm:p-0">
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent [&>th]:text-muted-foreground">
									<TableHead className="whitespace-nowrap font-semibold">ID</TableHead>
									<TableHead className="whitespace-nowrap font-semibold">
										<button
											type="button"
											className="inline-flex items-center gap-1 rounded-[6px] px-1 -mx-1 text-left hover:text-foreground hover:underline underline-offset-2"
											title={
												nextCategoryView === 'all'
													? 'Show all categories'
													: `Show ${laptopCategoryHeaderLabel(nextCategoryView).toLowerCase()} only`
											}
											onClick={() => setCategoryView(nextCategoryView)}
										>
											{laptopCategoryHeaderLabel(categoryView)}
										</button>
									</TableHead>
									<TableHead className="min-w-[180px] font-semibold">Model</TableHead>
									<TableHead className="whitespace-nowrap font-semibold">Brand</TableHead>
									<TableHead className="whitespace-nowrap font-semibold">Serial</TableHead>
									{showHandoverColumn ? (
										<TableHead className="min-w-[160px] font-semibold">Handover to</TableHead>
									) : null}
									{showLifespanColumn ? (
										<TableHead className="min-w-[180px] font-semibold">Lifespan</TableHead>
									) : null}
									{showRegistrationColumns ? (
										<>
											<TableHead className="min-w-[160px] font-semibold">Registered at</TableHead>
											<TableHead className="min-w-[160px] font-semibold">Registered by</TableHead>
										</>
									) : null}
									{showProposalColumns ? (
										<>
											<TableHead className="min-w-[160px] font-semibold">Proposed by</TableHead>
											<TableHead className="min-w-[160px] font-semibold">Proposed at</TableHead>
										</>
									) : null}
									<TableHead className="whitespace-nowrap font-semibold">Status</TableHead>
									{showActionColumn ? (
										<TableHead className="min-w-[140px] font-semibold">Action</TableHead>
									) : null}
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoading ? (
									<TableRow>
										<TableCell colSpan={tableColSpan} className="py-12 text-center text-sm text-muted-foreground">
											Loading…
										</TableCell>
									</TableRow>
								) : filtered.length === 0 ? (
									<TableRow>
										<TableCell colSpan={tableColSpan} className="py-12 text-center text-sm text-muted-foreground">
											No assets match your search, status, division, form factor, or category filter.
										</TableCell>
									</TableRow>
								) : (
									pagination.paginatedItems.map((c) => (
										<TableRow
											key={c.assetId}
											className="cursor-pointer hover:bg-muted/50"
											onClick={() =>
												void navigate({
													to: '/technician/asset/$kind/$assetId',
													params: { kind: 'laptop', assetId: String(c.assetId) },
												})
											}
										>
											<TableCell>
												<Link
													to="/technician/asset/$kind/$assetId"
													params={{ kind: 'laptop', assetId: String(c.assetId) }}
													className="text-primary underline-offset-2 hover:underline"
													onClick={(e) => e.stopPropagation()}
												>
													<code className="text-xs">{c.assetId}</code>
												</Link>
											</TableCell>
											<TableCell>
												{isDesktopCategory(c.category) ? (
													<span className="inline-flex items-center gap-1.5 text-sm">
														<Monitor className="h-4 w-4 text-[oklch(0.45_0.12_290)]" />
														{c.category}
													</span>
												) : isNotebookCategory(c.category) ? (
													<span className="inline-flex items-center gap-1.5 text-sm">
														<LaptopIcon className="h-4 w-4 text-[oklch(0.45_0.12_290)]" />
														{c.category ?? 'Laptop'}
													</span>
												) : (
													<span className="inline-flex items-center gap-1.5 text-sm">
														<Box className="h-4 w-4 text-[oklch(0.45_0.12_290)]" />
														{c.category ?? '—'}
													</span>
												)}
											</TableCell>
											<TableCell className="font-medium text-foreground">{c.model}</TableCell>
											<TableCell className="text-muted-foreground">{c.brand ?? '—'}</TableCell>
											<TableCell className="text-muted-foreground">{c.serialNum ?? '—'}</TableCell>
											{showHandoverColumn ? (
												<TableCell>
													<HandoverToCell asset={c} />
												</TableCell>
											) : null}
											{showLifespanColumn ? (
												<TableCell>
													<AssetLifespanCell
														poDate={c.poDate}
														doDate={c.doDate}
														assetId={c.assetId}
													/>
												</TableCell>
											) : null}
											{showRegistrationColumns ? (
												<>
													<TableCell className="whitespace-nowrap text-sm text-muted-foreground">
														{formatRegisteredAt(c.registeredAt)}
													</TableCell>
													<TableCell className="text-sm font-medium text-foreground">
														{c.registeredBy?.trim() || '—'}
													</TableCell>
												</>
											) : null}
											{showProposalColumns ? (
												<>
													<TableCell className="max-w-[12rem] truncate text-sm font-medium text-foreground">
														{c.proposedBy?.trim() || '—'}
													</TableCell>
													<TableCell className="whitespace-nowrap text-sm text-muted-foreground">
														{formatRegisteredAt(c.proposedAt)}
													</TableCell>
												</>
											) : null}
											<TableCell>
												<AssetStatusBadge statusId={c.statusId} />
											</TableCell>
											{showActionColumn ? (
												<TableCell onClick={(e) => e.stopPropagation()}>
													<AssetStatusActions
														kind="laptop"
														assetId={c.assetId}
														statusId={c.statusId}
														onStatusChange={updateStatus}
														disabled={isLoading}
													/>
												</TableCell>
											) : null}
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
