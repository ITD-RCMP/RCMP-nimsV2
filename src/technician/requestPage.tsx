import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ClipboardList,
  Laptop,
  Loader2,
  PackageCheck,
  RotateCcw,
  Search,
  Tv,
  UserX,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { readTechnicianSession } from '@shared/lib/auth-session';
import {
  REQUEST_STATUS_ACTIVE,
  REQUEST_STATUS_BOOKED,
} from '@shared/lib/request-schema';
import type {
  PendingRequest,
  RequestAssignableKind,
  RequestAssignmentRow,
  RequestItemRow,
  RequestPoolAsset,
  RequestSlotMark,
} from '@shared/lib/request-schema';
import {
  assetCategoryMatchesRequestType,
  kindGroupLabel,
  requestItemKindFromAssetType,
} from '@shared/lib/request-asset-types';
import { formatDateLabel, isoToLocalDate, localDateToIso } from '@shared/lib/date-format';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AssetStatusBadge } from '@/technician/asset-status-badge';
import { TechnicianShell } from '@/technician/technician-shell';
import { queueCheckoutEmailFn } from '@backend/server/email/checkout-email.functions';
import { queueRequestRejectEmailFn } from '@backend/server/email/request-reject-email.functions';
import { queueRequestReturnEmailFn } from '@backend/server/email/request-return-email.functions';
import {
  bookPoolAssetToRequestFn,
  cancelBookedAssignmentNotTakenFn,
  cancelBookedAssignmentUnavailableFn,
  changeBookedAssignmentFn,
  checkoutUserRequestFn,
  listAvailablePoolAssetsFn,
  listPendingRequestsFn,
  markRequestSlotNotTakenFn,
  markRequestSlotUnavailableFn,
  rejectUserRequestFn,
  returnUserRequestFn,
} from '@backend/server/requests/request.functions';
import { RequestReturnFields } from '@/technician/request-return-fields';
import { RequestToolbarActions } from '@/technician/request-toolbar-actions';
import { ScopedAskAiButton } from '@/prompt/scoped-ask-ai';

function whatsappChatHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const international = digits.startsWith('0') ? `60${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}

function outlookComposeHref(email: string): string {
  return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(email)}`;
}

function RequesterContactLinks({ email, phone }: { email: string; phone: string | null }) {
  const whatsappHref = phone ? whatsappChatHref(phone) : null;
  if (!email && !phone) return null;
  return (
    <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {email ? (
        <a
          href={outlookComposeHref(email)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {email}
        </a>
      ) : null}
      {phone ? (
        whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {phone}
          </a>
        ) : (
          <span className="text-muted-foreground">{phone}</span>
        )
      ) : null}
    </p>
  );
}

function slotMarkLabel(mark: RequestSlotMark): string {
  return mark === 'not_taken' ? 'Not taken' : 'Unavailable';
}

function poolAssetSearchText(a: {
  assetId: number | null;
  assetIdOld: string | null;
  category?: string | null;
  brand: string | null;
  model: string | null;
}): string {
  const parts = [a.assetId, a.assetIdOld, a.category, a.brand, a.model]
    .filter(Boolean)
    .join(' ');
  return `${parts} ${parts.toLowerCase()}`;
}

function PoolAssetSelectDetails({
  assetId,
  assetIdOld,
  category,
  brand,
  model,
}: {
  assetId: number | string | null;
  assetIdOld: string | null;
  category?: string | null;
  brand: string | null;
  model: string | null;
}) {
  const meta = [category, brand, model].filter(Boolean).join(' · ');
  return (
    <div className="min-w-0 text-left">
      <p className="font-mono text-xs leading-tight">{assetId ?? '—'}</p>
      {assetIdOld ? (
        <p className="text-[10px] leading-tight text-muted-foreground">{assetIdOld}</p>
      ) : null}
      {meta ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{meta}</p>
      ) : null}
    </div>
  );
}

function bookedAwaitingCheckout(req: PendingRequest): RequestAssignmentRow[] {
  return req.assignments.filter(
    (a) =>
      !a.unavailable &&
      a.checkoutAt == null &&
      a.assetStatusId === REQUEST_STATUS_BOOKED,
  );
}

type KindGroup = {
  kind: RequestAssignableKind;
  label: string;
  items: RequestItemRow[];
  quantity: number;
  returnedCount: number;
};

function kindGroupsForRequest(req: PendingRequest): KindGroup[] {
  const laptopItems = req.items.filter(
    (i) => requestItemKindFromAssetType(i.assetType) === 'laptop',
  );
  const avItems = req.items.filter((i) => requestItemKindFromAssetType(i.assetType) === 'av');

  const build = (kind: RequestAssignableKind, items: RequestItemRow[]): KindGroup => ({
    kind,
    label: kindGroupLabel(kind),
    items,
    quantity: items.reduce((n, i) => n + i.quantity, 0),
    returnedCount: items.reduce((n, i) => n + i.returnedCount, 0),
  });

  const groups: KindGroup[] = [];
  if (laptopItems.length > 0) groups.push(build('laptop', laptopItems));
  if (avItems.length > 0) groups.push(build('av', avItems));
  return groups;
}

