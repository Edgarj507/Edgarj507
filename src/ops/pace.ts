import { groupStatus, type Group } from './model';

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

const NAMES = [
  ['Hansen', 'Olson', 'Kruger', 'Lee'], ['Patel', 'Nguyen', 'Brooks'], ['Schmidt', 'Moore', 'Rivera', 'Kim'], ['Anderson', 'Berg'],
  ['Larson', 'Diaz', 'Walsh', 'Novak'], ['Johnson', 'Park', 'Ortiz'], ['Miller', 'Chen', 'Fischer', 'Ruiz'], ['Thompson', 'Ali', 'Grant', 'Holm'],
  ['Peterson', 'Young'], ['Nelson', 'Cruz', 'Baker', 'Wood'], ['Carlson', 'Ito', 'Frey'], ['Swanson', 'Lopez', 'Hill', 'Reed'],
  ['Erickson', 'Shah', 'Ward', 'Stone'], ['Lund', 'Price'], ['Hedlund', 'Morales', 'Gray', 'Webb'], ['Bauer', 'Kaur', 'Fox', 'Lang'],
];
// Minutes per hole; a few groups are slow so the radar has something to flag.
const PACE = [14, 14.4, 13.8, 15, 17.8, 14.2, 16.9, 14.5, 13.9, 14.8, 15.2, 14.1, 14.6, 13.7, 14.3, 14.5];
const INTERVAL_MIN = 16;

/** Demo tee sheet: tee times every 16 minutes, the first ~3h20m before `now`. */
export function demoGroups(now: number): Group[] {
  const start = Math.floor((now - 200 * 60_000) / (INTERVAL_MIN * 60_000)) * INTERVAL_MIN * 60_000;
  return NAMES.map((players, i) => ({
    id: `g${i + 1}`,
    name: players[0],
    players,
    teeTime: start + i * INTERVAL_MIN * 60_000,
    minPerHole: PACE[i],
  }));
}

/** Position of every group on the course, with its pace. */
export function placeGroups(groups: Group[], holePaths: LL[][], now: number) {
  return groups.map((g) => {
    const st = groupStatus(g, now);
    const path = holePaths[st.hole - 1] ?? holePaths[0];
    return { group: g, ...st, at: st.started && !st.finished && path ? alongPath(path, st.fraction) : null };
  });
}
