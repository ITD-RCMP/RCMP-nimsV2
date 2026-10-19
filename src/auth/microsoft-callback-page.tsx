import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NimsLogo } from '@/components/brand/NimsLogo';
import { getPostLoginPath, persistSession } from '@shared/lib/auth-session';
import { completeMicrosoftLoginFn } from '@backend/server/auth/auth.functions';

export const MICROSOFT_OAUTH_STATE_KEY = 'nims-microsoft-oauth-state';

export function MicrosoftCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error_description') ?? params.get('error');
    const code = params.get('code');
    const returnedState = params.get('state');

    if (oauthError) {
      setError(oauthError);
      return;
    }

    const savedState = sessionStorage.getItem(MICROSOFT_OAUTH_STATE_KEY);
    sessionStorage.removeItem(MICROSOFT_OAUTH_STATE_KEY);

    if (!code || !returnedState || !savedState || returnedState !== savedState) {
      setError('Invalid Microsoft sign-in response. Please try again from the login page.');
      return;
    }

    void completeMicrosoftLoginFn({ data: { code, state: returnedState } })
      .then((user) => {
        persistSession(user);
        if (user.accountCreated) {
          toast.success(
            `Welcome, ${user.fullName}! Your account is ready — you can submit equipment requests anytime.`,
          );
        } else {
          toast.success(`Signed in as ${user.fullName}`);
        }
        void navigate({ to: getPostLoginPath(user.roleId, user.departmentId) });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Microsoft sign-in failed';
        setError(message);
        toast.error(message);
      });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-[20px] border border-border/60 bg-card p-8 text-center shadow-xl">
        <NimsLogo size="lg" variant="light" />
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-destructive">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button className="w-full rounded-[8px]" asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Completing Microsoft sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
}