function assignmentsForKind(req: PendingRequest, group: KindGroup): RequestAssignmentRow[] {
  const itemIds = new Set(group.items.map((i) => i.requestItemId));
  return req.assignments.filter((a) => {
    if (a.requestItemId != null && itemIds.has(a.requestItemId)) return true;
    if (a.requestItemId != null) return false;
    return a.kind === group.kind;
  });
}

function checkedOutCountForGroup(req: PendingRequest, group: KindGroup): number {
  return assignmentsForKind(req, group).filter((a) => a.checkoutAt != null).length;
}

type ItemLine =
  | { lineKind: 'assignment'; assignment: RequestAssignmentRow; requestedItem: RequestItemRow | null }
  | { lineKind: 'empty'; requestedItem: RequestItemRow };

function linesForKindGroup(req: PendingRequest, group: KindGroup): ItemLine[] {
  const all = assignmentsForKind(req, group);
  const claimed = new Set<number>();
  const lines: ItemLine[] = [];

  for (const item of group.items) {
    const linked = all.filter(
      (a) => a.requestItemId === item.requestItemId && !claimed.has(a.assignmentId),
    );
    for (const assignment of linked) {
      claimed.add(assignment.assignmentId);
      lines.push({ lineKind: 'assignment', assignment, requestedItem: item });
    }

    const remainingNeed = Math.max(0, item.quantity - linked.length - item.returnedCount);
    const unlinked = all.filter((a) => a.requestItemId == null && !claimed.has(a.assignmentId));
    let filled = 0;
    for (const assignment of unlinked) {
      if (filled >= remainingNeed) break;
      claimed.add(assignment.assignmentId);
      lines.push({ lineKind: 'assignment', assignment, requestedItem: item });
      filled += 1;
    }

    const emptyCount = remainingNeed - filled;
    for (let i = 0; i < emptyCount; i += 1) {
      lines.push({ lineKind: 'empty', requestedItem: item });
    }
  }

  for (const assignment of all) {
    if (claimed.has(assignment.assignmentId)) continue;
    lines.push({ lineKind: 'assignment', assignment, requestedItem: null });
  }

  return lines;
}

function findItemForBooking(req: PendingRequest, group: KindGroup): RequestItemRow | null {
  for (const item of group.items) {
    const linked = req.assignments.filter((a) => a.requestItemId === item.requestItemId);
    if (linked.length + item.returnedCount < item.quantity) return item;
  }
  return null;
}

function checkedOutAwaitingReturn(req: PendingRequest): RequestAssignmentRow[] {
  return req.assignments.filter((a) => a.checkoutAt != null);
}

type RequestViewFilter = 'all' | 'pending' | 'to_return' | 'overdue';

function todayIso(): string {
  return localDateToIso(new Date());
}

function requestHasToReturn(req: PendingRequest): boolean {
  return checkedOutAwaitingReturn(req).length > 0;
}

function requestCanReject(req: PendingRequest): boolean {
  return !req.assignments.some((a) => a.checkoutAt != null);
}

function requestIsOverdue(req: PendingRequest): boolean {
  return requestHasToReturn(req) && req.returnDate < todayIso();
}

function emptySlotCount(req: PendingRequest): number {
  let count = 0;
  for (const group of kindGroupsForRequest(req)) {
    count += linesForKindGroup(req, group).filter((line) => line.lineKind === 'empty').length;
  }
  return count;
}

function requestIsPending(req: PendingRequest): boolean {
  if (bookedAwaitingCheckout(req).length > 0) return true;
  return emptySlotCount(req) > 0;
}

function daysUntilReturn(req: PendingRequest): number | null {
  if (!requestHasToReturn(req)) return null;
  const today = isoToLocalDate(todayIso());
  const returnDay = isoToLocalDate(req.returnDate);
  if (!today || !returnDay) return null;
  return Math.round((returnDay.getTime() - today.getTime()) / 86_400_000);
}

type RequestQueues = {
  overdue: PendingRequest[];
  toReturn: PendingRequest[];
  pending: PendingRequest[];
};

function classifyRequests(requests: PendingRequest[]): RequestQueues {
  const overdue: PendingRequest[] = [];
  const toReturn: PendingRequest[] = [];
  const pending: PendingRequest[] = [];

  for (const req of requests) {
    if (requestIsOverdue(req)) overdue.push(req);
    if (requestHasToReturn(req)) toReturn.push(req);
    if (requestIsPending(req)) pending.push(req);
  }

  overdue.sort((a, b) => a.returnDate.localeCompare(b.returnDate));
  toReturn.sort((a, b) => a.returnDate.localeCompare(b.returnDate));
  pending.sort((a, b) => a.borrowDate.localeCompare(b.borrowDate));

  return { overdue, toReturn, pending };
}

