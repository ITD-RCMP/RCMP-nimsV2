import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Download, LayoutDashboard, LogOut, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NimsLogo } from '@/components/brand/NimsLogo';
import { readPrivilegedSession } from '@shared/lib/auth-session';

const DASH = '/admin/dashboard' as const;
const USERS = '/admin/users' as const;
const EXPORT = '/admin/export' as const;
const SETTINGS = '/admin/settings' as const;

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

export interface AdminSideBarProps extends React.HTMLAttributes<HTMLElement> {
  embedded?: boolean;
  onSignOut?: () => void;
}

function AdminSideBarNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Administrator navigation">
      <NavLink to={DASH} icon={LayoutDashboard} active={pathname === DASH}>
        Dashboard
      </NavLink>
      <NavLink
        to={USERS}
        icon={Users}
        active={pathname === USERS || pathname.startsWith(`${USERS}/`)}
      >
        Manage user
      </NavLink>
      <NavLink
        to={EXPORT}
        icon={Download}
        active={pathname === EXPORT || pathname.startsWith(`${EXPORT}/`)}
      >
        Export
      </NavLink>
      <NavLink
        to={SETTINGS}
        icon={Settings}
        active={pathname === SETTINGS || pathname.startsWith(`${SETTINGS}/`)}
      >
        Setting
      </NavLink>
    </nav>
  );
}

const AdminSideBar = React.forwardRef<HTMLElement, AdminSideBarProps>(function AdminSideBar(
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
          {fullName ?? 'Administrator'}
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <AdminSideBarNav />
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

AdminSideBar.displayName = 'AdminSideBar';

export { AdminSideBar, AdminSideBarNav };
