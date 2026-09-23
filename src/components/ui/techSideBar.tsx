import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  ChevronDown,
  History,
  Inbox,
  FileBarChart,
  Laptop,
  LayoutDashboard,
  LogOut,
  Network,
  Package,
  Trash2,
  Tv,
  Wrench,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NimsLogo } from '@/components/brand/NimsLogo';
import { readPrivilegedSession } from '@shared/lib/auth-session';

const DASH = '/technician/dashboard' as const;
const LAPTOP = '/technician/laptop' as const;
const AV = '/technician/av' as const;
const NETWORK = '/technician/network' as const;
const REQUESTS = '/technician/requests' as const;
const REQUEST_ROUTES = [
  REQUESTS,
  '/technician/request-assets',
  '/technician/request-view',
  '/technician/request-log',
] as const;
const MAINTENANCE = '/technician/preventive-maintenance' as const;
const DISPOSAL = '/technician/disposal' as const;
const PRE_DISPOSED = '/technician/pre-disposed' as const;
const DISPOSED = '/technician/disposed' as const;
const HISTORY = '/technician/history' as const;
const REPORT = '/technician/report' as const;

const HASH = {
  dashboard: '',
  inventoryNetwork: 'inventory-network',
  requestAssign: 'request-assign-assets',
  requestUser: 'request-user',
} as const;

type HashValue = (typeof HASH)[keyof typeof HASH];

function useNavHash(): string {
  return useRouterState({
    select: (s) => (s.location.hash ?? '').replace(/^#/, ''),
  });
}

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

function NavCollapsible({
  title,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/coll">
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm font-medium',
          'text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <span className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 opacity-80" />
          {title}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]/coll:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5 pt-1 pl-2 overflow-hidden">
        <div className="border-l border-border/70 pl-3 ml-1.5 space-y-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export interface TechSideBarProps extends React.HTMLAttributes<HTMLElement> {
  /** Omit outer &lt;aside&gt; wrapper (e.g. inside a mobile sheet). */
  embedded?: boolean;
  onSignOut?: () => void;
}

function TechSideBarNav() {
  const h = useNavHash();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const dashActive = pathname === '/technician/dashboard' && !h;
  const laptopActive = pathname === '/technician/laptop';
  const avActive = pathname === '/technician/av';
  const networkActive = pathname === '/technician/network';
  const requestsActive = REQUEST_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Technician navigation">
      <NavLink to={DASH} icon={LayoutDashboard} active={dashActive}>
        Dashboard
      </NavLink>

      <NavCollapsible title="Inventory" icon={Package} defaultOpen>
        <NavLink to={LAPTOP} icon={Laptop} active={laptopActive}>
          Laptop / Desktop
        </NavLink>

        <NavLink to={AV} icon={Tv} active={avActive}>
          AV
        </NavLink>
        <NavLink to={NETWORK} icon={Network} active={networkActive}>
          Network
        </NavLink>
      </NavCollapsible>

      <NavLink to={REQUESTS} icon={Inbox} active={requestsActive}>
        Request
      </NavLink>
      
      <NavLink
        to={MAINTENANCE}
        icon={Wrench}
        active={pathname === MAINTENANCE || pathname.startsWith(`${MAINTENANCE}/`)}
      >
        Maintenance
      </NavLink>
      <NavLink
        to={DISPOSAL}
        icon={Trash2}
        active={
          pathname === DISPOSAL ||
          pathname === PRE_DISPOSED ||
          pathname === DISPOSED ||
          pathname.startsWith(`${DISPOSAL}/`)
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
      <NavLink
        to={REPORT}
        icon={FileBarChart}
        active={pathname === REPORT || pathname.startsWith(`${REPORT}/`)}
      >
        Report
      </NavLink>
    </nav>
  );
}

const TechSideBar = React.forwardRef<HTMLElement, TechSideBarProps>(function TechSideBar(
  { className, embedded, onSignOut, ...props },
  ref,
) {
  const [fullName, setFullName] = React.useState<string | null>(null);
  React.useEffect(() => {
    setFullName(readPrivilegedSession()?.fullName?.trim() || null);
  }, []);

  const inner = (
    <>
      <div className="shrink-0 border-b border-black/[0.06] px-4 py-4">
        <NimsLogo size="sm" variant="light" className="mx-auto" />
        <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
          {fullName ?? 'Technical officer'}
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <TechSideBarNav />
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
            Sign out
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
});

TechSideBar.displayName = 'TechSideBar';

export { TechSideBar, TechSideBarNav, HASH as TECH_SIDEBAR_HASH };
