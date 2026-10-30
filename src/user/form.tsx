import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlarmClock,
  AlertCircle,
  ArrowRight,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  HandCoins,
  History,
  Info,
  Laptop,
  ListChecks,
  Loader2,
  Lock,
  MapPin,
  MessageSquareText,
  Mic,
  Minus,
  Monitor,
  Package,
  PackageCheck,
  PackageOpen,
  PartyPopper,
  Pencil,
  Plus,
  Projector,
  RotateCcw,
  ScanSearch,
  Send,
  ShieldCheck,
  Sparkles,
  Speaker,
  Tv,
  UserCheck,
  Users,
  Video,
  Webcam,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { clearAllSessions, readUserSession, type SessionUser } from '@shared/lib/auth-session';
import { isUserProfileComplete } from '@shared/lib/user-profile';
import {
  REQUEST_PROGRAM_TYPES,
  type RequestProgramType,
  type UserRequestItemDraft,
} from '@shared/lib/request-schema';
import {
  USER_REQUEST_ASSET_CATALOG,
  type UserRequestAssetCatalogEntry,
  type UserRequestAssetType,
  getUserRequestAssetCatalogEntry,
} from '@shared/lib/request-asset-types';
import { submitUserRequestFn } from '@backend/server/requests/request.functions';
import { getMalaysiaHolidaysFn } from '@backend/server/operations/malaysia-holidays.functions';
import { UserProfileCompleteDialog } from '@/user/profile-complete-dialog';
import {
  RequestTicket,
  TicketActions,
  borrowDurationDays,
  type RequestTicketData,
} from '@/user/request-ticket';
import {
  USER_TAB_BAR_TOP,
  UserAppShell,
  UserLoadingScreen,
  UserSectionLabel as SectionLabel,
  haptic,
  initialsOf,
} from '@/user/user-ui';
import { getUserProfileFn } from '@backend/server/auth/auth.functions';
import { formatDateLabel, isoToLocalDate, localDateToIso } from '@shared/lib/date-format';
import type { DashboardHoliday } from '@shared/lib/dashboard-schema';
import { cn } from '@/lib/utils';

const FEEDBACK_URL = 'https://itd.rcmp.edu.my/feedback';

const STEPS = [
  {
    id: 'sla',
    label: 'Terms',
    icon: FileText,
    title: 'Before you borrow',
    subtitle: 'A few quick rules that keep equipment available for everyone.',
  },
  {
    id: 'details',
    label: 'Details',
    icon: ClipboardCheck,
    title: 'When & where',
    subtitle: 'Tell us when you need the equipment and where it will be used.',
  },
  {
    id: 'items',
    label: 'Equipment',
    icon: Package,
    title: 'Pick your gear',
    subtitle: 'Tap to add. You can adjust quantities anytime.',
  },
  {
    id: 'preview',
    label: 'Review',
    icon: ListChecks,
    title: 'Almost there',
    subtitle: 'Check everything looks right, then send it off.',
  },
] as const;

