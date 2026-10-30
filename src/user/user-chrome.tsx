import { Link } from '@tanstack/react-router';
import { ClipboardPlus, History, LogOut, UserRound } from 'lucide-react';
import { NimsLogo } from '@/components/brand/NimsLogo';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'request' as const, to: '/user/request', label: 'Request', icon: ClipboardPlus },
  { id: 'history' as const, to: '/user/history', label: 'History', icon: History },
  { id: 'profile' as const, to: '/user/edit-profile', label: 'Profile', icon: UserRound },
];

export function UserPageChrome({
  onSignOut,
  active,
}: {
  onSignOut: () => void;
  active?: 'request' | 'history' | 'profile';
}) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-violet-950/[0.05] bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4">
          <Link to="/user/request" className="flex shrink-0 items-center gap-2">
            <NimsLogo size="sm" variant="light" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-center text-[11px] font-semibold leading-tight text-muted-foreground">
            Information Technology Department
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-violet-50 hover:text-violet-700 active:scale-90"
          >
            <LogOut className="h-[18px] w-[18px]" />
            <span className="sr-only">Sign out</span>
          </button>
        </div>
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-label="User navigation"
      >
        <div className="user-glass mx-auto grid h-16 max-w-sm grid-cols-3 gap-1 rounded-[26px] p-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <Link
                key={tab.id}
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-semibold transition-all duration-200 active:scale-95',
                  isActive
                    ? 'bg-violet-100/80 text-violet-700'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.25] animate-pop-in')} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
