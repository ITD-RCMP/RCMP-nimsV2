import type { LucideIcon } from 'lucide-react';
import { Reply, Truck } from 'lucide-react';
import type { AssetKind, StatusId } from '@shared/lib/inventory-schema';

/** status_id values from database/schema.sql */
export const STATUS_ID = {
  NEW: 1,
  RETURN: 2,
  DEPLOY: 3,
  PRE_DISPOSED: 4,
  DISPOSED: 5,
  REQUEST_ACTIVE: 6,
  REQUEST_BOOKED: 7,
  REQUEST_CHECKOUT: 8,
} as const;

export type AssetStatusNavigateHref = '/itd/deploy' | '/itd/return';

export type AssetStatusAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for icon button (outline-style, semantic color). */
  buttonClassName: string;
  /** Direct status update without navigation. */
  mode: 'status';
  targetStatusId: StatusId;
} | {
  key: string;
  label: string;
  icon: LucideIcon;
  buttonClassName: string;
  /** Open deploy / return form */
  mode: 'navigate';
  href: AssetStatusNavigateHref;
};

const actionBtn =
  'border shadow-sm hover:opacity-90 disabled:opacity-50';

const DEPLOY_ACTION: AssetStatusAction = {
  key: 'deploy',
  label: 'Deploy',
  mode: 'navigate',
  href: '/itd/deploy',
  icon: Truck,
  buttonClassName: `${actionBtn} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900`,
};

const RETURN_ACTION: AssetStatusAction = {
  key: 'return',
  label: 'Return',
  mode: 'navigate',
  href: '/itd/return',
  icon: Reply,
  buttonClassName: `${actionBtn} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900`,
};

/** Unified asset lifecycle — see status.md (applies to laptop, av, network) */
const LIFECYCLE_ACTIONS: Partial<Record<StatusId, AssetStatusAction[]>> = {
  [STATUS_ID.NEW]: [DEPLOY_ACTION],
  [STATUS_ID.DEPLOY]: [RETURN_ACTION],
  [STATUS_ID.RETURN]: [DEPLOY_ACTION],
};

export function getAssetStatusActions(_kind: AssetKind, statusId: number): AssetStatusAction[] {
  return LIFECYCLE_ACTIONS[statusId as StatusId] ?? [];
}

export function isAllowedStatusTransition(
  kind: AssetKind,
  fromStatusId: number,
  toStatusId: number,
): boolean {
  return getAssetStatusActions(kind, fromStatusId).some(
    (a) => a.mode === 'status' && a.targetStatusId === toStatusId,
  );
}

export const PREDISPOSAL_ELIGIBLE_STATUS_IDS = [STATUS_ID.RETURN] as const;

export function isPredisposalEligibleStatus(statusId: number): boolean {
  return (PREDISPOSAL_ELIGIBLE_STATUS_IDS as readonly number[]).includes(statusId);
}

export function isPreDisposedStatus(statusId: number): boolean {
  return statusId === STATUS_ID.PRE_DISPOSED;
}
