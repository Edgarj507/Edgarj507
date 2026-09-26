import { groupStatus, type Group, type Registration } from './model';

type LL = [number, number];

/** Point at fraction `f` (0..1) of the way along a polyline of [lat, lng] (planar; fine at hole scale). */
export function alongPath(path: LL[], f: number): LL {
  if (path.length === 1) return path[0];
  const seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], (p[1] - path[i][1]) * Math.cos((p[0] * Math.PI) / 180)));
  let left = Math.max(0, Math.min(1, f)) * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, left / seg[i]) : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    left -= seg[i];
  }
  return path[path.length - 1];
}

/** Stable 0..1 value from a string. */
function unit(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Shotgun start: every registered team tees off at `liveSince` on its own hole (team n → hole n,
 * wrapping at 18). Until real phone GPS arrives, each team's pace is simulated around the target;
 * roughly one in four plays slow enough to trip the alert.
 */
export function eventGroups(regs: Registration[], liveSince: number, target: number): Group[] {
  return regs.map((r, i) => {
    const u = unit(r.id);
    const minPerHole = u > 0.75 ? target + 2.2 + u * 1.5 : target - 0.8 + u * 1.6;
    return {
      id: r.id,
      name: `Group ${i + 1} (${r.captain.last.split(' ')[0] || r.teamName})`,
      players: [r.captain, ...r.roster].filter((c) => c.first).map((c) => `${c.first} ${c.last}`),
      teeTime: liveSince,
      minPerHole: Math.round(minPerHole * 10) / 10,
      startHole: (i % 18) + 1,
    };
  });
}

/** Position of every group on the course, with its pace against the target. */
export function placeGroups(groups: Group[], holePaths: LL[][], now: number, target: number) {
  return groups.map((g) => {
    const st = groupStatus(g, now, target);
    const path = holePaths[st.hole - 1] ?? holePaths[0];
    return { group: g, ...st, at: st.started && !st.finished && path ? alongPath(path, st.fraction) : null };
  });
}
