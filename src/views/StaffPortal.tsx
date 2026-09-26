import { StaffAuth } from '../staff/StaffAuth';

/**
 * Clubhouse OS sign-in: per-staff PIN (quick-switch), email + password, password recovery and,
 * on first run, owner-account setup (only after the course is verified). See staff/StaffAuth.
 */
export function StaffPortal({ onClose }: { onClose: () => void }) {
  return <StaffAuth scope="clubhouse" onClose={onClose} />;
}
