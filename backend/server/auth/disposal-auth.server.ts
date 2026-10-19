import { isDisposalUnitUser } from '@shared/lib/auth-session';

export function assertDisposalUnitRole(roleId: number, departmentId: number | null): void {
  if (!isDisposalUnitUser(roleId, departmentId)) {
    throw new Error('Disposal unit access is required. Sign in with a technician account in the disposal unit department to continue.');
  }
}
