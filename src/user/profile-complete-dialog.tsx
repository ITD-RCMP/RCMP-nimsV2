import { useEffect, useState } from 'react';
import { Mail, Phone, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { persistSession, type SessionUser } from '@shared/lib/auth-session';
import { isUserProfileComplete, missingUserProfileFields } from '@shared/lib/user-profile';
import { updateUserProfileFn } from '@backend/server/auth/auth.functions';
import { FormField } from '@/itd/deploy-return-fields';

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
        className="rounded-[14px] sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Complete your profile</DialogTitle>
          <DialogDescription>
            Add your phone number before submitting an equipment request. Technicians use this
            information to reach you about bookings and returns.
          </DialogDescription>
        </DialogHeader>

        {missing.length > 0 && (
          <p className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Still needed: {missing.join(', ')}
          </p>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <FormField label="Full name">
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={session.fullName} disabled className="rounded-[8px] bg-muted/50 pl-9" />
            </div>
          </FormField>
          <FormField label="Email">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={session.email}
                disabled
                className="rounded-[8px] bg-muted/50 pl-9"
              />
            </div>
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
                placeholder="e.g. 012-3456789"
                className="rounded-[8px] pl-9"
              />
            </div>
          </FormField>

          <DialogFooter>
            <Button type="submit" className="w-full rounded-[8px] sm:w-auto" disabled={saving}>
              {saving ? 'Saving…' : 'Save and continue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