function newItemId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function UserRequestFormPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionUser | null>(readUserSession);
  const [profileReady, setProfileReady] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [submitting, setSubmitting] = useState(false);
  const [ticket, setTicket] = useState<RequestTicketData | null>(null);

  const [slaAccepted, setSlaAccepted] = useState(false);
  const [borrowDate, setBorrowDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [programType, setProgramType] = useState('');
  const [usageLocation, setUsageLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState<UserRequestItemDraft[]>([]);
  const [holidays, setHolidays] = useState<DashboardHoliday[]>([]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const user = readUserSession();
    if (!user) {
      void navigate({ to: '/login' });
      return;
    }
    setSession(user);
    void getUserProfileFn()
      .then((profile) => {
        const nextSession: SessionUser = {
          staffId: profile.staffId,
          fullName: profile.fullName,
          email: profile.email,
          roleId: profile.roleId,
          roleName: profile.roleName,
          phone: profile.phone,
          departmentId: profile.departmentId,
        };
        setSession(nextSession);
        setProfileReady(true);
      })
      .catch(() => {
        setProfileReady(true);
      });
  }, [navigate]);

  useEffect(() => {
    const year = new Date().getFullYear();
    void getMalaysiaHolidaysFn({ data: { years: [year, year + 1] } })
      .then(setHolidays)
      .catch(() => {
        setHolidays([]);
      });
  }, []);

  const profileComplete = session != null && isUserProfileComplete(session);

  const canContinue = useMemo(() => {
    if (step === 0) return slaAccepted;
    if (step === 1) {
      return Boolean(
        borrowDate &&
          returnDate &&
          returnDate >= borrowDate &&
          programType &&
          usageLocation.trim().length > 0,
      );
    }
    if (step === 2) {
      return items.length > 0 && items.every((i) => i.assetType && i.quantity >= 1);
    }
    return true;
  }, [step, slaAccepted, borrowDate, returnDate, programType, usageLocation, items]);

  const totalUnits = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const handleSignOut = async () => {
    await clearAllSessions();
    void navigate({ to: '/' });
  };

  const setItemQuantity = (assetType: string, quantity: number) => {
    haptic(6);
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.assetType === assetType);
      if (quantity < 1) {
        return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
      }
      if (idx === -1) {
        return [...prev, { id: newItemId(), assetType, quantity }];
      }
      return prev.map((i, iIdx) => (iIdx === idx ? { ...i, quantity } : i));
    });
  };

  const handleBorrowDateChange = (iso: string) => {
    setBorrowDate(iso);
    if (returnDate && returnDate < iso) setReturnDate('');
  };

  const goToStep = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), STEPS.length - 1);
    if (clamped === step) return;
    setDirection(clamped > step ? 1 : -1);
    setStep(clamped);
    haptic(10);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNext = () => {
    if (!canContinue) {
      haptic([20, 40, 20]);
      if (step === 0) toast.error('Accept the terms and conditions to continue to the next step.');
      else if (step === 1) toast.error('Fill in all required request details before continuing.');
      else if (step === 2) toast.error('Add at least one equipment item to your request.');
      return;
    }
    goToStep(step + 1);
  };

  const handleBack = () => goToStep(step - 1);

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target) || target.closest('input, textarea')) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || submitting) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0) handleBack();
    else if (step < STEPS.length - 1) handleNext();
  };

  const resetForm = () => {
    setTicket(null);
    setStep(0);
    setDirection(1);
    setSlaAccepted(false);
    setBorrowDate('');
    setReturnDate('');
    setProgramType('');
    setUsageLocation('');
    setRemarks('');
    setItems([]);
    window.scrollTo({ top: 0 });
  };

  const handleSubmit = async () => {
    if (!session?.staffId) {
      toast.error('Your session has expired. Sign in again to continue.');
      void navigate({ to: '/login' });
      return;
    }
    if (!isUserProfileComplete(session)) {
      toast.error('Complete your profile (name, email, and phone) before submitting a request.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitUserRequestFn({
        data: {
          requestedBy: session.staffId,
          borrowDate,
          returnDate,
          programType,
          usageLocation: usageLocation.trim(),
          remarks: remarks.trim() || null,
          termsAcceptedAt: new Date().toISOString(),
          items: items.map((i) => ({ assetType: i.assetType, quantity: i.quantity })),
        },
      });
      haptic([30, 60, 30]);
      setTicket({
        requestId: result.requestId,
        requesterName: session.fullName,
        staffId: session.staffId,
        borrowDate,
        returnDate,
        programType,
        usageLocation: usageLocation.trim(),
        items: items.map((i) => ({ assetType: i.assetType, quantity: i.quantity })),
        submittedAt: new Date(),
      });
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The request could not be submitted. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!session || !profileReady) {
    return <UserLoadingScreen />;
  }

  if (ticket) {
    return (
      <SubmittedView ticket={ticket} onNewRequest={resetForm} onSignOut={() => void handleSignOut()} />
    );
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <UserAppShell active="request" onSignOut={() => void handleSignOut()} bottomSpace="4.5rem">
      <UserProfileCompleteDialog
        session={session}
        open={!profileComplete}
        onCompleted={setSession}
      />

      <WizardProgress step={step} onBack={handleBack} onSelectCompleted={goToStep} />

      <main
        className={cn(
          'relative mx-auto max-w-lg px-4 pt-5',
          !profileComplete && 'pointer-events-none select-none opacity-40',
        )}
        aria-hidden={!profileComplete}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          key={step}
          className={cn(
            'animate-in fade-in-0 duration-300 ease-out',
            direction > 0 ? 'slide-in-from-right-8' : 'slide-in-from-left-8',
          )}
        >
          <div className="mb-5 flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600 shadow-md shadow-violet-500/10 ring-1 ring-white animate-pop-in">
              <current.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[22px] font-extrabold leading-tight tracking-tight">{current.title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{current.subtitle}</p>
            </div>
          </div>

          {step === 0 && <SlaStep accepted={slaAccepted} onAcceptedChange={setSlaAccepted} />}
          {step === 1 && (
            <DetailsStep
              borrowDate={borrowDate}
              returnDate={returnDate}
              programType={programType}
              usageLocation={usageLocation}
              holidays={holidays}
              onBorrowDateChange={handleBorrowDateChange}
              onReturnDateChange={setReturnDate}
              onProgramTypeChange={setProgramType}
              onUsageLocationChange={setUsageLocation}
            />
          )}
          {step === 2 && <ItemsStep items={items} totalUnits={totalUnits} onSetQuantity={setItemQuantity} />}
          {step === 3 && (
            <PreviewStep
              borrowDate={borrowDate}
              returnDate={returnDate}
              programType={programType}
              usageLocation={usageLocation}
              remarks={remarks}
              onRemarksChange={setRemarks}
              items={items}
              requesterName={session.fullName}
              staffId={session.staffId}
              holidays={holidays}
              onEdit={goToStep}
            />
          )}
        </div>
      </main>

      <div className="fixed inset-x-0 z-20 px-4" style={{ bottom: USER_TAB_BAR_TOP }}>
        <div className="user-glass mx-auto flex max-w-lg items-center gap-2 rounded-full p-1.5">
          {step > 0 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              aria-label="Previous step"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 transition-transform active:scale-90 disabled:opacity-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? () => void handleSubmit() : handleNext}
            disabled={submitting || !profileComplete}
            aria-disabled={!canContinue}
            className={cn(
              'user-cta group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full px-5 text-[15px] font-bold transition-all active:scale-[0.97]',
              !canContinue && 'opacity-45 saturate-50',
            )}
          >
            {isLast ? (
              submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 transition-transform group-active:translate-x-1 group-active:-translate-y-1" />
                  Submit request
                </>
              )
            ) : (
              <>
                {step === 0 && slaAccepted ? 'Agree & continue' : 'Continue'}
                {step === 2 && totalUnits > 0 && (
                  <span
                    key={totalUnits}
                    className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-violet-700 animate-pop-in"
                  >
                    {totalUnits}
                  </span>
                )}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </UserAppShell>
  );
}

