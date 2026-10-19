import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { NimsLogo } from '@/components/brand/NimsLogo';
import { persistSession, getPostLoginPath } from '@shared/lib/auth-session';
import {
  devLoginAsAdminFn,
  devLoginAsTechnicianFn,
  devLoginAsUserFn,
  devLoginAsDisposalUnitFn,
  getMicrosoftLoginUrlFn,
} from '@backend/server/auth/auth.functions';
import { getLoginMaintenanceModeFn } from '@backend/server/operations/system-settings.functions';
import { LOGIN_MAINTENANCE_MESSAGE } from '@shared/lib/system-settings';
import { MICROSOFT_OAUTH_STATE_KEY } from '@/auth/microsoft-callback-page';

function MicrosoftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1" y="1" width="10.5" height="10.5" rx="1" fill="#f35325" />
      <rect x="12.5" y="1" width="10.5" height="10.5" rx="1" fill="#81bc06" />
      <rect x="1" y="12.5" width="10.5" height="10.5" rx="1" fill="#00a4ef" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" rx="1" fill="#ffba08" />
    </svg>
  );
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { reason?: 'timeout' } => ({
    reason: search.reason === 'timeout' ? 'timeout' : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Sign in | NIMS' },
      { name: 'description', content: 'Sign in to NIMS to manage your inventory.' },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { reason } = Route.useSearch();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(!import.meta.env.DEV);
  const [devRole, setDevRole] = useState<'technician' | 'admin' | 'user' | 'disposal-unit' | null>(null);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const microsoftStarted = useRef(false);

  const handleMicrosoftSignIn = async () => {
    setIsLoading(true);

    try {
      const { url, state } = await getMicrosoftLoginUrlFn();
      sessionStorage.setItem(MICROSOFT_OAUTH_STATE_KEY, state);
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in unavailable';
      toast.error(message);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      void getLoginMaintenanceModeFn()
        .then(({ enabled }) => setMaintenanceEnabled(enabled))
        .catch(() => setMaintenanceEnabled(false))
        .finally(() => setMaintenanceLoading(false));
      return;
    }

    if (reason === 'timeout') {
      setIsLoading(false);
      return;
    }

    if (microsoftStarted.current) return;
    microsoftStarted.current = true;
    void handleMicrosoftSignIn();
  }, [reason]);

  const handleDevLogin = async (role: 'technician' | 'admin' | 'user' | 'disposal-unit') => {
    setDevRole(role);
    setIsLoading(true);

    try {
      const user =
        role === 'admin'
          ? await devLoginAsAdminFn()
          : role === 'technician'
            ? await devLoginAsTechnicianFn()
            : role === 'disposal-unit'
              ? await devLoginAsDisposalUnitFn()
              : await devLoginAsUserFn();
      persistSession(user);
      toast.success(`Dev sign-in as ${user.fullName}`);
      void navigate({ to: getPostLoginPath(user.roleId, user.departmentId) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dev sign-in unavailable';
      toast.error(message);
      setIsLoading(false);
      setDevRole(null);
    }
  };

  if (!import.meta.env.DEV) {
    return (
      <div className="relative min-h-screen bg-background">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[200px] right-[10%] h-[600px] w-[600px] rounded-full bg-lavender/[0.12] blur-[100px]" />
          <div className="absolute -top-[100px] -left-[200px] h-[500px] w-[500px] rounded-full bg-[oklch(0.65_0.20_350)]/[0.08] blur-[80px]" />
        </div>
        <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm space-y-6 rounded-[20px] border border-border/60 bg-card p-8 shadow-xl shadow-lavender/5">
            <div className="flex flex-col items-center gap-4 text-center">
              <NimsLogo size="lg" variant="light" />
              <div>
                <h1 className="text-xl font-bold leading-[0.96] tracking-[-0.02em] text-foreground sm:text-2xl">
                  Welcome to NIMS
                </h1>
                <p className="mt-2 text-sm leading-[1.5] text-muted-foreground">
                  {reason === 'timeout'
                    ? 'Sign in again to continue.'
                    : 'Redirecting to Microsoft sign-in…'}
                </p>
              </div>
            </div>

            {reason === 'timeout' && (
              <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-900 dark:text-amber-200">
                You were signed out due to inactivity.
              </div>
            )}

            {isLoading ? (
              <div className="flex h-11 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting to Microsoft…
              </div>
            ) : (
              <Button
                type="button"
                className="h-11 w-full gap-2 rounded-[8px] bg-foreground font-semibold text-background hover:opacity-90"
                onClick={() => void handleMicrosoftSignIn()}
              >
                <MicrosoftIcon />
                Sign in with Microsoft
              </Button>
            )}
          </div>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[200px] right-[10%] h-[600px] w-[600px] rounded-full bg-lavender/[0.12] blur-[100px]" />
        <div className="absolute -top-[100px] -left-[200px] h-[500px] w-[500px] rounded-full bg-[oklch(0.65_0.20_350)]/[0.08] blur-[80px]" />
      </div>
      <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
        <Link
          to="/"
          className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="w-full max-w-sm space-y-6 rounded-[20px] border border-border/60 bg-card p-8 shadow-xl shadow-lavender/5">
          <div className="flex flex-col items-center gap-4 text-center">
            <NimsLogo size="lg" variant="light" />
            <div>
              <h1 className="text-xl font-bold leading-[0.96] tracking-[-0.02em] text-foreground sm:text-2xl">
                Welcome to NIMS
              </h1>
              <p className="mt-2 text-sm leading-[1.5] text-muted-foreground">
                Use a development account to sign in locally.
              </p>
            </div>
          </div>

          {reason === 'timeout' && (
            <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-900 dark:text-amber-200">
              You were signed out due to inactivity.
            </div>
          )}

          {!maintenanceLoading && maintenanceEnabled && (
            <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-900 dark:text-amber-200">
              {LOGIN_MAINTENANCE_MESSAGE} - if you want to make request, please contact the IT Department or come to the office at Avicenna Building, Level 1.
            </div>
          )}

          {maintenanceLoading ? (
            <div className="flex h-11 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking system status…
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-xs font-medium text-muted-foreground">
                Development only
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-[8px] border-dashed font-medium"
                disabled={isLoading}
                onClick={() => void handleDevLogin('user')}
              >
                {devRole === 'user' && isLoading ? 'Signing in…' : 'Login as User'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-[8px] border-dashed font-medium"
                disabled={isLoading}
                onClick={() => void handleDevLogin('technician')}
              >
                {devRole === 'technician' && isLoading
                  ? 'Signing in…'
                  : 'Login as Technician'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-[8px] border-dashed font-medium"
                disabled={isLoading}
                onClick={() => void handleDevLogin('admin')}
              >
                {devRole === 'admin' && isLoading ? 'Signing in…' : 'Login as Admin'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-[8px] border-dashed font-medium"
                disabled={isLoading}
                onClick={() => void handleDevLogin('disposal-unit')}
              >
                {devRole === 'disposal-unit' && isLoading
                  ? 'Signing in…'
                  : 'Login as Disposal unit'}
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            All the personal data is managed by Microsoft Entra ID. We do not store any of your personal data in our database.
          </p>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
