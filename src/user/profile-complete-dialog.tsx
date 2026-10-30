import { useEffect, useState } from 'react';
import { Loader2, Lock, Mail, Phone, User, UserRoundPen } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { persistSession, type SessionUser } from '@shared/lib/auth-session';
import { isUserProfileComplete, missingUserProfileFields } from '@shared/lib/user-profile';
import { updateUserProfileFn } from '@backend/server/auth/auth.functions';

type UserProfileCompleteDialogProps = {
  session: SessionUser;
  open: boolean;
  onCompleted: (session: SessionUser) => void;
};

export function UserProfileCompleteDialog({
  session,
  open,
  onCompleted,
}: UserProfileCompleteDialogProps) {
  const [phone, setPhone] = useState(session.phone ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(session.phone ?? '');
  }, [session]);

  const missing = missingUserProfileFields({
    fullName: session.fullName,
    email: session.email,
    phone,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const draftPhone = phone.trim() || null;

    if (
      !isUserProfileComplete({
        fullName: session.fullName,
        email: session.email,
        phone: draftPhone,
      })
    ) {
      toast.error('Please fill in all required profile fields');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateUserProfileFn({
        data: { phone: draftPhone },
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
      toast.success('Profile complete — you can submit your request');
      onCompleted(nextSession);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[28px] border-violet-100 bg-[#fbfaff] p-0 sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="relative bg-gradient-to-br from-violet-100 via-violet-50 to-indigo-100 px-6 pb-5 pt-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/70 blur-2xl" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-md animate-pop-in">
            <UserRoundPen className="h-6 w-6" />
          </span>
          <DialogHeader className="relative mt-3 text-left">
            <DialogTitle className="text-xl font-extrabold tracking-tight">Complete your profile</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Add your phone number before submitting an equipment request. Technicians use this
              information to reach you about bookings and returns.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 pb-6 pt-5">
          {missing.length > 0 && (
            <p className="rounded-2xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900">
              Still needed: {missing.join(', ')}
            </p>
          )}

          <ul className="user-surface divide-y divide-violet-100 overflow-hidden rounded-2xl">
            <ReadOnlyRow icon={User} value={session.fullName} />
            <ReadOnlyRow icon={Mail} value={session.email} />
          </ul>

          <div>
            <label htmlFor="complete-phone" className="text-xs font-bold">
              Phone number <span className="text-rose-500">*</span>
            </label>
            <div className="mt-2 flex h-14 items-center gap-3 rounded-2xl border border-violet-100 bg-white px-4 transition-all focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-200/60">
              <Phone className="h-5 w-5 shrink-0 text-violet-500" />
              <input
                id="complete-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                inputMode="tel"
                placeholder="e.g. 012-3456789"
                className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="user-cta flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyRow({ icon: Icon, value }: { icon: typeof User; value: string }) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <Icon className="h-4 w-4 shrink-0 text-violet-500" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{value || '—'}</span>
      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-label="Managed by Microsoft" />
    </li>
  );
}
