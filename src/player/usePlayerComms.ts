import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { relevantBroadcasts, threadKey, type SosAlert } from '../ops/comms';
import type { OpsAction, OpsState } from '../ops/model';
import { newId } from '../ops/useOps';
import { haptic } from '../lib/haptics';

const SEEN_KEY = 'eg.bcast.seen.v1';
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; } };

/**
 * Golfer-side messaging, alerts and SOS on top of the ops store.
 *  • Chat: one thread with the clubhouse, keyed by the golfer's phone (or name).
 *  • Alerts: broadcasts addressed to this golfer; new critical ones buzz and, when the app is in
 *    the background and notifications are allowed, raise a system notification.
 *  • SOS: one active alert at a time; the golfer sees when staff acknowledge it.
 */
export function usePlayerComms(ops: OpsState, dispatch: (a: OpsAction) => void, me: { name: string; phone: string | null; onCourse: boolean; eventIds: string[] }) {
  const thread = threadKey(me.phone, me.name);
  const chat = useMemo(() => ops.messages.filter((m) => m.thread === thread).sort((a, b) => a.at - b.at), [ops.messages, thread]);
  const unreadChat = chat.filter((m) => m.from !== 'player' && !m.readByPlayer).length;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const alerts = useMemo(() => relevantBroadcasts(ops.broadcasts, { onCourse: me.onCourse, eventIds: me.eventIds, now }), [ops.broadcasts, me.onCourse, me.eventIds, now]);
  const [seen, setSeen] = useState<string[]>(readSeen);
  const unseen = alerts.filter((b) => !seen.includes(b.id));
  const markSeen = useCallback((ids: string[]) => setSeen((s) => {
    const next = [...new Set([...s, ...ids])].slice(-300);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  }), []);

  // Buzz / notify once per new alert.
  const notified = useRef(new Set<string>());
  useEffect(() => {
    for (const b of unseen) {
      if (notified.current.has(b.id)) continue;
      notified.current.add(b.id);
      haptic(b.severity === 'critical' ? 'error' : 'warning');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
        try { new Notification(b.title, { body: b.body, tag: `eg-${b.id}` }); } catch { /* unsupported */ }
      }
    }
  }, [unseen]);

  const send = (text: string) => dispatch({ type: 'message', msg: { id: newId(), thread, threadName: me.name, from: 'player', author: me.name, text, at: Date.now() } });
  const readChat = useCallback(() => dispatch({ type: 'readThread', thread, by: 'player' }), [dispatch, thread]);

  const mySos = ops.sos.find((a) => a.from === 'player' && a.name === me.name && (a.status === 'active' || a.status === 'acknowledged'));
  const raiseSos = (where: Pick<SosAlert, 'hole' | 'lat' | 'lng' | 'note'>) => {
    dispatch({ type: 'sos', alert: { id: newId(), from: 'player', name: me.name, phone: me.phone ?? undefined, at: Date.now(), status: 'active', ...where } });
    haptic('error');
  };
  const cancelSos = () => { if (mySos) dispatch({ type: 'sosCancel', id: mySos.id, name: me.name }); };

  return { thread, chat, unreadChat, send, readChat, alerts, unseen, markSeen, mySos, raiseSos, cancelSos, now };
}
export type PlayerComms = ReturnType<typeof usePlayerComms>;
