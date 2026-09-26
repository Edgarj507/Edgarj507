import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '../ops/model';

/**
 * Which environment is unlocked: the Player App or the Clubhouse OS. Staff sessions live only in
 * memory (a reload locks the tablet) and auto-lock after 15 minutes without interaction.
 * Server-side, staff authority is enforced by RLS (staff_members); this only gates the UI.
 */
interface RoleValue {
  role: Role; unlockStaff: (name: string) => void; lockStaff: () => void; staffName: string | null;
  /** Tournament organizer session (Organizer OS). Also memory-only with the same idle lock. */
  organizerName: string | null; unlockOrganizer: (name: string) => void; lockOrganizer: () => void;
}
const Ctx = createContext<RoleValue | null>(null);
const IDLE_MS = 15 * 60_000;

export function RoleProvider({ children }: { children: ReactNode }) {
  const [staffName, setStaffName] = useState<string | null>(null);
  const lockStaff = useCallback(() => setStaffName(null), []);
  const unlockStaff = useCallback((name: string) => setStaffName(name), []);
  const [organizerName, setOrganizerName] = useState<string | null>(null);
  const lockOrganizer = useCallback(() => setOrganizerName(null), []);
  const unlockOrganizer = useCallback((name: string) => setOrganizerName(name), []);
  const signedIn = staffName ?? organizerName;

  useEffect(() => {
    if (!signedIn) return;
    const lock = () => { lockStaff(); lockOrganizer(); };
    let timer = setTimeout(lock, IDLE_MS);
    const bump = () => { clearTimeout(timer); timer = setTimeout(lock, IDLE_MS); };
    const evs = ['pointerdown', 'keydown'] as const;
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => { clearTimeout(timer); evs.forEach((e) => window.removeEventListener(e, bump)); };
  }, [signedIn, lockStaff, lockOrganizer]);

  const value = useMemo(() => ({
    role: (staffName ? 'staff' : organizerName ? 'organizer' : 'player') as Role, unlockStaff, lockStaff, staffName, organizerName, unlockOrganizer, lockOrganizer,
  }), [staffName, organizerName, unlockStaff, lockStaff, unlockOrganizer, lockOrganizer]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRole must be used inside <RoleProvider>');
  return v;
}
