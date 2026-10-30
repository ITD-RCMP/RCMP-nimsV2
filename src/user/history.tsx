import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  ClipboardPlus,
  Clock,
  Inbox,
  MapPin,
  MessageSquareText,
  PackageCheck,
  RefreshCw,
  Ticket,
  Truck,
  UserX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { clearAllSessions, readUserSession } from '@shared/lib/auth-session';
import type {
  UserRequestHistory,
  UserRequestHistoryStatus,
  UserRequestItemProgress,
} from '@shared/lib/request-schema';
import { formatDateLabel, isoToLocalDate } from '@shared/lib/date-format';
import { listUserRequestHistoryFn } from '@backend/server/requests/request.functions';
import {
  REQUEST_STATUS_META,
  RequestTicket,
  TicketActions,
  borrowDurationDays,
  type RequestTicketData,
} from '@/user/request-ticket';
import {
  UserAppShell,
  UserLoadingScreen,
  UserPageHeader,
  UserSectionLabel,
  haptic,
} from '@/user/user-ui';
import { cn } from '@/lib/utils';

function itemResolvedUnits(item: UserRequestItemProgress): number {
  return (
    item.bookedCount +
    item.checkedOutCount +
    item.returnedCount +
    item.unavailableCount +
    item.notTakenCount
  );
}

function itemPendingUnits(item: UserRequestItemProgress): number {
  return Math.max(0, item.quantity - itemResolvedUnits(item));
}

function summarizeRequestItems(items: UserRequestItemProgress[]) {
  return items.reduce(
    (acc, item) => {
      acc.booked += item.bookedCount;
      acc.checkedOut += item.checkedOutCount;
      acc.returned += item.returnedCount;
      acc.unavailable += item.unavailableCount;
      acc.notTaken += item.notTakenCount;
      acc.pending += itemPendingUnits(item);
      return acc;
    },
    { booked: 0, checkedOut: 0, returned: 0, unavailable: 0, notTaken: 0, pending: 0 },
  );
}

const STATUS_ICONS: Record<UserRequestHistoryStatus, LucideIcon> = {
  submitted: Clock,
  preparing: PackageCheck,
  in_use: Truck,
  completed: CheckCircle2,
  rejected: XCircle,
  unavailable: Ban,
};

const ACTIVE_STATUSES: UserRequestHistoryStatus[] = ['submitted', 'preparing', 'in_use'];

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'active', label: 'In progress', match: (s: UserRequestHistoryStatus) => ACTIVE_STATUSES.includes(s) },
  { id: 'completed', label: 'Completed', match: (s: UserRequestHistoryStatus) => s === 'completed' },
  {
    id: 'closed',
    label: 'Closed',
    match: (s: UserRequestHistoryStatus) => s === 'rejected' || s === 'unavailable',
  },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

function shortDate(iso: string) {
  return isoToLocalDate(iso)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) ?? iso;
}

