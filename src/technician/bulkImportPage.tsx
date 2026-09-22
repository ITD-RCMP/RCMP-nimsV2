import { useRef, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown, Download, Laptop, Network, Tv, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { TechnicianShell } from '@/technician/technician-shell';
import { IMPORT_DATE_FORMAT_HINT, PURCHASE_DATE_COLUMNS } from '@shared/lib/date-format';
import { INVENTORY_STATUSES, formatStatusLabel } from '@shared/lib/inventory-schema';
import { ASSET_KIND_LABEL, ASSET_LIST_PATH, type AssetKind } from '@/hooks/assets';
import {
  ACC_CODE_OPTIONS,
  BULK_IMPORT_REQUIRED,
  BULK_IMPORT_STATUS_DEPLOY,
  bulkImportDeployColumns,
  bulkImportDeployRequiredColumns,
  downloadBulkImportTemplate,
  excelFileToCsv,
  LAPTOP_CATEGORY_OPTIONS,
  useBulkImport,
} from '@/hooks/bulkImport';
import { ASSET_ID_PREFIX, getLaptopAssetIdPrefix } from '@/hooks/assetid-generator';

type BulkImportSearch = { kind?: AssetKind };

const KIND_OPTIONS: { kind: AssetKind; icon: typeof Laptop; description: string }[] = [
  { kind: 'laptop', icon: Laptop, description: 'Import laptops & desktops from CSV' },
  { kind: 'av', icon: Tv, description: 'Import AV gear from CSV' },
  { kind: 'network', icon: Network, description: 'Import network hardware from CSV' },
];

function isAssetKind(value: unknown): value is AssetKind {
  return value === 'laptop' || value === 'av' || value === 'network';
}

export function TechnicianBulkImportPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as BulkImportSearch;
  const presetKind = isAssetKind(search.kind) ? search.kind : undefined;
  const [selectedKind, setSelectedKind] = useState<AssetKind | null>(presetKind ?? null);
  const kind = selectedKind ?? presetKind ?? null;

  if (!kind) {
    return (
      <TechnicianShell>
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Bulk import</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Choose a category, then upload a CSV with the matching columns.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {KIND_OPTIONS.map(({ kind: k, icon: Icon, description }) => (
            <Card
              key={k}
              className="rounded-[14px] border-border/80 shadow-sm"
            >
              <CardHeader className="pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-lavender/15 text-[oklch(0.45_0.12_290)]">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{ASSET_KIND_LABEL[k]}</CardTitle>
                <CardDescription className="text-xs">{description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-[8px]"
                  type="button"
                  onClick={() => setSelectedKind(k)}
                >
                  Continue
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </TechnicianShell>
    );
  }

  return (
    <TechnicianShell>
      <BulkImportWorkspace
        kind={kind}
        onBack={() => {
          setSelectedKind(null);
          void navigate({ to: '/technician/bulk-import', search: {} });
        }}
        onImported={(importedKind, count) => {
          toast.success(`Imported ${count} ${ASSET_KIND_LABEL[importedKind].toLowerCase()} record(s)`);
          void navigate({ to: ASSET_LIST_PATH[importedKind] });
        }}
      />
    </TechnicianShell>
  );
}

function BulkImportWorkspace({
  kind,
  onBack,
  onImported,
}: {
  kind: AssetKind;
  onBack: () => void;
  onImported: (kind: AssetKind, count: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const { preview, isParsing, parseText, clearPreview, commit, getTemplate, columns } = useBulkImport();
  const requiredSet = new Set(BULK_IMPORT_REQUIRED[kind]);
  const deployRequiredSet = new Set(bulkImportDeployRequiredColumns(kind));
  const deployLabel = kind === 'laptop' ? 'Handover' : 'Deploy';

  const downloadTemplate = (variant: 'asset' | 'deploy' | 'place') => {
    void downloadBulkImportTemplate(kind, variant).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'The template could not be downloaded.');
    });
  };

  const handleParse = () => {
    if (!csvText.trim()) {
      toast.error('The CSV is empty. Paste content or load the sample file first.');
      return;
    }
    const result = parseText(kind, csvText);
    if (result.errorCount > 0 && result.validCount === 0) {
      toast.error('No valid rows found. Review and fix the errors listed below.');
    } else if (result.errorCount > 0) {
      toast.warning(`${result.validCount} valid, ${result.errorCount} row(s) with errors`);
    } else {
      toast.success(`${result.validCount} row(s) ready to import`);
    }
  };

  const handleImport = async () => {
    if (!preview || preview.validCount === 0) {
      toast.error('Parse the CSV and resolve any errors before importing.');
      return;
    }
    setImporting(true);
    try {
      const count = await commit();
      onImported(kind, count);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The import could not be completed. Try again.';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const previewRows =
    kind === 'laptop'
      ? preview?.laptopRows
      : kind === 'av'
        ? preview?.avRows
        : preview?.networkRows;

  const loadFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv') || file.type === 'text/csv';
    const isExcel =
      name.endsWith('.xlsx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (!isCsv && !isExcel) {
      toast.error('Only .xlsx and .csv files are supported.');
      return;
    }
    try {
      const text = isExcel ? await excelFileToCsv(file) : await file.text();
      setCsvText(text);
      clearPreview();
      toast.message('File loaded — click Parse preview');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The file could not be read.');
    }
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" type="button" className="-ml-2 mb-2 gap-1.5" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Change category
          </Button>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Bulk import — {ASSET_KIND_LABEL[kind]}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Please follow the template and headers to ensure the data is imported correctly.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-[8px]" asChild>
          <Link to={ASSET_LIST_PATH[kind]}>Cancel</Link>
        </Button>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Card className="rounded-[14px] border-border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                  1
                </span>
                <div className="space-y-1">
                  <CardTitle className="text-base">Prepare your CSV</CardTitle>
                  <CardDescription>
                    Leave <code className="text-[11px]">asset_id</code> blank to auto-generate, or enter{' '}
                    <code className="text-[11px]">1226001 (RMK)</code>.{' '}
                    <code className="text-[11px]">tagging</code> is optional.
                  </CardDescription>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-[8px] gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Template
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5"
                    onSelect={() => downloadTemplate('asset')}
                  >
                    <span className="font-medium">New asset</span>
                    <span className="text-[11px] text-muted-foreground">
                      Asset columns only — no {deployLabel.toLowerCase()} record
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5"
                    onSelect={() => downloadTemplate('deploy')}
                  >
                    <span className="font-medium">{deployLabel}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {kind === 'laptop'
                        ? `Asset columns plus staff handover (employee_no, status ${BULK_IMPORT_STATUS_DEPLOY})`
                        : `Asset columns plus deploy columns (status ${BULK_IMPORT_STATUS_DEPLOY})`}
                    </span>
                  </DropdownMenuItem>
                  {kind === 'laptop' ? (
                    <DropdownMenuItem
                      className="flex-col items-start gap-0.5"
                      onSelect={() => downloadTemplate('place')}
                    >
                      <span className="font-medium">Deploy to facility</span>
                      <span className="text-[11px] text-muted-foreground">
                        Asset columns plus building, level, zone, handler (status{' '}
                        {BULK_IMPORT_STATUS_DEPLOY})
                      </span>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-[10px] border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Columns
                </p>
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <span>
                    <span className="font-semibold text-destructive">*</span> required
                  </span>
                  <span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">†</span> required
                    for deploy (status {BULK_IMPORT_STATUS_DEPLOY})
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {columns[kind].map((col) => {
                  const isRequired = requiredSet.has(col);
                  const isDeployRequired = deployRequiredSet.has(col);
                  return (
                    <Badge
                      key={col}
                      variant="secondary"
                      className={cn(
                        'rounded-[6px] font-mono text-[10px]',
                        isRequired &&
                          'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10',
                        isDeployRequired &&
                          'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-950',
                      )}
                    >
                      {col}
                      {isRequired ? ' *' : isDeployRequired ? ' †' : ''}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-[10px] border border-border/70 bg-muted/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                status_id values
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {INVENTORY_STATUSES.map((status) => (
                  <div key={status.statusId} className="flex items-center gap-2 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-foreground font-mono text-[10px] font-semibold text-background">
                      {status.statusId}
                    </span>
                    <span className="capitalize text-foreground">
                      {formatStatusLabel(status.statusId)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-[10px] border border-border/70 bg-muted/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                acc_code values
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACC_CODE_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-border/60 bg-background px-2.5 py-2 text-xs"
                  >
                    <span className="font-mono font-medium text-foreground">{opt.value}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{opt.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Store the code in the CSV (<code className="text-[10px]">200-0500</code> or{' '}
                <code className="text-[10px]">992-000</code>). The labels are for reference only.
              </p>
            </div>

            {kind === 'laptop' ? (
              <div className="space-y-2 rounded-[10px] border border-border/70 bg-muted/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  category values
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LAPTOP_CATEGORY_OPTIONS.map((category) => {
                    const prefix = getLaptopAssetIdPrefix(category);
                    return (
                      <div key={category} className="flex items-center justify-between gap-3 rounded-[8px] border border-border/60 bg-background px-2.5 py-2 text-xs">
                        <span className="font-medium text-foreground">{category}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          prefix {prefix}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between gap-3 rounded-[8px] border border-border/60 bg-background px-2.5 py-2 text-xs">
                    <span className="font-medium text-foreground">Others (custom)</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      prefix {ASSET_ID_PREFIX.other}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Notebook categories use prefix {ASSET_ID_PREFIX.laptop}; desktop categories use prefix{' '}
                  {ASSET_ID_PREFIX.desktop}; any other category uses prefix {ASSET_ID_PREFIX.other} and is stored in
                  title case. Leave <code className="text-[10px]">asset_id</code> blank to auto-generate, or
                  enter an ID like <code className="text-[10px]">1226001 (RMK)</code>. The{' '}
                  <code className="text-[10px]">tagging</code> column is optional.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex flex-col rounded-[14px] border-border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                2
              </span>
              <div className="space-y-1">
                <CardTitle className="text-base">Upload your file</CardTitle>
                <CardDescription>Drop a .xlsx or .csv file or browse from your computer.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await loadFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) await loadFile(file);
              }}
              className={`flex min-h-[160px] flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed p-6 text-center transition-colors ${
                dragActive
                  ? 'border-foreground bg-muted/70'
                  : 'border-border bg-muted/30 hover:border-foreground/40 hover:bg-muted/50'
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm">
                <Upload className="h-5 w-5 text-muted-foreground" />
              </span>
              <span className="text-sm font-medium text-foreground">
                Drag &amp; drop your CSV here
              </span>
              <span className="text-xs text-muted-foreground">
                or <span className="font-medium underline underline-offset-2">click to browse</span>{' '}
                · .xlsx or .csv
              </span>
            </button>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4 rounded-[14px] border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
              3
            </span>
            <div className="space-y-1">
              <CardTitle className="text-base">Review &amp; parse</CardTitle>
              <CardDescription>
                Paste rows below, then parse to validate. Dates: {IMPORT_DATE_FORMAT_HINT} (
                {kind === 'laptop'
                  ? `${PURCHASE_DATE_COLUMNS.join(', ')}, handover_date, warranty_start_date, warranty_end_date`
                  : `${PURCHASE_DATE_COLUMNS.join(', ')}, deployment_date, warranty_start_date, warranty_end_date`}
                ).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="csv-paste">CSV content</Label>
            <Textarea
              id="csv-paste"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                clearPreview();
              }}
              placeholder={getTemplate(kind)}
              className="min-h-[140px] font-mono text-xs rounded-[8px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="rounded-[8px] bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-700 dark:hover:bg-emerald-700/90"
              disabled={isParsing}
              onClick={handleParse}
            >
              {isParsing ? 'Processing…' : 'Import Bulk'}
            </Button>
            {preview && (
              <Button
                type="button"
                className="rounded-[8px]"
                disabled={importing || preview.validCount === 0}
                onClick={handleImport}
              >
                {importing ? 'Importing…' : `Import ${preview.validCount} asset(s)`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="default" className="rounded-[8px]">
              {preview.validCount} valid
            </Badge>
            {preview.errorCount > 0 && (
              <Badge variant="destructive" className="rounded-[8px]">
                {preview.errorCount} row error(s)
              </Badge>
            )}
          </div>

          {preview.errors.length > 0 && (
            <Card className="rounded-[14px] border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-destructive">Validation errors</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-destructive">
                  {preview.errors.map((err, i) => (
                    <li key={`${err.row}-${i}`}>
                      {err.row === 0 ? 'Header' : `Row ${err.row}`}: {err.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {previewRows && previewRows.length > 0 && (
            <Card className="overflow-hidden rounded-[14px] border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Preview ({previewRows.length} rows)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Asset ID</TableHead>
                        <TableHead className="font-semibold">Acc code</TableHead>
                        <TableHead className="font-semibold">Model</TableHead>
                        <TableHead className="font-semibold">Brand</TableHead>
                        <TableHead className="font-semibold">Supplier</TableHead>
                        <TableHead className="font-semibold">Serial</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Deploy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.slice(0, 20).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <code className="text-xs">{row.assetId ?? 'auto'}</code>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {row.accCode ?? '—'}
                          </TableCell>
                          <TableCell className="font-medium">{row.model}</TableCell>
                          <TableCell className="text-muted-foreground">{'brand' in row ? row.brand ?? '—' : '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{row.supplier ?? '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{row.serialNum ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-[6px] text-[10px]">
                              {formatStatusLabel(row.statusId)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {'handover' in row && row.handover
                              ? row.handover.employeeNo
                                ? `Handover ${row.handover.handoverStaffEmail} · ${row.handover.handoverDate} · ${row.handover.employeeNo}`
                                : `Facility ${row.handover.building ?? ''} / ${row.handover.level ?? '-'} / ${row.handover.zone ?? '-'}${row.handover.handler ? ` · ${row.handover.handler}` : ''}`
                              : 'deployment' in row && row.deployment
                                ? `${row.deployment.deploymentStaffEmail} · ${row.deployment.building} / ${row.deployment.level} / ${row.deployment.zone}`
                                : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {previewRows.length > 20 && (
                  <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    Showing first 20 of {previewRows.length} rows
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