function WizardProgress({
  step,
  onBack,
  onSelectCompleted,
}: {
  step: number;
  onBack: () => void;
  onSelectCompleted: (index: number) => void;
}) {
  return (
    <div className="sticky top-14 z-[9] border-b border-violet-950/[0.05] bg-white/70 backdrop-blur-xl">
      <div className="mx-auto max-w-lg px-4 pb-3 pt-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Previous step"
            className={cn(
              '-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-violet-700 transition-all hover:bg-violet-50 active:scale-90',
              step === 0 && 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="flex-1 text-center text-[13px] font-bold">New request</p>
          <p className="w-8 text-right text-xs font-semibold tabular-nums text-muted-foreground">
            {step + 1}/{STEPS.length}
          </p>
        </div>
        <nav aria-label="Request progress" className="mt-2">
          <ol className="grid grid-cols-4 gap-1.5">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              const content = (
                <>
                  <span className="relative block h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out',
                        done
                          ? 'w-full bg-emerald-400'
                          : active
                            ? 'w-1/2 bg-gradient-to-r from-violet-500 to-indigo-400'
                            : 'w-0',
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      'mt-1.5 flex items-center gap-1 text-[10px] font-semibold transition-colors',
                      done ? 'text-emerald-600' : active ? 'text-foreground' : 'text-muted-foreground/70',
                    )}
                  >
                    {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    {s.label}
                  </span>
                </>
              );
              return (
                <li key={s.id} aria-current={active ? 'step' : undefined}>
                  {done ? (
                    <button
                      type="button"
                      onClick={() => onSelectCompleted(i)}
                      className="block w-full text-left"
                      aria-label={`Go back to ${s.label}`}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}

const TERMS: { title: string; body: string; icon: LucideIcon; important?: boolean }[] = [
  {
    title: 'Eligibility',
    body: 'All equipment is available for reservation only to registered students and staff.',
    icon: UserCheck,
  },
  {
    title: 'Reservation Duration',
    body: 'The duration of the reservation is as specified in your request.',
    icon: Clock,
  },
  {
    title: 'Responsibility',
    body: 'The party making the reservation is fully responsible for the reserved equipment from the moment of collection until they are returned and checked in by a technician.',
    icon: ShieldCheck,
  },
  {
    title: 'Condition of Items',
    body: 'The reserving party must inspect the item(s) at the time of collection. Any existing damage must be reported immediately, or the reserving party may be held responsible.',
    icon: ScanSearch,
    important: true,
  },
  {
    title: 'Damage or loss',
    body: 'The reserving party will be held financially responsible for the full replacement cost of any lost, stolen, or damaged items.',
    icon: HandCoins,
  },
  {
    title: 'Late Returns',
    body: 'Failure to return items by the specified return date will result in a fine and a temporary suspension of reservation privileges.',
    icon: AlarmClock,
  },
  {
    title: 'Purpose of use',
    body: 'Items are to be used for academic or official university purposes only.',
    icon: GraduationCap,
  },
  {
    title: 'Collection',
    body: 'Approved items must be collected within 24 hours of the "Approved" status, or the reservation may be cancelled.',
    icon: PackageCheck,
  },
  {
    title: 'Personal Data',
    body: 'Your personal data is managed by Microsoft. IT department just use phone number to contact you.',
    icon: Lock,
    important: true,
  },
];

function SlaStep({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <ul className="overflow-hidden user-surface rounded-3xl">
        {TERMS.map((term, i) => {
          const Icon = term.icon;
          return (
            <li
              key={term.title}
              className={cn(
                'flex gap-3 border-b border-violet-100 px-4 py-3.5 last:border-b-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 fill-mode-both',
                term.important && 'bg-rose-50/80',
              )}
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                  term.important ? 'bg-rose-100 text-rose-600' : 'bg-violet-50 text-violet-500',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm font-bold',
                    term.important ? 'text-rose-600' : 'text-foreground',
                  )}
                >
                  {term.title}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-[13px] leading-relaxed',
                    term.important ? 'font-medium text-rose-600/90' : 'text-muted-foreground',
                  )}
                >
                  {term.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        role="checkbox"
        aria-checked={accepted}
        onClick={() => {
          haptic(12);
          onAcceptedChange(!accepted);
        }}
        className={cn(
          'flex w-full items-center gap-3.5 rounded-3xl border-2 p-4 text-left transition-all duration-300 active:scale-[0.98]',
          accepted
            ? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/10'
            : 'border-dashed border-violet-200 bg-white/80',
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
            accepted ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-violet-200 bg-white',
          )}
        >
          {accepted && <Check className="h-4 w-4 animate-pop-in" strokeWidth={3} />}
        </span>
        <span className="text-sm font-semibold leading-snug">
          I have read and agree to the terms and conditions for equipment borrowing.
        </span>
      </button>
    </div>
  );
}

function holidayNamesOn(iso: string, holidays: DashboardHoliday[]): string[] {
  return holidays.filter((holiday) => holiday.date === iso).map((holiday) => holiday.name);
}

function HolidayDateNotice({
  borrowDate,
  returnDate,
  holidays,
}: {
  borrowDate: string;
  returnDate: string;
  holidays: DashboardHoliday[];
}) {
  const borrowNames = borrowDate ? holidayNamesOn(borrowDate, holidays) : [];
  const returnNames = returnDate ? holidayNamesOn(returnDate, holidays) : [];
  if (borrowNames.length === 0 && returnNames.length === 0) return null;

  return (
    <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-rose-950 animate-in fade-in-0 zoom-in-95 duration-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <div className="space-y-1 text-xs leading-relaxed">
        <p className="font-bold">Public holiday reminder</p>
        {borrowNames.length > 0 ? (
          <p>
            Borrow date ({formatDateLabel(borrowDate)}) is a public holiday: {borrowNames.join(' · ')}.
          </p>
        ) : null}
        {returnNames.length > 0 ? (
          <p>
            Return date ({formatDateLabel(returnDate)}) is a public holiday: {returnNames.join(' · ')}.
          </p>
        ) : null}
        <p className="text-rose-800/90">
          ITD office may be closed. You can still submit, but collection or return may need to be on a working
          day.
        </p>
      </div>
    </div>
  );
}

const PROGRAM_TYPE_META: Record<RequestProgramType, { icon: LucideIcon; hint: string }> = {
  'Academic project / class': { icon: GraduationCap, hint: 'Classes & coursework' },
  'Official Event': { icon: PartyPopper, hint: 'University events' },
  'Club / Society': { icon: Users, hint: 'Student activities' },
  Other: { icon: Sparkles, hint: 'Anything else' },
};

function DetailsStep({
  borrowDate,
  returnDate,
  programType,
  usageLocation,
  holidays,
  onBorrowDateChange,
  onReturnDateChange,
  onProgramTypeChange,
  onUsageLocationChange,
}: {
  borrowDate: string;
  returnDate: string;
  programType: string;
  usageLocation: string;
  holidays: DashboardHoliday[];
  onBorrowDateChange: (v: string) => void;
  onReturnDateChange: (v: string) => void;
  onProgramTypeChange: (v: string) => void;
  onUsageLocationChange: (v: string) => void;
}) {
  const [sheet, setSheet] = useState<'borrow' | 'return' | null>(null);
  const todayIso = localDateToIso(new Date());
  const minReturnDate = borrowDate && borrowDate > todayIso ? borrowDate : todayIso;
  const days = borrowDate && returnDate ? borrowDurationDays(borrowDate, returnDate) : null;

  const handlePick = (iso: string) => {
    haptic(8);
    if (sheet === 'borrow') {
      onBorrowDateChange(iso);
      setSheet(null);
      if (!returnDate || returnDate < iso) {
        setTimeout(() => setSheet('return'), 450);
      }
    } else {
      onReturnDateChange(iso);
      setSheet(null);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Dates</SectionLabel>
        <div className="relative grid grid-cols-2 gap-3">
          <DateTile
            label="Borrow"
            iso={borrowDate}
            isHoliday={borrowDate ? holidayNamesOn(borrowDate, holidays).length > 0 : false}
            onClick={() => setSheet('borrow')}
          />
          <DateTile
            label="Return"
            iso={returnDate}
            isHoliday={returnDate ? holidayNamesOn(returnDate, holidays).length > 0 : false}
            onClick={() => setSheet('return')}
          />
          {days != null && days > 0 && (
            <span
              key={days}
              className="absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-extrabold text-violet-700 ring-4 ring-[#fbfaff] animate-pop-in"
            >
              {days}d
            </span>
          )}
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          You may take the items early. Please return them by the return date.
        </p>
        <div className="mt-3">
          <HolidayDateNotice borrowDate={borrowDate} returnDate={returnDate} holidays={holidays} />
        </div>
      </section>

      <section>
        <SectionLabel>Program type</SectionLabel>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Program type">
          {REQUEST_PROGRAM_TYPES.map((p) => {
            const meta = PROGRAM_TYPE_META[p];
            const Icon = meta.icon;
            const selected = programType === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  haptic(6);
                  onProgramTypeChange(p);
                }}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-all duration-200 active:scale-[0.96]',
                  selected
                    ? 'border-violet-400 bg-violet-50 shadow-lg shadow-violet-500/10 ring-2 ring-violet-200/70'
                    : 'user-surface border-transparent',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                    selected ? 'bg-violet-500 text-white' : 'bg-violet-50 text-violet-500',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-[13px] font-bold leading-tight">{p}</span>
                  <span
                    className={cn(
                      'mt-0.5 block text-[11px]',
                      selected ? 'text-violet-600/80' : 'text-muted-foreground',
                    )}
                  >
                    {meta.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionLabel>Usage location</SectionLabel>
        <label className="flex h-14 items-center gap-3 user-surface rounded-2xl px-4 transition-all focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-200/60">
          <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            value={usageLocation}
            onChange={(e) => onUsageLocationChange(e.target.value)}
            placeholder="Building, room, or venue"
            enterKeyHint="done"
            className="h-full min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
          />
          {usageLocation.trim() && (
            <Check className="h-5 w-5 shrink-0 text-emerald-500 animate-pop-in" strokeWidth={2.5} />
          )}
        </label>
      </section>

      <Drawer open={sheet != null} onOpenChange={(open) => !open && setSheet(null)} shouldScaleBackground={false}>
        <DrawerContent className="rounded-t-[28px] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="pb-1 text-center sm:text-center">
            <DrawerTitle>{sheet === 'return' ? 'Return date' : 'Borrow date'}</DrawerTitle>
            <DrawerDescription>
              {sheet === 'return'
                ? 'When will you bring the items back?'
                : 'When do you need the equipment?'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex justify-center">
            <Calendar
              className="[--cell-size:2.75rem]"
              mode="single"
              selected={isoToLocalDate(sheet === 'return' ? returnDate : borrowDate)}
              onSelect={(date) => date && handlePick(localDateToIso(date))}
              disabled={{ before: isoToLocalDate(sheet === 'return' ? minReturnDate : todayIso)! }}
              defaultMonth={
                isoToLocalDate(sheet === 'return' ? returnDate || minReturnDate : borrowDate || todayIso)
              }
              modifiers={{
                holiday: holidays
                  .map((holiday) => isoToLocalDate(holiday.date))
                  .filter((date): date is Date => date != null),
              }}
              modifiersClassNames={{ holiday: 'text-rose-600' }}
            />
          </div>
          {holidays.length > 0 && (
            <p className="px-4 pt-1 text-center text-[11px] text-muted-foreground">
              Dates in <span className="font-semibold text-rose-600">rose</span> are Perak public holidays.
            </p>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function DateTile({
  label,
  iso,
  isHoliday,
  onClick,
}: {
  label: string;
  iso: string;
  isHoliday: boolean;
  onClick: () => void;
}) {
  const date = iso ? isoToLocalDate(iso) : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[116px] flex-col rounded-2xl p-4 text-left transition-all active:scale-[0.96]',
        date ? 'user-surface' : 'border-2 border-dashed border-violet-200 bg-white/60',
      )}
    >
      <span className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
        {isHoliday && <span className="h-2 w-2 rounded-full bg-rose-500" aria-label="Public holiday" />}
      </span>
      {date ? (
        <span key={iso} className="mt-auto animate-in fade-in-0 zoom-in-90 duration-300">
          <span className={cn('block text-[34px] font-extrabold leading-none tracking-tight', isHoliday && 'text-rose-600')}>
            {date.getDate()}
          </span>
          <span className="mt-1 block text-xs font-semibold text-muted-foreground">
            {date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} ·{' '}
            {date.toLocaleDateString('en-GB', { weekday: 'short' })}
          </span>
        </span>
      ) : (
        <span className="mt-auto flex items-center gap-1.5 text-sm font-bold text-violet-600">
          <CalendarPlus className="h-4 w-4" />
          Pick date
        </span>
      )}
    </button>
  );
}

const ASSET_TYPE_ICONS: Record<UserRequestAssetType, LucideIcon> = {
  Laptop: Laptop,
  'Portable Speaker': Speaker,
  Microphone: Mic,
  'Pocket Mic': Mic,
  Tripod: Monitor,
  Projector: Projector,
  'Video Camera': Video,
  Webcam: Webcam,
};

function assetIcon(assetType: string): LucideIcon {
  return ASSET_TYPE_ICONS[assetType as UserRequestAssetType] ?? Package;
}

function ItemsStep({
  items,
  totalUnits,
  onSetQuantity,
}: {
  items: UserRequestItemDraft[];
  totalUnits: number;
  onSetQuantity: (assetType: string, quantity: number) => void;
}) {
  const quantityByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.assetType, item.quantity);
    return map;
  }, [items]);

  const laptopCatalog = USER_REQUEST_ASSET_CATALOG.filter((e) => e.kind === 'laptop');
  const avCatalog = USER_REQUEST_ASSET_CATALOG.filter((e) => e.kind === 'av');

  return (
    <div className="space-y-6">
      <div className="flex gap-2.5 rounded-2xl border border-sky-100 bg-sky-50/80 p-3.5 text-xs leading-relaxed text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Please contact IT staff first before submitting a request if you have any enquiries.</p>
      </div>

      {items.length > 0 && (
        <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <SectionLabel>
            Your bag · {totalUnits} unit{totalUnits === 1 ? '' : 's'}
          </SectionLabel>
          <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {items.map((item) => {
              const Icon = assetIcon(item.assetType);
              return (
                <span
                  key={item.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-white py-1.5 pl-2 pr-3 text-xs font-semibold text-foreground shadow-sm animate-in zoom-in-75 fade-in-0 duration-200"
                >
                  <Icon className="h-3.5 w-3.5 text-violet-500" />
                  {item.assetType}
                  <span className="font-extrabold text-violet-600">×{item.quantity}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <EquipmentCatalogGroup
        title="Laptop"
        icon={Laptop}
        entries={laptopCatalog}
        quantityByType={quantityByType}
        onSetQuantity={onSetQuantity}
      />
      <EquipmentCatalogGroup
        title="AV equipment"
        icon={Tv}
        entries={avCatalog}
        quantityByType={quantityByType}
        onSetQuantity={onSetQuantity}
      />
    </div>
  );
}

function EquipmentCatalogGroup({
  title,
  icon: GroupIcon,
  entries,
  quantityByType,
  onSetQuantity,
}: {
  title: string;
  icon: LucideIcon;
  entries: UserRequestAssetCatalogEntry[];
  quantityByType: Map<string, number>;
  onSetQuantity: (assetType: string, quantity: number) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <section>
      <SectionLabel>
        <span className="flex items-center gap-1.5">
          <GroupIcon className="h-3.5 w-3.5" aria-hidden />
          {title}
        </span>
      </SectionLabel>
      <div className="space-y-3">
        {entries.map((entry, i) => (
          <EquipmentCatalogCard
            key={entry.assetType}
            entry={entry}
            index={i}
            quantity={quantityByType.get(entry.assetType) ?? 0}
            onSetQuantity={onSetQuantity}
          />
        ))}
      </div>
    </section>
  );
}

function EquipmentCatalogCard({
  entry,
  index,
  quantity,
  onSetQuantity,
}: {
  entry: UserRequestAssetCatalogEntry;
  index: number;
  quantity: number;
  onSetQuantity: (assetType: string, quantity: number) => void;
}) {
  const Icon = assetIcon(entry.assetType);
  const selected = quantity > 0;

  return (
    <div
      className={cn(
        'rounded-3xl border p-3.5 transition-all duration-300 animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-both',
        selected
          ? 'border-violet-300 bg-gradient-to-br from-white to-violet-50 shadow-lg shadow-violet-500/10 ring-2 ring-violet-200/70'
          : 'user-surface',
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex gap-3">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all duration-300',
            selected ? 'scale-105 bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md shadow-violet-500/30' : 'bg-violet-50 text-violet-500',
          )}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug">{entry.assetType}</p>
          <p className="mt-0.5 text-xs font-medium leading-relaxed text-amber-800">{entry.description}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <PackageOpen className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{entry.includes}</span>
        </p>
        {selected ? (
          <QuantityStepper
            quantity={quantity}
            onChange={(qty) => onSetQuantity(entry.assetType, qty)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onSetQuantity(entry.assetType, 1)}
            className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-violet-200 bg-violet-50 pl-3 pr-4 text-sm font-bold text-violet-700 transition-transform active:scale-90"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        )}
      </div>
    </div>
  );
}

function QuantityStepper({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center rounded-full border border-violet-200 bg-violet-50 p-1 text-violet-700 animate-in zoom-in-90 duration-200">
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-violet-100 active:scale-75"
        aria-label={quantity === 1 ? 'Remove item' : 'Decrease quantity'}
        onClick={() => onChange(Math.max(0, quantity - 1))}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        key={quantity}
        className="w-7 text-center text-sm font-extrabold tabular-nums animate-in zoom-in-50 fade-in-0 duration-200"
        aria-live="polite"
      >
        {quantity}
      </span>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm shadow-violet-500/40 transition-all active:scale-75"
        aria-label="Increase quantity"
        onClick={() => onChange(quantity + 1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function PreviewStep({
  requesterName,
  staffId,
  borrowDate,
  returnDate,
  programType,
  usageLocation,
  remarks,
  onRemarksChange,
  items,
  holidays,
  onEdit,
}: {
  requesterName: string;
  staffId: string;
  borrowDate: string;
  returnDate: string;
  programType: string;
  usageLocation: string;
  remarks: string;
  onRemarksChange: (v: string) => void;
  items: UserRequestItemDraft[];
  holidays: DashboardHoliday[];
  onEdit: (step: number) => void;
}) {
  const days = borrowDurationDays(borrowDate, returnDate);
  const initials = initialsOf(requesterName);

  const editButton = (target: number) => (
    <button
      type="button"
      onClick={() => onEdit(target)}
      className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-violet-600 transition-colors active:bg-violet-100"
    >
      <Pencil className="h-3 w-3" />
      Edit
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 user-surface rounded-3xl p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-200 to-indigo-200 text-sm font-extrabold text-violet-800">
          {initials || '?'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{requesterName}</p>
          <p className="font-mono text-xs text-muted-foreground">{staffId}</p>
        </div>
      </div>

      <section>
        <SectionLabel action={editButton(1)}>Details</SectionLabel>
        <div className="overflow-hidden user-surface rounded-3xl">
          <div className="flex items-center justify-between gap-3 bg-gradient-to-br from-violet-100 via-violet-50 to-indigo-50 px-4 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600">Borrow</p>
              <p className="mt-0.5 text-[15px] font-extrabold">{formatDateLabel(borrowDate)}</p>
            </div>
            <div className="flex flex-col items-center text-violet-500">
              <span className="text-[11px] font-bold">{days != null ? `${days} day${days === 1 ? '' : 's'}` : ''}</span>
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600">Return</p>
              <p className="mt-0.5 text-[15px] font-extrabold">{formatDateLabel(returnDate)}</p>
            </div>
          </div>
          <dl className="divide-y divide-violet-100 text-sm">
            <PreviewRow icon={GraduationCap} label="Program type" value={programType || '—'} />
            <PreviewRow icon={MapPin} label="Usage location" value={usageLocation || '—'} />
          </dl>
        </div>
      </section>

      <HolidayDateNotice borrowDate={borrowDate} returnDate={returnDate} holidays={holidays} />

      <section>
        <SectionLabel action={editButton(2)}>Equipment</SectionLabel>
        <ul className="divide-y divide-violet-100 overflow-hidden user-surface rounded-3xl">
          {items.map((i) => {
            const info = getUserRequestAssetCatalogEntry(i.assetType);
            const Icon = assetIcon(i.assetType);
            return (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{i.assetType}</p>
                  {info && <p className="truncate text-[11px] text-muted-foreground">{info.includes}</p>}
                </div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-extrabold tabular-nums text-violet-700">
                  ×{i.quantity}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <SectionLabel>Remarks (optional)</SectionLabel>
        <textarea
          value={remarks}
          onChange={(e) => onRemarksChange(e.target.value)}
          placeholder="Any additional notes for the technician reviewing your request"
          className="min-h-[96px] w-full resize-none user-surface rounded-3xl p-4 text-base outline-none transition-all placeholder:text-sm placeholder:text-muted-foreground/70 focus:border-violet-400 focus:ring-4 focus:ring-violet-200/60"
        />
      </section>
    </div>
  );
}

function PreviewRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto min-w-0 text-right font-semibold">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success: printed ticket, save/share, feedback nudge
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ['#c4b5fd', '#818cf8', '#fcd34d', '#34d399', '#f9a8d4', '#a5b4fc'];

function Confetti() {
  const [visible, setVisible] = useState(true);
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        width: 6 + Math.random() * 6,
        height: 8 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        style: {
          '--dur': `${2.2 + Math.random() * 1.6}s`,
          '--delay': `${Math.random() * 0.6}s`,
          '--drift': `${(Math.random() - 0.5) * 160}px`,
          '--spin': `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540)}deg`,
        } as React.CSSProperties,
        round: i % 3 === 0,
      })),
    [],
  );

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn('confetti-piece', p.round ? 'rounded-full' : 'rounded-[2px]')}
          style={{
            ...p.style,
            left: `${p.left}%`,
            width: p.width,
            height: p.round ? p.width : p.height,
            background: p.color,
          }}
        />
      ))}
    </div>
  );
}

const FEEDBACK_SCALE = [1, 2, 3, 4, 5] as const;

function FeedbackPrompt() {
  const [rated, setRated] = useState<number | null>(null);

  return (
    <div className="user-surface animate-rise-in rounded-3xl p-5" style={{ animationDelay: '1.7s' }}>
      {rated == null ? (
        <>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <MessageSquareText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Service feedback
              </p>
              <p className="mt-0.5 text-[15px] font-bold leading-snug">
                How would you rate your request experience?
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2" role="group" aria-label="Rate from 1 (poor) to 5 (excellent)">
            {FEEDBACK_SCALE.map((score) => (
              <a
                key={score}
                href={FEEDBACK_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  haptic(10);
                  setRated(score);
                }}
                aria-label={`Rate ${score} out of 5 and open the feedback form`}
                className="flex h-11 items-center justify-center rounded-xl border border-violet-100 bg-white text-sm font-bold tabular-nums text-foreground transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 active:scale-95"
              >
                {score}
              </a>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between px-0.5 text-[11px] font-medium text-muted-foreground">
            <span>Poor</span>
            <span>Excellent</span>
          </div>

          <p className="mt-4 border-t border-violet-100 pt-3 text-xs text-muted-foreground">
            Your feedback helps ITD improve its services. The form takes about a minute to complete.
          </p>
        </>
      ) : (
        <div className="flex items-start gap-3 animate-in fade-in-0 duration-300">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">Thank you for your rating</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The feedback form has opened in a new tab. Please complete it to share more details.
            </p>
            <a
              href={FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline"
            >
              Open feedback form
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmittedView({
  ticket,
  onNewRequest,
  onSignOut,
}: {
  ticket: RequestTicketData;
  onNewRequest: () => void;
  onSignOut: () => void;
}) {
  return (
    <UserAppShell active="request" onSignOut={onSignOut}>
      <Confetti />
      <main className="relative mx-auto max-w-md px-4 pt-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50 animate-pop-in">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" className="animate-check-draw" />
            </svg>
          </div>
          <h2 className="mt-5 text-2xl font-extrabold tracking-tight animate-rise-in" style={{ animationDelay: '0.15s' }}>
            Request sent!
          </h2>
          <p
            className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground animate-rise-in"
            style={{ animationDelay: '0.25s' }}
          >
            A technician will review it soon. You will also get a confirmation email if notifications are on.
          </p>
        </div>

        <div className="relative mt-7">
          <div
            className="relative z-10 -mx-1 h-3.5 rounded-full bg-gradient-to-b from-violet-200 to-violet-100 shadow-[inset_0_2px_3px_rgba(76,29,149,0.25)]"
            aria-hidden
          />
          <div className="-mx-4 -mt-2 overflow-hidden px-5 pb-10">
            <div className="animate-ticket-print">
              <RequestTicket ticket={ticket} />
            </div>
          </div>
        </div>

        <div className="-mt-4 animate-rise-in" style={{ animationDelay: '1.4s' }}>
          <TicketActions ticket={ticket} />
        </div>

        <div className="mt-6">
          <FeedbackPrompt />
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 animate-rise-in" style={{ animationDelay: '1.9s' }}>
          <Link
            to="/user/history"
            className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50"
          >
            <History className="h-4 w-4" />
            View history
          </Link>
          <span className="h-4 w-px bg-violet-200" />
          <button
            type="button"
            onClick={onNewRequest}
            className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50"
          >
            <RotateCcw className="h-4 w-4" />
            New request
          </button>
        </div>
      </main>
    </UserAppShell>
  );
}
