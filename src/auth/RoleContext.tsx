import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '../ops/model';

/**
 * Which environment is unlocked: the Player App or the Clubhouse OS. Staff sessions live only in
 * memory (a reload locks the tablet) and auto-lock after 15 minutes without interaction.
 * Server-side, staff authority is enforced by RLS (staff_members); this only gates the UI.
 */
interface RoleValue { role: Role; unlockStaff: (name: string) => void; lockStaff: () => void; staffName: string | null }
const Ctx = createContext<RoleValue | null>(null);
const IDLE_MS = 15 * 60_000;

export function RoleProvider({ children }: { children: ReactNode }) {
  const [staffName, setStaffName] = useState<string | null>(null);
  const lockStaff = useCallback(() => setStaffName(null), []);
  const unlockStaff = useCallback((name: string) => setStaffName(name), []);

  useEffect(() => {
    if (!staffName) return;
    let timer = setTimeout(lockStaff, IDLE_MS);
    const bump = () => { clearTimeout(timer); timer = setTimeout(lockStaff, IDLE_MS); };
    const evs = ['pointerdown', 'keydown'] as const;
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => { clearTimeout(timer); evs.forEach((e) => window.removeEventListener(e, bump)); };
  }, [staffName, lockStaff]);

  const value = useMemo(() => ({ role: (staffName ? 'staff' : 'player') as Role, unlockStaff, lockStaff, staffName }), [staffName, unlockStaff, lockStaff]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRole must be used inside <RoleProvider>');
  return v;
}
