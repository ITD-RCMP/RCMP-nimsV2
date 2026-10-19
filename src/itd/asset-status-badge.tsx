import { Badge } from '@/components/ui/badge';
import { formatStatusLabel } from '@shared/lib/inventory-schema';
import { STATUS_ID } from '@shared/lib/asset-status-actions';
import { cn } from '@/lib/utils';

/** Semantic badge colors per status_id (see status.md). */
export function getStatusBadgeClassName(statusId: number): string {
  switch (statusId) {
    case STATUS_ID.NEW:
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    case STATUS_ID.PRE_DISPOSED:
    case STATUS_ID.DISPOSED:
      return 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
    case STATUS_ID.DEPLOY:
      return 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200';
    case STATUS_ID.RETURN:
      return 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200';
    case STATUS_ID.REQUEST_ACTIVE:
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    case STATUS_ID.REQUEST_BOOKED:
      return 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200';
    case STATUS_ID.REQUEST_CHECKOUT:
      return 'border-red-200 bg-red-50 text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

export function AssetStatusBadge({
  statusId,
  className,
}: {
  statusId: number;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-[8px] text-[10px] font-semibold capitalize',
        getStatusBadgeClassName(statusId),
        className,
      )}
    >
      {formatStatusLabel(statusId)}
    </Badge>
  );
}