function matchesSearch(req: PendingRequest, query: string): boolean {
  if (!query) return true;
  return [
    String(req.requestId),
    req.requesterName,
    req.requesterEmail,
    req.requesterPhone,
    req.requestedBy,
    req.programType,
    req.usageLocation,
    req.remarks,
    ...req.items.map((i) => i.assetType),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query);
}

export function TechnicianRequestPage() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [pool, setPool] = useState<RequestPoolAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<RequestViewFilter>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<number | null>(null);
  const [changingAssignmentId, setChangingAssignmentId] = useState<number | null>(null);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [returnRequest, setReturnRequest] = useState<PendingRequest | null>(null);
  const [returnCondition, setReturnCondition] = useState('Good');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returning, setReturning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [reqs, available] = await Promise.all([
        listPendingRequestsFn(),
        listAvailablePoolAssetsFn(),
      ]);
      setRequests(reqs);
      setPool(available);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Requests could not be loaded. Refresh the page and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => matchesSearch(r, q));
  }, [requests, search]);

  const queues = useMemo(() => classifyRequests(searched), [searched]);

  const displayed = useMemo(() => {
    switch (viewFilter) {
      case 'overdue':
        return queues.overdue;
      case 'to_return':
        return queues.toReturn;
      case 'pending':
        return queues.pending;
      default:
        return searched;
    }
  }, [viewFilter, searched, queues]);

  const resolveBookingItem = (
    req: PendingRequest,
    group: KindGroup,
    preferredItem?: RequestItemRow | null,
  ) => {
    const item = preferredItem ?? findItemForBooking(req, group);
    if (!item) {
      toast.error('All slots are filled for this category');
      return null;
    }
    const session = readTechnicianSession();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return null;
    }
    return { item, staffId: session.staffId };
  };

  const handleBookOnSelect = async (
    req: PendingRequest,
    group: KindGroup,
    pick: string,
    requestedItem?: RequestItemRow | null,
  ) => {
    if (!pick || pick === '_none') return;
    const resolved = resolveBookingItem(req, group, requestedItem);
    if (!resolved) return;

    const [kind, idStr] = pick.split(':');
    const assetId = Number(idStr);
    if ((kind !== 'laptop' && kind !== 'av') || Number.isNaN(assetId)) return;
    if (kind !== group.kind) return;

    const key = `book-${req.requestId}-${resolved.item.requestItemId}`;
    setActionKey(key);
    try {
      const booked = await bookPoolAssetToRequestFn({
        data: {
          requestId: req.requestId,
          requestItemId: resolved.item.requestItemId,
          kind,
          assetId,
          assignedBy: resolved.staffId,
          remarks: null,
        },
      });
      if (booked.collectionReady) {
        toast.success('All items booked — notifying requester to collect at ITD');
      } else {
        toast.success(`Booked ${kind} #${assetId} (status ${REQUEST_STATUS_BOOKED})`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleMarkUnavailable = async (
    req: PendingRequest,
    group: KindGroup,
    requestedItem?: RequestItemRow | null,
  ) => {
    const resolved = resolveBookingItem(req, group, requestedItem);
    if (!resolved) return;

    const key = `unavail-${req.requestId}-${resolved.item.requestItemId}`;
    setActionKey(key);
    try {
      await markRequestSlotUnavailableFn({
        data: {
          requestId: req.requestId,
          requestItemId: resolved.item.requestItemId,
          markedBy: resolved.staffId,
          remarks: null,
        },
      });
      toast.success(`${resolved.item.assetType} slot marked unavailable`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark unavailable');
    } finally {
      setActionKey(null);
    }
  };

  const handleMarkNotTaken = async (
    req: PendingRequest,
    group: KindGroup,
    requestedItem?: RequestItemRow | null,
  ) => {
    const resolved = resolveBookingItem(req, group, requestedItem);
    if (!resolved) return;

    const key = `nottaken-${req.requestId}-${resolved.item.requestItemId}`;
    setActionKey(key);
    try {
      await markRequestSlotNotTakenFn({
        data: {
          requestId: req.requestId,
          requestItemId: resolved.item.requestItemId,
          markedBy: resolved.staffId,
        },
      });
      toast.success(`${resolved.item.assetType} slot marked not taken`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark not taken');
    } finally {
      setActionKey(null);
    }
  };

  const handleBookedNotTaken = async (assignment: RequestAssignmentRow) => {
    const session = readTechnicianSession();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return;
    }

    const key = `cancel-${assignment.assignmentId}`;
    setActionKey(key);
    try {
      await cancelBookedAssignmentNotTakenFn({
        data: { assignmentId: assignment.assignmentId, cancelledBy: session.staffId },
      });
      toast.success('Booking released — asset returned to pool');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark not taken');
    } finally {
      setActionKey(null);
    }
  };

  const handleBookedUnavailable = async (assignment: RequestAssignmentRow) => {
    const session = readTechnicianSession();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return;
    }

    const key = `unavail-${assignment.assignmentId}`;
    setActionKey(key);
    try {
      await cancelBookedAssignmentUnavailableFn({
        data: { assignmentId: assignment.assignmentId, cancelledBy: session.staffId },
      });
      toast.success('Slot marked unavailable — asset returned to pool');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark unavailable');
    } finally {
      setActionKey(null);
    }
  };

  const handleChangeBooked = async (
    assignment: RequestAssignmentRow,
    pick: string,
  ) => {
    if (!pick || assignment.unavailable) return;
    const current = `${assignment.kind}:${assignment.assetId}`;
    if (pick === current) return;

    const [kind, idStr] = pick.split(':');
    const assetId = Number(idStr);
    if ((kind !== 'laptop' && kind !== 'av') || Number.isNaN(assetId)) return;

    const session = readTechnicianSession();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return;
    }

    setChangingAssignmentId(assignment.assignmentId);
    try {
      await changeBookedAssignmentFn({
        data: {
          assignmentId: assignment.assignmentId,
          kind,
          assetId,
          changedBy: session.staffId,
        },
      });
      toast.success(`Changed booking to ${kind} #${assetId}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change booking');
    } finally {
      setChangingAssignmentId(null);
    }
  };

  const handleCheckoutRequest = async (req: PendingRequest) => {
    const session = readTechnicianSession();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return;
    }
    const toCheckout = bookedAwaitingCheckout(req);
    if (toCheckout.length === 0) {
      toast.error('There are no booked assets ready for checkout. Book assets first, then try again.');
      return;
    }
    setCheckoutRequestId(req.requestId);
    try {
      const result = await checkoutUserRequestFn({
        data: { requestId: req.requestId, checkedOutBy: session.staffId },
      });
      void queueCheckoutEmailFn({
        data: {
          requestId: req.requestId,
          checkedOutBy: session.staffId,
          assignmentIds: result.assignmentIds,
        },
      }).catch(console.error);
      toast.success(
        `Checked out ${result.checkedOut} asset${result.checkedOut === 1 ? '' : 's'} — sending notification…`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setCheckoutRequestId(null);
    }
  };

  const handleReject = async () => {
    if (rejectRequestId == null) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('Rejection notes are required. Enter a brief reason for declining this request.');
      return;
    }
    const session = readTechnicianSession();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return;
    }
    setRejecting(true);
    try {
      await rejectUserRequestFn({
        data: {
          requestId: rejectRequestId,
          rejectedBy: session.staffId,
          rejectionReason: reason,
        },
      });
      void queueRequestRejectEmailFn({ data: rejectRequestId }).catch(console.error);
      toast.success('Request rejected — sending notification…');
      setRejectRequestId(null);
      setRejectReason('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setRejecting(false);
    }
  };

  const optionsForKind = (kind: RequestAssignableKind) =>
    pool.filter((a) => a.kind === kind);

  const optionsForSlot = (kind: RequestAssignableKind, requestedType?: string | null) => {
    const ofKind = optionsForKind(kind);
    if (!requestedType || kind === 'laptop') return ofKind;
    return ofKind.filter((a) => assetCategoryMatchesRequestType(a.category, requestedType));
  };

  const openReturnForm = (req: PendingRequest) => {
    setReturnRequest(req);
    setReturnCondition('Good');
    setReturnRemarks('');
  };

  const handleReturnSubmit = async () => {
    if (!returnRequest) return;
    const condition = returnCondition.trim();
    if (!condition) {
      toast.error('A return condition is required. Select or describe the condition of the returned equipment.');
      return;
    }
    const session = readTechnicianSession();
    if (!session?.staffId) {
      toast.error('Your technician session could not be verified. Sign out and sign in again.');
      return;
    }
    const toReturn = checkedOutAwaitingReturn(returnRequest);
    if (toReturn.length === 0) {
      toast.error('There are no checked-out assets to return on this request.');
      return;
    }
    setReturning(true);
    try {
      const result = await returnUserRequestFn({
        data: {
          requestId: returnRequest.requestId,
          returnedBy: session.staffId,
          returnCondition: condition,
          remarks: returnRemarks.trim() || null,
        },
      });
      const emailPayload = {
        requestId: returnRequest.requestId,
        returnedBy: session.staffId,
        assignmentIds: result.assignmentIds,
        returnCondition: condition,
        remarks: returnRemarks.trim() || null,
      };
      setReturnRequest(null);
      setReturnRemarks('');
      toast.success(
        `Returned ${result.returned} asset${result.returned === 1 ? '' : 's'} to the request pool. Sending notification…`,
      );
      void queueRequestReturnEmailFn({ data: emailPayload }).catch(console.error);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Return failed');
    } finally {
      setReturning(false);
    }
  };

  const renderRequestCollapsible = (req: PendingRequest) => {
    const isOpen = openId === req.requestId;
    const totalNeeded = req.items.reduce((n, i) => n + i.quantity, 0);
    const totalCheckedOut = req.assignments.filter((a) => a.checkoutAt != null).length;
    const awaitingReturn = checkedOutAwaitingReturn(req);
    const toCheckout = bookedAwaitingCheckout(req);
    const overdue = requestIsOverdue(req);
    const pending = requestIsPending(req);
    const emptySlots = emptySlotCount(req);
    const daysLeft = daysUntilReturn(req);

    return (
      <Collapsible
        key={req.requestId}
        open={isOpen}
        onOpenChange={(open) => setOpenId(open ? req.requestId : null)}
        className={cn(
          'rounded-[12px] border',
          overdue
            ? 'border-rose-300 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20'
            : 'border-border',
        )}
      >
        <CollapsibleTrigger className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-secondary/40">
          <ChevronDown
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-180',
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{req.requesterName}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {totalCheckedOut}/{totalNeeded} checked out
              {daysLeft != null &&
                (overdue
                  ? ` · ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`
                  : daysLeft === 0
                    ? ' · due today'
                    : ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} until return`)}
              {pending && !awaitingReturn.length && emptySlots === 0 && toCheckout.length === 0
                ? ' · awaiting action'
                : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            <span
              className={cn(
                'inline-flex h-8 items-center rounded-[8px] px-3 text-xs font-medium',
                overdue
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                  : awaitingReturn.length > 0
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                    : toCheckout.length > 0
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
              )}
            >
              {overdue
                ? 'Overdue'
                : awaitingReturn.length > 0
                  ? 'Return'
                  : toCheckout.length > 0
                    ? 'Ready to checkout'
                    : 'Pending Asset'}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border px-4 py-4">
          <RequesterContactLinks email={req.requesterEmail} phone={req.requesterPhone} />
          <p className="mb-3 text-xs text-muted-foreground">
            {formatDateLabel(req.borrowDate)} → {formatDateLabel(req.returnDate)} · {req.programType}{' '}
            · {req.usageLocation}
          </p>
          {req.remarks && (
            <p className="mb-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Remarks:</span> {req.remarks}
            </p>
          )}

          <div className="rounded-[10px] border border-border">
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[34%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Category</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kindGroupsForRequest(req).flatMap((group) => {
                  const lines = linesForKindGroup(req, group);
                  const checkedOut = checkedOutCountForGroup(req, group);

                  if (lines.length === 0) return [];

                  return lines.map((line, lineIdx) => {
                    const a = line.lineKind === 'assignment' ? line.assignment : null;
                    const requestedItem =
                      line.requestedItem ??
                      (a?.requestItemId != null
                        ? (req.items.find((item) => item.requestItemId === a.requestItemId) ?? null)
                        : null);
                    const options = optionsForSlot(group.kind, requestedItem?.assetType);
                    const slotId = requestedItem?.requestItemId ?? group.kind;
                    const bookKey = `book-${req.requestId}-${slotId}`;
                    const unavailKey = `unavail-${req.requestId}-${slotId}`;
                    const notTakenKey = `nottaken-${req.requestId}-${slotId}`;
                    const rowKey =
                      line.lineKind === 'assignment'
                        ? `a-${line.assignment.assignmentId}`
                        : `e-${slotId}-${lineIdx}`;
                    const isCheckedOut = a?.checkoutAt != null;
                    const isBookedAwaitingCheckout =
                      a != null &&
                      !a.unavailable &&
                      !isCheckedOut &&
                      a.assetStatusId === REQUEST_STATUS_BOOKED;

                    return (
                      <TableRow key={rowKey}>
                            {lineIdx === 0 && (
                              <TableCell
                                rowSpan={lines.length}
                                className="align-top border-r border-border/60 bg-muted/20"
                              >
                                <p className="text-sm font-medium">{group.label}</p>
                                <p className="text-xs text-muted-foreground">× {group.quantity}</p>
                                <Badge
                                  variant={checkedOut >= group.quantity ? 'default' : 'outline'}
                                  className="mt-1.5 rounded-[6px] text-[10px]"
                                >
                                  {checkedOut}/{group.quantity} out
                                </Badge>
                              </TableCell>
                            )}

                        {line.lineKind === 'assignment' && a ? (
                          <>
                            <TableCell>
                              {a.slotMark ? (
                                <span
                                  className={cn(
                                    'text-sm font-medium',
                                    a.slotMark === 'not_taken'
                                      ? 'text-muted-foreground'
                                      : 'text-amber-800 dark:text-amber-200',
                                  )}
                                >
                                  {slotMarkLabel(a.slotMark)}
                                  {requestedItem ? (
                                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                      {requestedItem.assetType}
                                    </span>
                                  ) : null}
                                </span>
                              ) : !isCheckedOut && a.assetStatusId === REQUEST_STATUS_BOOKED ? (
                                <Select
                                  value={`${a.kind}:${a.assetId}`}
                                  disabled={
                                    changingAssignmentId === a.assignmentId || options.length === 0
                                  }
                                  onValueChange={(v) => void handleChangeBooked(a, v)}
                                >
                                  <SelectTrigger className="h-auto min-h-8 max-w-md rounded-[6px] py-1.5 text-xs [&>span]:line-clamp-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="min-w-[min(100vw-2rem,22rem)]">
                                    <SelectItem
                                      value={`${a.kind}:${a.assetId}`}
                                      textValue={poolAssetSearchText(a)}
                                      className="items-start py-2"
                                    >
                                      <PoolAssetSelectDetails
                                        assetId={a.assetId}
                                        assetIdOld={a.assetIdOld}
                                        category={null}
                                        brand={a.brand}
                                        model={a.model}
                                      />
                                    </SelectItem>
                                    {options
                                      .filter(
                                        (p) => `${p.kind}:${p.assetId}` !== `${a.kind}:${a.assetId}`,
                                      )
                                      .map((p) => (
                                        <SelectItem
                                          key={`${p.kind}-${p.assetId}`}
                                          value={`${p.kind}:${p.assetId}`}
                                          textValue={poolAssetSearchText(p)}
                                          className="items-start py-2"
                                        >
                                          <PoolAssetSelectDetails
                                            assetId={p.assetId}
                                            assetIdOld={p.assetIdOld}
                                            category={p.category}
                                            brand={p.brand}
                                            model={p.model}
                                          />
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="inline-flex items-start gap-1.5 text-sm">
                                  {a.kind === 'laptop' ? (
                                    <Laptop className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <Tv className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  )}
                                  <PoolAssetSelectDetails
                                    assetId={a.assetId}
                                    assetIdOld={a.assetIdOld}
                                    category={null}
                                    brand={a.brand}
                                    model={a.model}
                                  />
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {a.slotMark ? (
                                <Badge variant="outline" className="rounded-[6px] text-[10px]">
                                  {requestedItem
                                    ? `${slotMarkLabel(a.slotMark)} · ${requestedItem.assetType}`
                                    : slotMarkLabel(a.slotMark)}
                                </Badge>
                              ) : (
                                <>
                                  <AssetStatusBadge statusId={a.assetStatusId} />
                                  {isCheckedOut && a.checkoutAt && (
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                                      {new Date(a.checkoutAt).toLocaleString()}
                                    </p>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell>
                              {isBookedAwaitingCheckout ? (
                                <TooltipProvider delayDuration={300}>
                                  <div className="flex items-center gap-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="h-8 w-8 shrink-0 rounded-[8px]"
                                          disabled={actionKey != null}
                                          aria-label="Unavailable"
                                          onClick={() => void handleBookedUnavailable(a)}
                                        >
                                          {actionKey === `unavail-${a.assignmentId}` ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Ban className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">Unavailable</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="h-8 w-8 shrink-0 rounded-[8px]"
                                          disabled={actionKey != null}
                                          aria-label="Not taken"
                                          onClick={() => void handleBookedNotTaken(a)}
                                        >
                                          {actionKey === `cancel-${a.assignmentId}` ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <UserX className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">Not taken</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TooltipProvider>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              <Select
                                disabled={actionKey === bookKey}
                                onValueChange={(v) =>
                                  void handleBookOnSelect(req, group, v, requestedItem)
                                }
                              >
                                <SelectTrigger className="h-auto min-h-8 max-w-md rounded-[6px] py-1.5 text-xs [&>span]:line-clamp-none">
                                  <SelectValue
                                    placeholder={
                                      actionKey === bookKey
                                        ? 'Booking…'
                                        : requestedItem
                                          ? `Select ${requestedItem.assetType}…`
                                          : 'Select asset…'
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent className="min-w-[min(100vw-2rem,22rem)]">
                                  {options.length === 0 ? (
                                    <SelectItem value="_none" disabled>
                                      {requestedItem
                                        ? `No ${requestedItem.assetType} in pool`
                                        : 'No assets in pool'}
                                    </SelectItem>
                                  ) : (
                                    options.map((poolAsset) => (
                                      <SelectItem
                                        key={`${poolAsset.kind}-${poolAsset.assetId}`}
                                        value={`${poolAsset.kind}:${poolAsset.assetId}`}
                                        textValue={poolAssetSearchText(poolAsset)}
                                        className="items-start py-2"
                                      >
                                        <PoolAssetSelectDetails
                                          assetId={poolAsset.assetId}
                                          assetIdOld={poolAsset.assetIdOld}
                                          category={poolAsset.category}
                                          brand={poolAsset.brand}
                                          model={poolAsset.model}
                                        />
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {requestedItem ? `Unassigned · ${requestedItem.assetType}` : 'Unassigned'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <TooltipProvider delayDuration={300}>
                                <div className="flex items-center gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 rounded-[8px]"
                                        disabled={actionKey != null}
                                        aria-label="Unavailable"
                                        onClick={() =>
                                          void handleMarkUnavailable(req, group, requestedItem)
                                        }
                                      >
                                        {actionKey === unavailKey ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Ban className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Unavailable</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 rounded-[8px]"
                                        disabled={actionKey != null}
                                        aria-label="Not taken"
                                        onClick={() =>
                                          void handleMarkNotTaken(req, group, requestedItem)
                                        }
                                      >
                                        {actionKey === notTakenKey ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <UserX className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Not taken</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TooltipProvider>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
          </div>

          {pool.length === 0 && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-700">
              No assets available in the request pool.{' '}
              <Link to="/technician/request-assets" className="underline">
                Add assets first
              </Link>
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <ScopedAskAiButton
              target={{
                type: 'request',
                requestId: req.requestId,
                requesterName: req.requesterName,
              }}
              label="Ask about this request"
            />
            {awaitingReturn.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-[8px]"
                onClick={() => openReturnForm(req)}
              >
                Return request ({awaitingReturn.length})
              </Button>
            )}
            {toCheckout.length > 0 && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 rounded-[8px] bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-700 dark:hover:bg-emerald-700/90"
                disabled={checkoutRequestId === req.requestId}
                onClick={() => void handleCheckoutRequest(req)}
              >
                {checkoutRequestId === req.requestId
                  ? 'Checking out…'
                  : `Checkout request (${toCheckout.length})`}
              </Button>
            )}
            {requestCanReject(req) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-[8px] border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
                onClick={() => {
                  setRejectRequestId(req.requestId);
                  setRejectReason('');
                }}
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject request
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const toReturnNotOverdue = useMemo(
    () => queues.toReturn.filter((req) => !requestIsOverdue(req)),
    [queues.toReturn],
  );

  const renderRequestList = (list: PendingRequest[], emptyMessage: string) => {
    if (list.length === 0) {
      return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
    }
    return <div className="space-y-3">{list.map((req) => renderRequestCollapsible(req))}</div>;
  };

  const renderAllSections = () => {
    const hasAny =
      queues.overdue.length > 0 ||
      toReturnNotOverdue.length > 0 ||
      queues.pending.length > 0;

    if (!hasAny) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">No pending user requests.</p>
      );
    }

    return (
      <div className="space-y-6">
        {queues.overdue.length > 0 && (
          <RequestQueueSection
            title="Overdue"
            description="Past return date — checked-out assets still outstanding"
            count={queues.overdue.length}
            tone="rose"
            icon={AlertTriangle}
          >
            {renderRequestList(queues.overdue, '')}
          </RequestQueueSection>
        )}
        {toReturnNotOverdue.length > 0 && (
          <RequestQueueSection
            title="Due for return"
            description="Checked out and within or before the return window"
            count={toReturnNotOverdue.length}
            tone="emerald"
            icon={RotateCcw}
          >
            {renderRequestList(toReturnNotOverdue, '')}
          </RequestQueueSection>
        )}
        {queues.pending.length > 0 && (
          <RequestQueueSection
            title="Pending action"
            description="Book assets, mark slots, or checkout booked items"
            count={queues.pending.length}
            tone="amber"
            icon={ClipboardList}
          >
            {renderRequestList(queues.pending, '')}
          </RequestQueueSection>
        )}
      </div>
    );
  };

  return (
    <TechnicianShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">User requests</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">
            Work pending bookings, checkouts, returns, and overdue loans from one queue.
          </p>
        </div>
        <RequestToolbarActions />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <QueueStatCard
          label="Pending"
          hint="Awaiting action"
          count={queues.pending.length}
          icon={ClipboardList}
          active={viewFilter === 'pending'}
          onClick={() => setViewFilter('pending')}
          tone="amber"
        />
        <QueueStatCard
          label="To return"
          hint="Checked out"
          count={queues.toReturn.length}
          icon={PackageCheck}
          active={viewFilter === 'to_return'}
          onClick={() => setViewFilter('to_return')}
          tone="emerald"
        />
        <QueueStatCard
          label="Overdue"
          hint="Past due"
          count={queues.overdue.length}
          icon={AlertTriangle}
          active={viewFilter === 'overdue'}
          onClick={() => setViewFilter('overdue')}
          tone="rose"
        />
      </div>

      <Card className="mb-4 rounded-[14px] border-border shadow-sm">
        <CardHeader className="flex flex-col gap-3 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Request queue</CardTitle>
              <CardDescription>
                {searched.length} request{searched.length === 1 ? '' : 's'}
                {searched.length !== requests.length && ` of ${requests.length}`}
                {' · '}
                {pool.length} asset{pool.length === 1 ? '' : 's'} in pool
              </CardDescription>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search requests…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-[8px] pl-9"
              />
            </div>
          </div>
          <ToggleGroup
            type="single"
            value={viewFilter}
            onValueChange={(value) => {
              if (value) setViewFilter(value as RequestViewFilter);
            }}
            className="flex flex-wrap justify-start gap-1"
          >
            <ToggleGroupItem value="all" className="rounded-[8px] px-3 text-xs">
              All ({searched.length})
            </ToggleGroupItem>
            <ToggleGroupItem value="pending" className="gap-1.5 rounded-[8px] px-3 text-xs">
              <ClipboardList className="h-3.5 w-3.5" />
              Pending ({queues.pending.length})
            </ToggleGroupItem>
            <ToggleGroupItem value="to_return" className="gap-1.5 rounded-[8px] px-3 text-xs">
              <RotateCcw className="h-3.5 w-3.5" />
              To return ({queues.toReturn.length})
            </ToggleGroupItem>
            <ToggleGroupItem value="overdue" className="gap-1.5 rounded-[8px] px-3 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              Overdue ({queues.overdue.length})
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : viewFilter === 'all' ? (
            renderAllSections()
          ) : (
            renderRequestList(
              displayed,
              viewFilter === 'overdue'
                ? 'No overdue requests.'
                : viewFilter === 'to_return'
                  ? 'No requests awaiting return.'
                  : 'No requests need pending action.',
            )
          )}
        </CardContent>
      </Card>

      <Dialog
        open={returnRequest != null}
        onOpenChange={(open) => {
          if (!open) {
            setReturnRequest(null);
            setReturnRemarks('');
          }
        }}
      >
        <DialogContent className="rounded-[14px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Return request</DialogTitle>
            <DialogDescription>
              {returnRequest
                ? `Request #${returnRequest.requestId} — ${returnRequest.requesterName}. Returns all checked-out assets (${checkedOutAwaitingReturn(returnRequest).length}) to the pool (status ${REQUEST_STATUS_ACTIVE}).`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <RequestReturnFields
            returnCondition={returnCondition}
            setReturnCondition={setReturnCondition}
            remarks={returnRemarks}
            setRemarks={setReturnRemarks}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-[8px]"
              onClick={() => setReturnRequest(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-[8px]"
              disabled={returning}
              onClick={() => void handleReturnSubmit()}
            >
              {returning ? 'Returning…' : 'Confirm return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectRequestId != null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectRequestId(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent className="rounded-[14px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>
              This will reject the request and return any booked (status {REQUEST_STATUS_BOOKED}) assets
              to the pool.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Rejection remarks</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…"
              className="min-h-[88px] rounded-[8px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-[8px]"
              onClick={() => setRejectRequestId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-[8px]"
              disabled={rejecting}
              onClick={() => void handleReject()}
            >
              {rejecting ? 'Rejecting…' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TechnicianShell>
  );
}

const QUEUE_STAT_TONES = {
  amber: {
    wash: 'bg-amber-300/18',
    badge: 'bg-amber-400 text-amber-950',
    watermark: 'text-amber-400/25 dark:text-amber-300/15',
    ring: 'ring-2 ring-amber-400/50',
  },
  emerald: {
    wash: 'bg-emerald-300/18',
    badge: 'bg-emerald-400 text-emerald-950',
    watermark: 'text-emerald-400/25 dark:text-emerald-300/15',
    ring: 'ring-2 ring-emerald-400/50',
  },
  rose: {
    wash: 'bg-rose-300/18',
    badge: 'bg-rose-400 text-rose-950',
    watermark: 'text-rose-400/25 dark:text-rose-300/15',
    ring: 'ring-2 ring-rose-400/50',
  },
} as const;

function QueueStatCard({
  label,
  hint,
  count,
  icon: Icon,
  active,
  onClick,
  tone,
}: {
  label: string;
  hint: string;
  count: number;
  icon: typeof ClipboardList;
  active: boolean;
  onClick: () => void;
  tone: keyof typeof QUEUE_STAT_TONES;
}) {
  const colors = QUEUE_STAT_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'count-glass relative overflow-hidden rounded-3xl p-5 text-left transition-all hover:opacity-90',
        active && colors.ring,
      )}
    >
      <div className={cn('pointer-events-none absolute inset-0', colors.wash)} />
      <div className="relative z-10 flex items-center gap-2.5">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', colors.badge)}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="relative z-10 mt-3 font-serif text-4xl leading-none tracking-tight text-foreground">{count}</p>
      <p className="relative z-10 mt-2 text-xs text-muted-foreground">{hint}</p>
      <Icon
        className={cn('pointer-events-none absolute -bottom-3 -right-2 h-28 w-28', colors.watermark)}
        strokeWidth={1.15}
        aria-hidden
      />
    </button>
  );
}

function RequestQueueSection({
  title,
  description,
  count,
  tone,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  count: number;
  tone: 'rose' | 'emerald' | 'amber';
  icon: typeof ClipboardList;
  children: ReactNode;
}) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
        : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30';

  return (
    <section className={cn('rounded-[12px] border px-4 py-3', toneClass)}>
      <div className="mb-3 flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold">
            {title}{' '}
            <span className="font-normal text-muted-foreground">({count})</span>
          </h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
