import { useEffect, useState } from 'react';
import { createStaffService } from './service';
import type { StaffState } from './model';

const DEMO = !import.meta.env.VITE_SUPABASE_URL;
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eg-staff') : null;
const listeners = new Set<(s: StaffState) => void>();

const kv = {
  getItem: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* quota / private mode */ } },
};

/** One staff service per page; every change reaches this tab's hooks and other tabs. */
export const staffService = createStaffService(kv, {
  demoOutbox: DEMO,
  onChange: (s) => { listeners.forEach((fn) => fn(s)); chan?.postMessage('changed'); },
});

export function useStaffState(): StaffState {
  const [s, setS] = useState(staffService.read);
  useEffect(() => {
    const onMsg = () => setS(staffService.read());
    listeners.add(setS);
    chan?.addEventListener('message', onMsg);
    window.addEventListener('storage', onMsg);
    return () => { listeners.delete(setS); chan?.removeEventListener('message', onMsg); window.removeEventListener('storage', onMsg); };
  }, []);
  return s;
}
