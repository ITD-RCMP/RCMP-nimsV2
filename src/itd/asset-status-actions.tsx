import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AssetId, AssetKind } from '@shared/lib/inventory-schema';
import { formatStatusLabel } from '@shared/lib/inventory-schema';
import { getAssetStatusActions, type AssetStatusAction } from '@shared/lib/asset-status-actions';

type AssetStatusActionsProps = {
  kind: AssetKind;
  assetId: AssetId;
  statusId: number;
  onStatusChange: (assetId: AssetId, newStatusId: number) => Promise<void>;
  disabled?: boolean;
};

export function AssetStatusActions({
  kind,
  assetId,
  statusId,
  onStatusChange,
  disabled,
}: AssetStatusActionsProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const actions: AssetStatusAction[] = getAssetStatusActions(kind, statusId);

  if (actions.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const handleStatusAction = async (actionKey: string, targetStatusId: number, label: string) => {
    setPendingKey(actionKey);
    try {
      await onStatusChange(assetId, targetStatusId);
      toast.success(`${label} — now ${formatStatusLabel(targetStatusId)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-1">
        {actions.map((action) => {
          const Icon = action.icon;
          const isPending = pendingKey === action.key;
          const btnClass = `h-8 w-8 shrink-0 rounded-[8px] ${action.buttonClassName}`;

          if (action.mode === 'navigate') {
            return (
              <Tooltip key={action.key}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={btnClass}
                    disabled={disabled}
                    aria-label={action.label}
                    asChild
                  >
                    <Link to={action.href} search={{ kind, assetId }}>
                      <Icon className="h-4 w-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{action.label}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Tooltip key={action.key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={btnClass}
                  disabled={disabled || pendingKey !== null}
                  aria-label={action.label}
                  onClick={() =>
                    void handleStatusAction(action.key, action.targetStatusId, action.label)
                  }
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{action.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
