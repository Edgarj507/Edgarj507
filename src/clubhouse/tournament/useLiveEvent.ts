import { useEffect, useMemo, useRef, useState } from 'react';
import { SOMERBY } from '../../data/course';
import { eventGroups, placeGroups } from '../../ops/pace';
import { POSITION_TTL_MS, type OpsState } from '../../ops/model';
import { normalizePhone } from '../../lib/sms';

export interface PaceToast { id: string; group: string; text: string }

/**
 * Live Event state for the tournament: group positions/pace and pace alerts. Computes nothing
 * unless the tournament is live — before the start there are no positions to show.
 */
export function useLiveEvent(ops: OpsState, eventId: string, clock: number) {
  const s = ops.settings;
  const [simOffset, setSimOffset] = useState(0); // demo only: fast-forward simulated pace
  const [toasts, setToasts] = useState<PaceToast[]>([]);
  const alerted = useRef(new Set<string>());
  const now = clock + simOffset;
  const holes = SOMERBY.data.holes;
  const regs = useMemo(() => ops.registrations.filter((r) => r.eventId === eventId), [ops.registrations, eventId]);

  const placed = useMemo(() => {
    if (!s.tournamentLive || !s.liveSince) return [];
    const groups = eventGroups(regs, s.liveSince, s.paceMinPerHole);
    const fresh = ops.positions.filter((p) => clock - p.at < POSITION_TTL_MS);
    return placeGroups(groups, holes.map((h) => h.path), now, s.paceMinPerHole).map((g) => {
      // A real on-property GPS fix from anyone in the group replaces the simulated dot.
      const reg = regs.find((r) => r.id === g.group.id);
      const phones = reg ? [reg.captain, ...reg.roster].map((c) => normalizePhone(c.phone)).filter(Boolean) : [];
      const fix = fresh.find((p) => phones.includes(p.phone));
      return fix ? { ...g, at: [fix.lat, fix.lng] as [number, number], gps: true } : { ...g, gps: false };
    });
  }, [s.tournamentLive, s.liveSince, s.paceMinPerHole, regs, ops.positions, holes, now, clock]);

  // One alert when a group crosses the staff-defined limit; re-arms once it recovers.
  useEffect(() => {
    if (!s.tournamentLive) { alerted.current.clear(); setToasts([]); setSimOffset(0); return; }
    const fresh: PaceToast[] = [];
    for (const g of placed) {
      const late = g.started && !g.finished && g.behindMin > s.paceAlertMin;
      if (late && !alerted.current.has(g.group.id)) {
        alerted.current.add(g.group.id);
        fresh.push({ id: `${g.group.id}-${now}`, group: g.group.id, text: `${g.group.name} is +${g.behindMin} mins behind pace on Hole ${g.hole}` });
      } else if (!late) alerted.current.delete(g.group.id);
    }
    if (fresh.length) setToasts((t) => [...fresh, ...t].slice(0, 5));
  }, [placed, s.tournamentLive, s.paceAlertMin, now]);
  useEffect(() => {
    if (!toasts.length) return;
    const id = setTimeout(() => setToasts((t) => t.slice(0, -1)), 12_000);
    return () => clearTimeout(id);
  }, [toasts]);

  return {
    regs, holes, placed, now, toasts,
    dismiss: (id: string) => setToasts((t) => t.filter((x) => x.id !== id)),
    fastForward: () => setSimOffset((o) => o + 15 * 60_000),
  };
}