export function UserRequestHistoryPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(readUserSession);
  const [requests, setRequests] = useState<UserRequestHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const [ticketFor, setTicketFor] = useState<UserRequestHistory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listUserRequestHistoryFn();
      setRequests(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = readUserSession();
    if (!user) {
      void navigate({ to: '/login' });
      return;
    }
    setSession(user);
    void load();
  }, [navigate, load]);

  const handleSignOut = async () => {
    await clearAllSessions();
    void navigate({ to: '/' });
  };

  const counts = useMemo(
    () => ({
      active: requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
      completed: requests.filter((r) => r.status === 'completed').length,
    }),
    [requests],
  );

  const visible = useMemo(() => {
    const match = FILTERS.find((f) => f.id === filter)!.match;
    return requests.filter((r) => match(r.status));
  }, [requests, filter]);

  const ticket = useMemo<RequestTicketData | null>(
    () =>
      ticketFor && session
        ? {
            requestId: ticketFor.requestId,
            requesterName: session.fullName,
            staffId: session.staffId,
            borrowDate: ticketFor.borrowDate,
            returnDate: ticketFor.returnDate,
            programType: ticketFor.programType,
            usageLocation: ticketFor.usageLocation,
            items: ticketFor.items.map((i) => ({ assetType: i.assetType, quantity: i.quantity })),
            submittedAt: ticketFor.createdAt ? new Date(ticketFor.createdAt) : new Date(),
            status: ticketFor.status,
          }
        : null,
    [ticketFor, session],
  );

  if (!session) return <UserLoadingScreen />;

  return (
    <UserAppShell active="history" onSignOut={() => void handleSignOut()}>
      <main className="relative mx-auto max-w-lg px-4 pt-6">
        <UserPageHeader
          eyebrow="Your activity"
          title="My requests"
          action={
            <button
              type="button"
              onClick={() => {
                haptic(8);
                void load();
              }}
              disabled={loading}
              aria-label="Refresh"
              className="user-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-violet-700 transition-transform active:scale-90"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          }
        />

        <div className="mb-5 grid grid-cols-3 gap-2.5 animate-rise-in" style={{ animationDelay: '60ms' }}>
          <StatTile label="Total" value={requests.length} className="from-violet-50 to-white text-violet-700" />
          <StatTile label="In progress" value={counts.active} className="from-amber-50 to-white text-amber-700" />
          <StatTile label="Completed" value={counts.completed} className="from-emerald-50 to-white text-emerald-700" />
        </div>

        <div
          className="scrollbar-hide -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 animate-rise-in"
          style={{ animationDelay: '120ms' }}
          role="tablist"
          aria-label="Filter requests"
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  haptic(6);
                  setFilter(f.id);
                }}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-all active:scale-95',
                  active ? 'user-cta' : 'user-surface text-muted-foreground',
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {loading && requests.length === 0 ? (
            [0, 1, 2].map((i) => <div key={i} className="animate-shimmer h-[132px] rounded-3xl" />)
          ) : requests.length === 0 ? (
            <EmptyState />
          ) : visible.length === 0 ? (
            <div className="user-surface rounded-3xl px-6 py-10 text-center animate-in fade-in-0 duration-300">
              <Inbox className="mx-auto h-8 w-8 text-violet-300" />
              <p className="mt-2 text-sm font-semibold">Nothing here yet</p>
              <p className="text-xs text-muted-foreground">No requests match this filter.</p>
            </div>
          ) : (
            visible.map((req, i) => (
              <RequestCard
                key={req.requestId}
                req={req}
                index={i}
                open={openId === req.requestId}
                onOpenChange={(open) => {
                  haptic(6);
                  setOpenId(open ? req.requestId : null);
                }}
                onShowTicket={() => setTicketFor(req)}
              />
            ))
          )}
        </div>
      </main>

      <Drawer open={ticket != null} onOpenChange={(open) => !open && setTicketFor(null)} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[92vh] rounded-t-[28px] bg-[#fbfaff]">
          <DrawerHeader className="pb-2 text-center sm:text-center">
            <DrawerTitle>Request ticket</DrawerTitle>
            <DrawerDescription>Save or share it to show ITD when collecting.</DrawerDescription>
          </DrawerHeader>
          {ticket && (
            <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto max-w-sm">
                <RequestTicket ticket={ticket} />
                <TicketActions ticket={ticket} className="mt-5" />
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </UserAppShell>
  );
}

function StatTile({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={cn('user-surface rounded-2xl bg-gradient-to-b px-3 py-3', className)}>
      <p key={value} className="text-2xl font-extrabold leading-none tabular-nums animate-pop-in">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="user-surface rounded-3xl px-6 py-12 text-center animate-rise-in">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600 animate-soft-bounce">
        <ClipboardPlus className="h-7 w-7" />
      </div>
      <p className="mt-4 text-base font-extrabold">No requests yet</p>
      <p className="mx-auto mt-1 max-w-[16rem] text-sm text-muted-foreground">
        When you borrow equipment from ITD, your requests will show up here.
      </p>
      <Link
        to="/user/request"
        className="user-cta mt-5 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition-transform active:scale-95"
      >
        Make a request
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

const JOURNEY = ['Submitted', 'Prepared', 'Checked out', 'Returned'] as const;

function journeyIndex(status: UserRequestHistoryStatus): number {
  switch (status) {
    case 'preparing':
      return 1;
    case 'in_use':
      return 2;
    case 'completed':
      return 3;
    default:
      return 0;
  }
}

function RequestCard({
  req,
  index,
  open,
  onOpenChange,
  onShowTicket,
}: {
  req: UserRequestHistory;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowTicket: () => void;
}) {
  const summary = summarizeRequestItems(req.items);
  const status = REQUEST_STATUS_META[req.status];
  const StatusIcon = STATUS_ICONS[req.status];
  const days = borrowDurationDays(req.borrowDate, req.returnDate);
  const closed = req.status === 'rejected' || req.status === 'unavailable';

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        'user-surface overflow-hidden rounded-3xl transition-shadow duration-300 animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-both',
        open && 'shadow-[0_16px_40px_-16px_rgba(76,29,149,0.3)]',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <CollapsibleTrigger className="block w-full p-4 text-left transition-colors active:bg-violet-50/60">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
              status.className,
            )}
          >
            <StatusIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-extrabold leading-none tracking-tight">#{req.requestId}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  status.className,
                )}
              >
                {status.label}
              </span>
              <ChevronDown
                className={cn(
                  'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300',
                  open && 'rotate-180',
                )}
              />
            </div>
            <p className="mt-1.5 text-sm font-semibold">
              {shortDate(req.borrowDate)}
              <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-violet-400" />
              {shortDate(req.returnDate)}
              {days != null && (
                <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                  · {days} day{days === 1 ? '' : 's'}
                </span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{req.programType}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {req.items.map((item) => (
            <span
              key={item.requestItemId}
              className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700"
            >
              {item.assetType} ×{item.quantity}
            </span>
          ))}
          {summary.unavailable > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
              <Ban className="h-3 w-3" />
              {summary.unavailable} unavailable
            </span>
          )}
          {summary.notTaken > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
              <UserX className="h-3 w-3" />
              {summary.notTaken} not collected
            </span>
          )}
        </div>
        {!open && summary.pending > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {summary.pending} unit{summary.pending === 1 ? '' : 's'} awaiting technician action
          </p>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="space-y-5 border-t border-violet-100 px-4 pb-4 pt-4">
          {closed ? (
            <div
              className={cn(
                'flex gap-2.5 rounded-2xl p-3.5 text-xs leading-relaxed',
                req.status === 'rejected' ? 'bg-rose-50 text-rose-900' : 'bg-orange-50 text-orange-900',
              )}
            >
              <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-bold">
                  {req.status === 'rejected' ? 'This request was rejected' : 'Equipment unavailable'}
                </p>
                {req.status === 'rejected' && req.rejectionReason && <p className="mt-0.5">{req.rejectionReason}</p>}
              </div>
            </div>
          ) : (
            <Journey current={journeyIndex(req.status)} />
          )}

          <dl className="space-y-2.5 text-sm">
            <DetailRow icon={MapPin} label="Location" value={req.usageLocation} />
            {req.remarks && <DetailRow icon={MessageSquareText} label="Remarks" value={req.remarks} />}
            <DetailRow
              icon={Clock}
              label="Submitted"
              value={req.createdAt ? new Date(req.createdAt).toLocaleString() : '—'}
            />
            <DetailRow
              icon={ArrowRight}
              label="Dates"
              value={`${formatDateLabel(req.borrowDate)} → ${formatDateLabel(req.returnDate)}`}
            />
          </dl>

          {(summary.unavailable > 0 || summary.notTaken > 0) && (
            <div className="rounded-2xl bg-amber-50/80 px-3.5 py-3 text-xs leading-relaxed text-amber-950">
              <p className="font-bold">Technician updates</p>
              {summary.unavailable > 0 && (
                <p className="mt-1">
                  <span className="font-semibold text-orange-700">Unavailable</span>: no matching equipment
                  could be assigned for {summary.unavailable} unit{summary.unavailable === 1 ? '' : 's'}.
                </p>
              )}
              {summary.notTaken > 0 && (
                <p className="mt-1">
                  <span className="font-semibold text-rose-700">Not collected</span>: {summary.notTaken} booked
                  unit{summary.notTaken === 1 ? ' was' : 's were'} not picked up and released back to inventory.
                </p>
              )}
            </div>
          )}

          <div>
            <UserSectionLabel>Progress by category</UserSectionLabel>
            <ul className="space-y-2.5">
              {req.items.map((item) => (
                <ItemProgressCard key={item.requestItemId} item={item} />
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => {
              haptic(8);
              onShowTicket();
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 text-sm font-bold text-violet-700 transition-transform active:scale-[0.97]"
          >
            <Ticket className="h-4 w-4" />
            View ticket
          </button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Journey({ current }: { current: number }) {
  return (
    <ol className="flex items-start">
      {JOURNEY.map((label, i) => {
        const done = i < current || current === JOURNEY.length - 1;
        const active = i === current && current !== JOURNEY.length - 1;
        return (
          <li key={label} className="flex flex-1 flex-col items-center text-center">
            <div className="relative flex h-6 w-full items-center justify-center">
              {i > 0 && (
                <span
                  className={cn(
                    'absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2',
                    i <= current ? 'bg-emerald-300' : 'bg-violet-100',
                  )}
                />
              )}
              {i < JOURNEY.length - 1 && (
                <span
                  className={cn(
                    'absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2',
                    i < current ? 'bg-emerald-300' : 'bg-violet-100',
                  )}
                />
              )}
              <span
                className={cn(
                  'relative z-[1] flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                  done && 'bg-emerald-500 text-white',
                  active && 'bg-violet-600 text-white ring-4 ring-violet-100',
                  !done && !active && 'bg-white text-muted-foreground ring-1 ring-violet-100',
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
            </div>
            <span
              className={cn(
                'mt-1.5 text-[10px] font-semibold leading-tight',
                active ? 'text-violet-700' : done ? 'text-emerald-700' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
        <dd className="break-words font-semibold leading-snug">{value}</dd>
      </div>
    </div>
  );
}

const PROGRESS_SEGMENTS: {
  key: keyof Pick<
    UserRequestItemProgress,
    'returnedCount' | 'checkedOutCount' | 'bookedCount' | 'unavailableCount' | 'notTakenCount'
  >;
  label: string;
  bar: string;
  chip: string;
}[] = [
  { key: 'returnedCount', label: 'Returned', bar: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700' },
  { key: 'checkedOutCount', label: 'Checked out', bar: 'bg-sky-400', chip: 'bg-sky-50 text-sky-700' },
  { key: 'bookedCount', label: 'Booked', bar: 'bg-violet-400', chip: 'bg-violet-50 text-violet-700' },
  { key: 'unavailableCount', label: 'Unavailable', bar: 'bg-orange-300', chip: 'bg-orange-50 text-orange-700' },
  { key: 'notTakenCount', label: 'Not collected', bar: 'bg-rose-300', chip: 'bg-rose-50 text-rose-700' },
];

function ItemProgressCard({ item }: { item: UserRequestItemProgress }) {
  const pending = itemPendingUnits(item);
  const done = item.returnedCount >= item.quantity;
  const closedWithoutFulfillment =
    item.returnedCount === 0 &&
    item.checkedOutCount === 0 &&
    item.bookedCount === 0 &&
    item.unavailableCount + item.notTakenCount >= item.quantity;
  const total = Math.max(item.quantity, 1);

  return (
    <li className="rounded-2xl border border-violet-100 bg-white/70 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{item.assetType}</span>
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Complete
          </span>
        ) : (
          <span className="text-xs font-bold tabular-nums text-muted-foreground">× {item.quantity}</span>
        )}
      </div>

      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
        {PROGRESS_SEGMENTS.map((seg) =>
          item[seg.key] > 0 ? (
            <span
              key={seg.key}
              className={cn('h-full transition-[width] duration-700', seg.bar)}
              style={{ width: `${(item[seg.key] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PROGRESS_SEGMENTS.map((seg) =>
          item[seg.key] > 0 ? (
            <span key={seg.key} className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', seg.chip)}>
              {seg.label} × {item[seg.key]}
            </span>
          ) : null,
        )}
        {pending > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            Awaiting assignment × {pending}
          </span>
        )}
      </div>

      {closedWithoutFulfillment && !done && (
        <p className="mt-2 text-[11px] text-muted-foreground">No equipment was issued for this category.</p>
      )}
    </li>
  );
}
