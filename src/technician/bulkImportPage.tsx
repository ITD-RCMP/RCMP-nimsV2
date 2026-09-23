import { useRef, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, CircleHelp, Download, Laptop, Network, Tv, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
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

type GuideField = { name: string; hint: string };
type GuideStep = {
  title: string;
  body: string;
  note?: string;
  groups?: { title: string; fields: GuideField[] }[];
};

function importGuide(kind: AssetKind): GuideStep[] {
  const deploy = kind === 'laptop' ? 'Handover' : 'Deploy';
  const fillGroups: GuideStep['groups'] =
    kind === 'laptop'
      ? [
          {
            title: 'On every row',
            fields: [
              { name: 'asset_id', hint: 'Leave this blank. The system assigns the id. Type one only if you already have it, such as 1226001 (RMK).' },
              { name: 'tagging', hint: 'Optional short label, such as RMK. Safe to leave empty.' },
              { name: 'acc_code', hint: '200-0500 for an IT or AV asset, or 992-000 for inventory.' },
              { name: 'serial_num', hint: 'Required. Copy the serial printed on the device.' },
              { name: 'brand, model, supplier', hint: 'What is on the box or invoice. Fill them when you have them.' },
              { name: 'category', hint: 'Required. Notebook, Notebook standby, Leasing Laptop, Desktop AIO, Desktop IO sharing, or Leasing Desktop. Any other name is kept as you typed it.' },
              { name: 'part_number, processor, memory, os, storage, gpu', hint: 'Specs. Leave a cell empty when you do not know it.' },
              { name: 'po_date, do_date, invoice_date', hint: '15-01-26 or 150126. The matching _num column is the document number. purchase_cost is a number, such as 1299.00.' },
              { name: 'status_id', hint: 'Required. Use 1 while the asset is still in stock. Use 3 only when this row also says who has it.' },
              { name: 'remarks, warranty_*', hint: 'Optional notes and warranty dates, same date format as above.' },
            ],
          },
          {
            title: 'Only when status_id is 3',
            fields: [
              { name: 'handover_staff_id', hint: 'Email of the person receiving the asset.' },
              { name: 'handover_date', hint: 'The day it was handed over.' },
              { name: 'employee_no', hint: 'Staff number, when it goes to a person.' },
              { name: 'building, handler', hint: 'Use these instead of employee_no when it goes to a room. level and zone are optional.' },
            ],
          },
        ]
      : [
          {
            title: 'On every row',
            fields: [
              { name: 'asset_id', hint: 'Leave blank to auto-generate, or type an existing id such as 8826001 (HALL).' },
              { name: 'tagging', hint: 'Optional. Leave it empty if you have no label.' },
              { name: 'acc_code', hint: '200-0500 for an asset, or 992-000 for inventory.' },
              { name: 'category, brand, model, supplier, serial_num', hint: 'Describe the device. status_id is the only required column: 1 for stock, 3 when you are also recording where it went.' },
              ...(kind === 'network'
                ? [{ name: 'mac_address, ip_address', hint: 'Optional. Fill them when you already know the address.' }]
                : [{ name: 'asset_id_old', hint: 'Optional. The previous id, if this asset was tracked somewhere else.' }]),
              { name: 'po_date, do_date, invoice_date', hint: '15-01-26 or 150126. purchase_cost is a number. The _num columns are the document numbers.' },
            ],
          },
          {
            title: 'Only when status_id is 3',
            fields: [
              { name: 'deployment_staff_id', hint: 'Email of the staff member who deployed it.' },
              { name: 'building', hint: 'Where it was installed. level and zone can stay as - if you do not have them.' },
              { name: 'deployment_date', hint: 'The day it was deployed.' },
            ],
          },
        ];
  return [
    {
      title: 'Start from a template',
      body: 'Use the download button on Upload your file. It gives you a spreadsheet whose first row is already the correct headers.',
      note:
        kind === 'laptop'
          ? 'New asset is stock only. Handover also records the staff member. Deploy to facility records building, level, zone, and handler.'
          : `New asset is stock only. ${deploy} also records where the asset went.`,
    },
    {
      title: 'Fill one row per asset',
      body: 'Row 1 is the header. Leave those names exactly as they are. Each row under it is one asset. A red name on the page must be filled. An amber name is only needed when status_id is 3.',
      groups: fillGroups,
    },
    {
      title: 'Load the file',
      body: 'Drop the .xlsx or .csv onto Upload your file, or paste the same rows into the box under Review & parse. The box is what gets checked.',
    },
    {
      title: 'Check, then import',
      body: 'Click Import Bulk. Valid rows show in the preview. Anything wrong is listed in red — fix those cells and click Import Bulk again.',
      note: 'When the count looks right, click Import. You land on the asset list with the new records.',
    },
  ];
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const { preview, isParsing, parseText, clearPreview, commit, getTemplate, columns } = useBulkImport();
  const requiredSet = new Set(BULK_IMPORT_REQUIRED[kind]);
  const deployRequiredSet = new Set(bulkImportDeployRequiredColumns(kind));
  const deployLabel = kind === 'laptop' ? 'Handover' : 'Deploy';
  const guide = importGuide(kind);
  const step = guide[guideStep];

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
          <CardHeader className="flex-row items-center gap-2.5 space-y-0 pb-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
              1
            </span>
            <div className="min-w-0">
              <CardTitle className="text-sm">How to import the bulk?</CardTitle>
              <CardDescription className="text-xs">
                <span className="font-semibold text-destructive">*</span> required
                <span className="mx-1.5 text-border">·</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">†</span> required
                for deploy
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8 shrink-0 text-muted-foreground"
              aria-label="How to import"
              onClick={() => {
                setGuideStep(0);
                setGuideOpen(true);
              }}
            >
              <CircleHelp className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <p className="font-mono text-[11px] leading-6 text-muted-foreground">
              {columns[kind].map((col, index) => {
                const isRequired = requiredSet.has(col);
                const isDeployRequired = deployRequiredSet.has(col);
                return (
                  <span key={col}>
                    {index > 0 ? <span className="text-border"> · </span> : null}
                    <span
                      className={cn(
                        isRequired && 'text-destructive',
                        isDeployRequired && 'text-amber-700 dark:text-amber-300',
                      )}
                    >
                      {col}
                      {isRequired ? '*' : isDeployRequired ? '†' : ''}
                    </span>
                  </span>
                );
              })}
            </p>

            <details className="group text-xs">
              <summary className="cursor-pointer list-none text-muted-foreground [&::-webkit-details-marker]:hidden">
                <span className="underline-offset-2 group-open:underline">See More</span>
              </summary>
              <div className="mt-2 space-y-3 border-t border-border/70 pt-3">
                <div>
                  <p className="mb-1.5 text-[11px] text-muted-foreground">status_id</p>
                  <p className="leading-6 text-foreground">
                    {INVENTORY_STATUSES.map((status, index) => (
                      <span key={status.statusId}>
                        {index > 0 ? <span className="text-border"> · </span> : null}
                        <span className="font-mono">{status.statusId}</span>{' '}
                        <span className="capitalize">{formatStatusLabel(status.statusId)}</span>
                      </span>
                    ))}
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-muted-foreground">acc_code</p>
                  <p className="leading-6 text-foreground">
                    {ACC_CODE_OPTIONS.map((opt, index) => (
                      <span key={opt.value}>
                        {index > 0 ? <span className="text-border"> · </span> : null}
                        <span className="font-mono">{opt.value}</span> {opt.label}
                      </span>
                    ))}
                  </p>
                </div>
                {kind === 'laptop' ? (
                  <div>
                    <p className="mb-1.5 text-[11px] text-muted-foreground">category</p>
                    <p className="leading-6 text-foreground">
                      {LAPTOP_CATEGORY_OPTIONS.map((category, index) => (
                        <span key={category}>
                          {index > 0 ? <span className="text-border"> · </span> : null}
                          {category}{' '}
                          <span className="font-mono text-muted-foreground">
                            {getLaptopAssetIdPrefix(category)}
                          </span>
                        </span>
                      ))}
                      <span className="text-border"> · </span>
                      Other <span className="font-mono text-muted-foreground">{ASSET_ID_PREFIX.other}</span>
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Leave asset_id blank to auto-generate. tagging is optional.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Leave asset_id blank to auto-generate. tagging is optional.
                  </p>
                )}
              </div>
            </details>
          </CardContent>
        </Card>

        <Card className="flex flex-col rounded-[14px] border-border shadow-sm">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-4">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                2
              </span>
              <div className="space-y-1">
                <CardTitle className="text-base">Upload your file</CardTitle>
                <CardDescription>Drop a .xlsx or .csv file or browse from your computer.</CardDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Template"
                >
                  <Download className="h-3.5 w-3.5" />
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

      <Dialog
        open={guideOpen}
        onOpenChange={(open) => {
          setGuideOpen(open);
          if (!open) setGuideStep(0);
        }}
      >
        <DialogContent className="gap-0 overflow-hidden rounded-[14px] p-0 sm:max-w-lg">
          <div className="flex gap-1 px-6 pt-6">
            {guide.map((item, index) => (
              <span
                key={item.title}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  index <= guideStep ? 'bg-foreground' : 'bg-border',
                )}
              />
            ))}
          </div>
          <div className="max-h-[min(70vh,28rem)] space-y-3 overflow-y-auto px-6 pb-2 pt-5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Step {guideStep + 1} of {guide.length}
            </p>
            <DialogTitle className="text-base">{step.title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-foreground/80">
              {step.body}
            </DialogDescription>
            {step.note ? (
              <p className="rounded-[10px] bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                {step.note}
              </p>
            ) : null}
            {step.groups?.map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
                <dl className="space-y-2">
                  {group.fields.map((field) => (
                    <div key={field.name} className="rounded-[10px] bg-muted/70 px-3 py-2">
                      <dt className="font-mono text-[11px] text-foreground">{field.name}</dt>
                      <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{field.hint}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-[8px]"
              disabled={guideStep === 0}
              onClick={() => setGuideStep((current) => current - 1)}
            >
              Back
            </Button>
            {guideStep < guide.length - 1 ? (
              <Button
                type="button"
                size="sm"
                className="rounded-[8px]"
                onClick={() => setGuideStep((current) => current + 1)}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="rounded-[8px]"
                onClick={() => setGuideOpen(false)}
              >
                Done
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

