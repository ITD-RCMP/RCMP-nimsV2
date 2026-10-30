import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronRight,
  Heart,
  IdCard,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  clearAllSessions,
  persistSession,
  readUserSession,
  type SessionUser,
} from '@shared/lib/auth-session';
import { getUserProfileFn, updateUserProfileFn } from '@backend/server/auth/auth.functions';
import {
  UserAppShell,
  UserLoadingScreen,
  UserPageHeader,
  UserSectionLabel,
  haptic,
  initialsOf,
} from '@/user/user-ui';
import { cn } from '@/lib/utils';

const FEEDBACK_URL = 'https://itd.rcmp.edu.my/feedback';

export function UserEditProfilePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionUser | null>(readUserSession);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [savedPhone, setSavedPhone] = useState('');

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
        setSavedPhone(profile.phone ?? '');
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load profile');
        setFullName(user.fullName);
        setEmail(user.email);
        setPhone(user.phone ?? '');
        setSavedPhone(user.phone ?? '');
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleSignOut = async () => {
    await clearAllSessions();
    void navigate({ to: '/' });
  };

  const dirty = phone.trim() !== savedPhone.trim();

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
        departmentId: updated.departmentId,
      };
      persistSession(nextSession);
      setSession(nextSession);
      setSavedPhone(updated.phone ?? '');
      setPhone(updated.phone ?? '');
      haptic([10, 40, 10]);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update profile');
    } finally {
      setSaving(false);
    }
  };

  if (!session) return <UserLoadingScreen />;

  const displayName = fullName || session.fullName;

  return (
    <UserAppShell active="profile" onSignOut={() => void handleSignOut()}>
      <main className="relative mx-auto max-w-lg px-4 pt-6">
        <UserPageHeader eyebrow="Account" title="Profile" />

        <section
          className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violet-100 via-violet-50 to-indigo-100 p-5 shadow-[0_16px_40px_-20px_rgba(76,29,149,0.35)] animate-rise-in"
          style={{ animationDelay: '60ms' }}
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/70 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-xl font-extrabold text-violet-700 shadow-md ring-4 ring-white/60 animate-pop-in">
              {initialsOf(displayName) || <User className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              {loading ? (
                <>
                  <span className="animate-shimmer block h-5 w-40 rounded-full" />
                  <span className="animate-shimmer mt-2 block h-3.5 w-52 rounded-full" />
                </>
              ) : (
                <>
                  <p className="truncate text-lg font-extrabold leading-tight">{displayName}</p>
                  <p className="truncate text-sm text-muted-foreground">{email}</p>
                </>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 font-mono text-[11px] font-bold text-violet-700">
                  {session.staffId}
                </span>
                {session.roleName && (
                  <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {session.roleName}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-6 animate-rise-in"
          style={{ animationDelay: '120ms' }}
        >
          <UserSectionLabel>Contact</UserSectionLabel>
          <div className="user-surface rounded-3xl p-4">
            <label htmlFor="profile-phone" className="text-xs font-bold">
              Phone number <span className="text-rose-500">*</span>
            </label>
            <div className="mt-2 flex h-14 items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/40 px-4 transition-all focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-200/60">
              <Phone className="h-5 w-5 shrink-0 text-violet-500" />
              <input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={loading}
                autoComplete="tel"
                inputMode="tel"
                placeholder="e.g. 012-3456789"
                className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Technician will use this phone number to contact you.
            </p>
            <div
              className={cn(
                'grid transition-all duration-300 ease-out',
                dirty ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <button
                  type="submit"
                  disabled={saving || !dirty}
                  className="user-cta flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-transform active:scale-[0.97] disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </form>

        <section className="mt-6 animate-rise-in" style={{ animationDelay: '180ms' }}>
          <UserSectionLabel>Account details</UserSectionLabel>
          <ul className="user-surface divide-y divide-violet-100 overflow-hidden rounded-3xl">
            <InfoRow icon={User} label="Full name" value={displayName} />
            <InfoRow icon={Mail} label="Email" value={email || session.email} />
            <InfoRow icon={IdCard} label="Staff ID" value={session.staffId} />
          </ul>
          <div className="mt-3 flex gap-2.5 rounded-2xl border border-sky-100 bg-sky-50/80 p-3.5 text-xs leading-relaxed text-sky-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Your personal data is managed by Microsoft. IT department does not have access to this data.
            </p>
          </div>
        </section>

        <section className="mt-6 animate-rise-in" style={{ animationDelay: '240ms' }}>
          <UserSectionLabel>More</UserSectionLabel>
          <ul className="user-surface divide-y divide-violet-100 overflow-hidden rounded-3xl">
            <li>
              <a
                href={FEEDBACK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-violet-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <Heart className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-sm font-semibold">Send feedback to ITD</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </a>
            </li>
            <li>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-rose-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <LogOut className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-sm font-semibold text-rose-600">Sign out</span>
              </button>
            </li>
          </ul>
        </section>
      </main>
    </UserAppShell>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value || '—'}</p>
      </div>
      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-label="Managed by Microsoft" />
    </li>
  );
}
