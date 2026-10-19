import { useEffect, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { DisposalUnitSideBar } from '@/disposal-unit/side-bar';
import {
  clearAllSessions,
  getPostLoginPath,
  hasDisposalUnitSession,
  readPrivilegedSession,
} from '@shared/lib/auth-session';

export function DisposalUnitShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const user = readPrivilegedSession();
    if (user && !hasDisposalUnitSession()) {
      void navigate({ to: getPostLoginPath(user.roleId) });
      return;
    }
    if (!hasDisposalUnitSession()) {
      void navigate({ to: '/login' });
    }
  }, [navigate]);

  const handleSignOut = async () => {
    await clearAllSessions();
    void navigate({ to: '/' });
  };

  return (
    <div className="relative flex h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[120px] -left-[80px] h-[420px] w-[420px] rounded-full bg-lavender/[0.16] blur-[90px]" />
        <div className="absolute -top-[160px] right-[8%] h-[480px] w-[480px] rounded-full bg-lavender/[0.08] blur-[90px]" />
      </div>

      <DisposalUnitSideBar className="fixed inset-y-2 left-2 z-40 hidden h-auto md:flex" onSignOut={handleSignOut} />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col md:pl-[15.25rem]">
        <header className="nav-glass nav-glass-bar sticky top-0 z-30 md:hidden">
          <div className="flex h-14 items-center px-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-[8px]"
                  type="button"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex h-full w-[min(20rem,85vw)] flex-col p-0">
                <DisposalUnitSideBar embedded className="min-h-0 flex-1 overflow-hidden" onSignOut={handleSignOut} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-5 md:px-8">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
