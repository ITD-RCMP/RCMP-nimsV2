import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { IdCard, Mail, Phone, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/sonner';
import {
  clearAllSessions,
  persistSession,
  readUserSession,
  type SessionUser,
} from '@shared/lib/auth-session';
import { getUserProfileFn, updateUserProfileFn } from '@backend/server/auth/auth.functions';
import { FormField } from '@/itd/deploy-return-fields';
import { UserPageChrome } from '@/user/user-chrome';

export function UserEditProfilePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionUser | null>(readUserSession);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const user = readUserSession();
    if (!user) {
      void navigate({ to: '/login' });
      return;
    }
    setSession(user);
    void getUserProfileFn()
      .then((profile) => {
        setFullName(profile.fullName);
        setEmail(profile.email);
        setPhone(profile.phone ?? '');
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load profile');
        setFullName(user.fullName);
        setEmail(user.email);
        setPhone(user.phone ?? '');
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleSignOut = async () => {
    await clearAllSessions();
    void navigate({ to: '/' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setSaving(true);
    try {
      const updated = await updateUserProfileFn({
        data: { phone: phone.trim() || null },
      });
      const nextSession: SessionUser = {
        staffId: updated.staffId,
        fullName: updated.fullName,
        email: updated.email,
        roleId: updated.roleId,
        roleName: updated.roleName,
        phone: updated.phone,
      };
      persistSession(nextSession);
      setSession(nextSession);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update profile');
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
      <UserPageChrome onSignOut={handleSignOut} active="profile" />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">User Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your personal data is managed by Microsoft. IT department does not have access to this data.</p>
        </div>

        <Card className="rounded-[16px] border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold">User Details</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <FormField label="Full name">
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={fullName} disabled className="rounded-[8px] bg-muted/50 pl-9" />
                  </div>
                  <p className="text-sm text-muted-foreground">Managed by Microsoft</p>
                </FormField>
                <FormField label="Email">
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      disabled
                      className="rounded-[8px] bg-muted/50 pl-9"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">Managed by Microsoft</p>
                </FormField>
                <FormField label="Phone number" required>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      autoComplete="tel"
                      className="rounded-[8px] pl-9"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Technician will use this phone number to contact you.
                  </p>
                </FormField>

                <Button type="submit" className="w-full rounded-[8px]" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
      <Toaster />
    </div>
  );
}

