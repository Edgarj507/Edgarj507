import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '../ops/model';
import type { Permission, StaffScope, StaffSession } from '../staff/model';

/**
 * Which environment is unlocked — Player App, Clubhouse OS (course staff) or Tournament OS
 * (organizer staff) — and who is at the terminal.
 *
 *  • Sessions live only in memory: a reload signs out.
 *  • `lock()` keeps the terminal in staff mode behind the PIN lock screen so the next person can
 *    quick-switch with their own PIN; 5 idle minutes lock automatically, 60 sign out entirely.
 *  • `can(permission)` gates screens and actions in the UI. The server enforces the same
 *    permissions (staff_members + RLS, SECURITY.md §15).
 */
interface RoleValue {
  role: Role;
  session: StaffSession | null;
  locked: boolean;
  staffName: string | null;
  organizerName: string | null;
  can: (p: Permission) => boolean;
  /** Sign a staff member into a scope (after PIN / password). */
  signIn: (s: StaffSession) => void;
  /** Lock screen (quick-switch). */
  lock: () => void;
  /** Leave staff mode entirely. */
  signOut: () => void;
  /** Keep the session in step with the directory (role / permission edits, deactivation). */
  update: (s: StaffSession | null) => void;
  // Back-compat aliases used across the app.
  lockStaff: () => void;
  lockOrganizer: () => void;
  unlockStaff: (name: string) => void;
  unlockOrganizer: (name: string) => void;
}
const Ctx = createContext<RoleValue | null>(null);
const LOCK_IDLE_MS = 5 * 60_000;
const SIGNOUT_IDLE_MS = 60 * 60_000;

const legacy = (scope: StaffScope, name: string): StaffSession => ({
  id: `legacy:${scope}`, scope, name, role: 'owner', owner: true,
  permissions: scope === 'clubhouse'
    ? ['teeSheet', 'orders', 'store', 'pricing', 'messages', 'broadcasts', 'tournament', 'reports', 'support', 'settings', 'staff']
    : ['events', 'roster', 'checkin', 'broadcasts', 'weather', 'staff'],
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [locked, setLocked] = useState(false);
  const signIn = useCallback((s: StaffSession) => { setSession(s); setLocked(false); }, []);
  const lock = useCallback(() => setLocked(true), []);
  const signOut = useCallback(() => { setSession(null); setLocked(false); }, []);
  const update = useCallback((s: StaffSession | null) => { if (s) setSession(s); else { setSession(null); setLocked(false); } }, []);

  useEffect(() => {
    if (!session) return;
    let lockT = setTimeout(lock, LOCK_IDLE_MS);
    let outT = setTimeout(signOut, SIGNOUT_IDLE_MS);
    const bump = () => { clearTimeout(lockT); clearTimeout(outT); lockT = setTimeout(lock, LOCK_IDLE_MS); outT = setTimeout(signOut, SIGNOUT_IDLE_MS); };
    const evs = ['pointerdown', 'keydown'] as const;
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => { clearTimeout(lockT); clearTimeout(outT); evs.forEach((e) => window.removeEventListener(e, bump)); };
  }, [session, lock, signOut]);

  const value = useMemo<RoleValue>(() => {
    const role: Role = session?.scope === 'clubhouse' ? 'staff' : session?.scope === 'tournament' ? 'organizer' : 'player';
    return {
      role, session, locked,
      staffName: session?.scope === 'clubhouse' ? session.name : null,
      organizerName: session?.scope === 'tournament' ? session.name : null,
      can: (p) => !!session && !locked && session.permissions.includes(p),
      signIn, lock, signOut, update,
      lockStaff: lock, lockOrganizer: signOut,
      unlockStaff: (name) => signIn(legacy('clubhouse', name)),
      unlockOrganizer: (name) => signIn(legacy('tournament', name)),
    };
  }, [session, locked, signIn, lock, signOut, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRole must be used inside <RoleProvider>');
  return v;
}
