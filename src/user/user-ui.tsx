import { Loader2 } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { UserPageChrome } from '@/user/user-chrome';
import { cn } from '@/lib/utils';

/** Distance from the viewport bottom to just above the floating tab bar (with an 8px gap). */
export const USER_TAB_BAR_TOP = 'calc(4.5rem + max(0.75rem, env(safe-area-inset-bottom)))';

export function haptic(pattern: number | number[] = 8) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

/** Light app background, header + floating tab bar, and toasts for every user page. */
export function UserAppShell({
  active,
  onSignOut,
  bottomSpace = '0rem',
  children,
}: {
  active?: 'request' | 'history' | 'profile';
  onSignOut: () => void;
  /** Extra space reserved above the tab bar, e.g. for a floating action bar. */
  bottomSpace?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="user-app-bg relative min-h-screen text-foreground"
      style={{ paddingBottom: `calc(${USER_TAB_BAR_TOP} + 1rem + ${bottomSpace})` }}
    >
      <UserPageChrome onSignOut={onSignOut} active={active} />
      {children}
      <Toaster position="top-center" />
    </div>
  );
}

export function UserPageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex items-end justify-between gap-3 animate-rise-in', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">{eyebrow}</p>
        )}
        <h1 className="font-sans text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function UserSectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

export function UserLoadingScreen() {
  return (
    <div className="user-app-bg flex min-h-screen flex-col items-center justify-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg shadow-violet-500/10">
        <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
      </span>
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
