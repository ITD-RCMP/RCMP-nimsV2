import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { History, LayoutDashboard, LogOut, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NimsLogo } from '@/components/brand/NimsLogo';

const DASH = '/disposal-unit/dashboard' as const;
const DISPOSAL = '/disposal-unit/disposal' as const;
const HISTORY = '/disposal-unit/history' as const;

function NavLink({
  to,
  icon: Icon,
  children,
  active,
}: {
  to: string;
  icon: React.ElementType;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-white/70 text-[oklch(0.45_0.12_290)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.05)]'
          : 'text-muted-foreground hover:bg-white/45 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {children}
    </Link>
  );
}

export interface DisposalUnitSideBarProps extends React.HTMLAttributes<HTMLElement> {
  embedded?: boolean;
  onSignOut?: () => void;
}

function DisposalUnitSideBarNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Disposal unit navigation">
      <NavLink to={DASH} icon={LayoutDashboard} active={pathname === DASH || pathname.startsWith(`${DASH}/`)}>
        Dashboard
      </NavLink>
      <NavLink
        to={DISPOSAL}
        icon={Trash2}
        active={
          pathname === DISPOSAL ||
          pathname.startsWith(`${DISPOSAL}/`) ||
          pathname === '/disposal-unit/disposal-form'
        }
      >
        Disposal
      </NavLink>
      <NavLink
        to={HISTORY}
        icon={History}
        active={pathname === HISTORY || pathname.startsWith(`${HISTORY}/`)}
      >
        History
      </NavLink>
    </nav>
  );
}

const DisposalUnitSideBar = React.forwardRef<HTMLElement, DisposalUnitSideBarProps>(
  function DisposalUnitSideBar({ className, embedded, onSignOut, ...props }, ref) {
    const inner = (
      <>
        <div className="shrink-0 border-b border-black/[0.06] px-4 py-4">
          <NimsLogo size="sm" variant="light" className="mx-auto" />
          <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Disposal unit
          </p>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <DisposalUnitSideBarNav />
        </ScrollArea>
        {onSignOut ? (
          <div className="shrink-0 border-t border-black/[0.06] p-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onSignOut}
              className="h-10 w-full justify-start gap-2.5 rounded-[10px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4 shrink-0 opacity-80" />
              Log out
            </Button>
          </div>
        ) : null}
      </>
    );

    if (embedded) {
      return (
        <div ref={ref as React.Ref<HTMLDivElement>} className={cn('flex h-full min-h-0 flex-col', className)} {...props}>
          {inner}
        </div>
      );
    }

    return (
      <aside
        ref={ref}
        className={cn(
          'nav-glass nav-glass-sidebar flex h-full min-h-0 w-56 shrink-0 flex-col overflow-hidden rounded-[20px]',
          className,
        )}
        {...props}
      >
        {inner}
      </aside>
    );
  },
);

DisposalUnitSideBar.displayName = 'DisposalUnitSideBar';

export { DisposalUnitSideBar, DisposalUnitSideBarNav };
