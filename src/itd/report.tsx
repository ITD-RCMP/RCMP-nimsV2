import { useMemo, useState } from 'react';
import {
  Check,
  Download,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Laptop,
  Loader2,
  Network,
  Tv,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { AssetKind } from '@shared/lib/inventory-schema';
import { ASSET_KIND_LABEL, INVENTORY_STATUSES, formatStatusLabel } from '@shared/lib/inventory-schema';
import { readTechnicianSession } from '@shared/lib/auth-session';
import type {
  TechnicianAssetExportKind,
  TechnicianReportPdfFilters,
  TechnicianReportRequestFilter,
  ReportPdfColumn,
} from '@shared/lib/technician-export-schema';
import {
  DEFAULT_REPORT_PDF_COLUMNS,
  REPORT_PDF_COLUMNS,
} from '@shared/lib/technician-export-schema';
import { downloadCsvFile } from '@/hooks/bulkImport';
import {
  exportTechnicianAssetCsvFn,
  generateAssetReportPdfFn,
} from '@backend/server/admin/technician-export.functions';
import { TechnicianShell } from '@/technician/technician-shell';

const CSV_EXPORTS: {
  kind: TechnicianAssetExportKind;
  title: string;
  description: string;
  icon: typeof Laptop;
}[] = [
  {
    kind: 'laptop',
    title: 'Laptop / Desktop',
    description: 'Full laptop and desktop inventory export',
    icon: Laptop,
  },
  {
    kind: 'av',
    title: 'AV equipment',
    description: 'Full AV inventory export',
    icon: Tv,
  },
  {
    kind: 'network',
    title: 'Network equipment',
    description: 'Full network inventory export',
    icon: Network,
  },
];

const REQUEST_FILTER_OPTIONS: {
  value: TechnicianReportRequestFilter;
  title: string;
  description: string;
}[] = [
  { value: 'all', title: 'All assets', description: 'Include every asset regardless of requests' },
  {
    value: 'request-only',
    title: 'Request-related only',
    description: 'Assets in request flow statuses or linked to an open user request',
  },
  {
    value: 'non-request',
    title: 'Non-request only',
    description: 'Exclude assets tied to any user request',
  },
];

const ALL_KINDS: AssetKind[] = ['laptop', 'av', 'network'];
const ALL_STATUS_IDS = INVENTORY_STATUSES.map((s) => s.statusId);
const ALL_COLUMN_KEYS = REPORT_PDF_COLUMNS.map((c) => c.key);

function downloadPdfFromBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function FilterChip({
  selected,
  onToggle,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
        selected
          ? 'border-[oklch(0.45_0.12_290)]/40 bg-lavender/20 text-[oklch(0.4_0.12_290)]'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      <Check className={cn('h-3.5 w-3.5', selected ? 'opacity-100' : 'opacity-0')} />
      {children}
    </button>
  );
}

function StepHeading({
  step,
  title,
  hint,
  action,
}: {
  step: number;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lavender/20 text-xs font-bold text-[oklch(0.4_0.12_290)]">
          {step}
        </span>
        <div>
          <p className="text-sm font-semibold leading-6">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export function TechnicianReportPage() {
  const [csvLoading, setCsvLoading] = useState<TechnicianAssetExportKind | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState<AssetKind[]>(ALL_KINDS);
  const [selectedStatusIds, setSelectedStatusIds] = useState<number[]>(ALL_STATUS_IDS);
  const [selectedColumns, setSelectedColumns] = useState<ReportPdfColumn[]>(DEFAULT_REPORT_PDF_COLUMNS);
  const [requestFilter, setRequestFilter] = useState<TechnicianReportRequestFilter>('all');

  const allKindsSelected = selectedKinds.length === ALL_KINDS.length;
  const allStatusesSelected = selectedStatusIds.length === ALL_STATUS_IDS.length;
  const allColumnsSelected = selectedColumns.length === ALL_COLUMN_KEYS.length;
  const defaultColumnsSelected =
    selectedColumns.length === DEFAULT_REPORT_PDF_COLUMNS.length &&
    DEFAULT_REPORT_PDF_COLUMNS.every((key) => selectedColumns.includes(key));

  const pdfFilters = useMemo<TechnicianReportPdfFilters>(
    () => ({
      kinds: selectedKinds,
      statusIds: allStatusesSelected ? [] : selectedStatusIds,
      requestFilter,
      columns: selectedColumns,
    }),
    [selectedKinds, selectedStatusIds, allStatusesSelected, requestFilter, selectedColumns],
  );

  const toggleKind = (kind: AssetKind) => {
    setSelectedKinds((prev) => {
      if (!prev.includes(kind)) return [...prev, kind];
      const next = prev.filter((k) => k !== kind);
      return next.length ? next : prev;
    });
  };

  const toggleStatus = (statusId: number) => {
    setSelectedStatusIds((prev) => {
      if (!prev.includes(statusId)) return [...prev, statusId];
      const next = prev.filter((id) => id !== statusId);
      return next.length ? next : prev;
    });
  };

  const toggleColumn = (column: ReportPdfColumn, checked: boolean) => {
    setSelectedColumns((prev) => {
      if (checked) return prev.includes(column) ? prev : [...prev, column];
      const next = prev.filter((key) => key !== column);
      return next.length ? next : prev;
    });
  };

  const handleCsvExport = async (kind: TechnicianAssetExportKind) => {
    const tech = readTechnicianSession();
    if (!tech) return;
    setCsvLoading(kind);
    try {
      const result = await exportTechnicianAssetCsvFn({ data: { kind } });
      downloadCsvFile(result.filename, result.body);
      toast.success(`Downloaded ${result.filename}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'CSV export failed');
    } finally {
      setCsvLoading(null);
    }
  };

  const handlePdfExport = async () => {
    const tech = readTechnicianSession();
    if (!tech) return;
    if (!selectedKinds.length) {
      toast.error('Select at least one asset type');
      return;
    }
    if (!selectedColumns.length) {
      toast.error('Select at least one report column');
      return;
    }
    setPdfLoading(true);
    try {
      const result = await generateAssetReportPdfFn({
        data: { filters: pdfFilters },
      });
      downloadPdfFromBase64(result.base64, result.filename);
      toast.success(`Downloaded ${result.filename} (${result.count} assets)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setPdfLoading(false);
    }
  };

  const requestFilterLabel = REQUEST_FILTER_OPTIONS.find((o) => o.value === requestFilter)?.title;

  return (
    <TechnicianShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Report</h1>
        <p className="text-sm text-muted-foreground">
          Export full asset data as CSV or generate a filtered inventory PDF.
        </p>
      </div>

      <Tabs defaultValue="csv">
        <TabsList className="mb-4 h-11 rounded-xl p-1">
          <TabsTrigger value="csv" className="gap-2 rounded-lg px-4">
            <FileSpreadsheet className="h-4 w-4" />
            CSV export
          </TabsTrigger>
          <TabsTrigger value="pdf" className="gap-2 rounded-lg px-4">
            <FileBarChart className="h-4 w-4" />
            PDF report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="csv">
          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Full inventory downloads</CardTitle>
              <CardDescription>
                Each file includes every column from the asset table, ready for Excel or reporting tools.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {CSV_EXPORTS.map(({ kind, title, description, icon: Icon }) => (
                <div key={kind} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-lavender/15 text-[oklch(0.45_0.12_290)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="truncate text-sm text-muted-foreground">{description}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 rounded-lg"
                    disabled={csvLoading !== null}
                    onClick={() => void handleCsvExport(kind)}
                  >
                    {csvLoading === kind ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Card className="rounded-2xl border-border shadow-sm">
              <CardContent className="space-y-6 p-6">
                <div className="space-y-3">
                  <StepHeading
                    step={1}
                    title="Asset types"
                    hint="Choose which inventories go into the report"
                    action={
                      !allKindsSelected && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setSelectedKinds(ALL_KINDS)}
                        >
                          Select all
                        </Button>
                      )
                    }
                  />
                  <div className="flex flex-wrap gap-2 pl-9">
                    {ALL_KINDS.map((kind) => (
                      <FilterChip
                        key={kind}
                        selected={selectedKinds.includes(kind)}
                        onToggle={() => toggleKind(kind)}
                      >
                        {ASSET_KIND_LABEL[kind]}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <StepHeading
                    step={2}
                    title="Asset status"
                    hint="Keep all selected for a complete inventory"
                    action={
                      !allStatusesSelected && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setSelectedStatusIds(ALL_STATUS_IDS)}
                        >
                          Select all
                        </Button>
                      )
                    }
                  />
                  <div className="flex flex-wrap gap-2 pl-9">
                    {INVENTORY_STATUSES.map((status) => (
                      <FilterChip
                        key={status.statusId}
                        selected={selectedStatusIds.includes(status.statusId)}
                        onToggle={() => toggleStatus(status.statusId)}
                      >
                        {formatStatusLabel(status.statusId)}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <StepHeading
                    step={3}
                    title="Report columns"
                    hint="Pick the columns to print in the PDF table"
                    action={
                      <div className="flex gap-1">
                        {!defaultColumnsSelected && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setSelectedColumns(DEFAULT_REPORT_PDF_COLUMNS)}
                          >
                            Reset default
                          </Button>
                        )}
                        {!allColumnsSelected && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setSelectedColumns(ALL_COLUMN_KEYS)}
                          >
                            Select all
                          </Button>
                        )}
                      </div>
                    }
                  />
                  <div className="grid grid-cols-1 gap-2 pl-9 sm:grid-cols-2">
                    {REPORT_PDF_COLUMNS.map((column) => {
                      const checked = selectedColumns.includes(column.key);
                      return (
                        <label
                          key={column.key}
                          className={cn(
                            'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                            checked
                              ? 'border-[oklch(0.45_0.12_290)]/40 bg-lavender/10'
                              : 'border-border hover:bg-muted/50',
                          )}
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(value) => toggleColumn(column.key, value === true)}
                          />
                          <span>
                            <span className="font-medium">{column.label}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {column.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="pl-9 text-xs text-muted-foreground">
                    Deploy exports use Handled by / Handover to. In-stock exports use History. Request is
                    optional for borrow-request assets only.
                  </p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <StepHeading
                    step={4}
                    title="Request scope"
                    hint="Limit the report by request involvement"
                  />
                  <RadioGroup
                    value={requestFilter}
                    onValueChange={(value) => setRequestFilter(value as TechnicianReportRequestFilter)}
                    className="grid grid-cols-1 gap-2 pl-9 sm:grid-cols-3"
                  >
                    {REQUEST_FILTER_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors',
                          requestFilter === option.value
                            ? 'border-[oklch(0.45_0.12_290)]/40 bg-lavender/10'
                            : 'border-border hover:bg-muted/50',
                        )}
                      >
                        <RadioGroupItem value={option.value} className="mt-0.5" />
                        <span>
                          <span className="block text-sm font-medium">{option.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border shadow-sm lg:sticky lg:top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Report summary</CardTitle>
                <CardDescription>Review your selection before generating.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Asset types
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedKinds.map((kind) => (
                      <Badge key={kind} variant="secondary" className="font-normal">
                        {ASSET_KIND_LABEL[kind]}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
                  <p className="text-sm">
                    {allStatusesSelected
                      ? 'All statuses'
                      : `${selectedStatusIds.length} of ${ALL_STATUS_IDS.length} statuses`}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Columns</Label>
                  <p className="text-sm">
                    {selectedColumns.length} of {ALL_COLUMN_KEYS.length} columns
                    {defaultColumnsSelected ? ' (default)' : ''}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Request scope
                  </Label>
                  <p className="text-sm">{requestFilterLabel}</p>
                </div>

                <Separator />

                <Button
                  type="button"
                  className="w-full rounded-lg"
                  disabled={pdfLoading || !selectedKinds.length || !selectedColumns.length}
                  onClick={() => void handlePdfExport()}
                >
                  {pdfLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  Generate PDF
                </Button>
                <p className="text-xs text-muted-foreground">
                  The PDF opens as a download and lists every asset matching the filters above.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </TechnicianShell>
  );
}
