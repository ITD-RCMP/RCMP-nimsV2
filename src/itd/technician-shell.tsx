import { useEffect, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { TechSideBar } from '@/components/ui/techSideBar';
import { Toaster } from '@/components/ui/sonner';
import { clearAllSessions, hasTechnicianSession, isAdminRole, isDisposalUnitRole, readPrivilegedSession } from '@shared/lib/auth-session';
import { AssetLookupButton } from '@/technician/asset-lookup';

export function TechnicianShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const user = readPrivilegedSession();
    if (user && isDisposalUnitRole(user.roleId)) {
      void navigate({ to: '/disposal-unit/dashboard' });
      return;
    }
    if (user && isAdminRole(user.roleId)) {
      void navigate({ to: '/admin/dashboard' });
      return;
    }
    if (!hasTechnicianSession()) {
      void navigate({ to: '/login' });
    }
  }, [navigate]);

  const handleSignOut = async () => {
    await clearAllSessions();
    void navigate({ to: '/' });
  };

  return (
    <div className="relative flex min-h-svh bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[120px] -left-[80px] h-[420px] w-[420px] rounded-full bg-lavender/[0.16] blur-[90px]" />
        <div className="absolute -top-[160px] right-[8%] h-[480px] w-[480px] rounded-full bg-lavender/[0.08] blur-[90px]" />
      </div>

      <TechSideBar className="fixed inset-y-2 left-2 z-40 hidden h-auto md:flex" onSignOut={handleSignOut} />

      <div className="relative flex min-w-0 flex-1 flex-col md:pl-[15.25rem]">
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
                <TechSideBar embedded className="min-h-0 flex-1 overflow-hidden" onSignOut={handleSignOut} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="relative w-full flex-1 px-4 pb-5 pt-8 sm:px-6 sm:pb-6 sm:pt-10 md:px-8">{children}</main>
      </div>
      <AssetLookupButton />
      <Toaster />
    </div>
  );
}
