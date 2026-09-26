import { useEffect } from 'react';
import { useRole } from '../auth/RoleContext';
import { staffService, useStaffState } from './useStaff';

/**
 * Keeps the signed-in session in step with the staff directory: a deactivated account is signed
 * out on every open terminal at once, and role / permission edits apply immediately.
 */
export function useSessionGuard() {
  const { session, update } = useRole();
  const staff = useStaffState();
  useEffect(() => {
    if (!session || session.id.startsWith('legacy:')) return;
    const fresh = staffService.refresh(session);
    if (!fresh) return update(null);
    if (JSON.stringify(fresh) !== JSON.stringify(session)) update(fresh);
  }, [staff, session, update]);
}
