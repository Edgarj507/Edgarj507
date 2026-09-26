import { blankContact, localDate, type Contact, type OpsState, type Registration, type TeeBooking } from './model';

/**
 * Demo-mode data so the Clubhouse OS has something to manage before any real sign-ups: a field of
 * Kid's Cup teams (some short a player, some with a balance due) and a few of today's tee times.
 * Contacts use fictional 555-01xx numbers and example.com emails.
 */
const TEAMS: [string, string, string, number, number][] = [
  // team, captain first, captain last, players (1–4), paid ($ of 600)
  ['Grip It & Sip It', 'Dana', 'Smith', 4, 600], ['Bogey Brothers', 'Luis', 'Garcia', 4, 600],
  ['The Sandbaggers', 'Megan', 'Olson', 3, 450], ['Fairway Fund', 'Tom', 'Anderson', 4, 300],
  ['Kid’s Cup Crushers', 'Priya', 'Patel', 4, 600], ['Mulligan Mafia', 'Chris', 'Nelson', 2, 150],
  ['Birdie Bandits', 'Jen', 'Larson', 4, 600], ['Rochester Rollers', 'Sam', 'Kim', 4, 600],
  ['Chip Happens', 'Alex', 'Rivera', 3, 600], ['Grass Menagerie', 'Pat', 'Johnson', 4, 450],
  ['Tee Party', 'Robin', 'Moore', 4, 600], ['Hole in Fun', 'Casey', 'Berg', 4, 600],
  ['Shank Redemption', 'Jordan', 'Miller', 3, 300], ['Putt Pirates', 'Taylor', 'Swanson', 4, 600],
];
const FIRST = ['Ava', 'Ben', 'Cole', 'Drew', 'Eli', 'Faye', 'Gus', 'Hana', 'Ian', 'Jade', 'Kai', 'Lena'];
const LAST = ['Hansen', 'Lee', 'Novak', 'Ortiz', 'Park', 'Reed', 'Shah', 'Stone', 'Ward', 'Young'];

const contact = (first: string, last: string, n: number): Contact => ({
  first, last, phone: `+1507555${String(1000 + n).slice(-4)}`, email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com',
});

export function demoRegistrations(eventId: string, now = Date.now()): Registration[] {
  return TEAMS.map(([team, cf, cl, players, paid], i) => {
    const roster = [0, 1, 2].map((k) =>
      k < players - 1 ? contact(FIRST[(i * 3 + k) % FIRST.length], LAST[(i + k * 3) % LAST.length], 200 + i * 4 + k) : blankContact(),
    ) as Registration['roster'];
    return {
      id: `demo-team-${i + 1}`, eventId, teamName: team, captain: contact(cf, cl, 100 + i), roster,
      total: 600, paid, paidAt: now - (i + 2) * 86_400_000, teeTime: `Shotgun · Hole ${(i % 18) + 1}`,
    };
  });
}

export function demoTeeSheet(now = Date.now()): TeeBooking[] {
  const date = localDate(now);
  const b = (time: string, name: string, size: number, n: number, source: TeeBooking['source'] = 'app'): TeeBooking =>
    ({ id: `demo-tee-${time}`, date, time, status: 'reserved', name, size, phone: `+1507555${3000 + n}`, email: '', source });
  return [
    b('07:00', 'Hansen', 4, 1), b('07:10', 'Patel', 3, 2), b('07:30', 'Schmidt', 4, 3, 'phone'), b('08:00', 'Anderson', 2, 4),
    b('08:20', 'Larson', 4, 5), b('09:00', 'Johnson', 3, 6, 'phone'), b('10:10', 'Miller', 4, 7), b('11:40', 'Thompson', 4, 8),
    b('13:00', 'Peterson', 2, 9, 'walkup'), b('14:30', 'Nelson', 4, 10),
    { id: 'demo-tee-block-1', date, time: '12:00', status: 'blocked', name: 'Junior clinic', size: 0, phone: '', email: '', source: 'staff' },
    { id: 'demo-tee-block-2', date, time: '12:10', status: 'blocked', name: 'Junior clinic', size: 0, phone: '', email: '', source: 'staff' },
  ];
}

export function withDemoData(s: OpsState, eventId: string): OpsState {
  return { ...s, registrations: [...demoRegistrations(eventId), ...s.registrations], teeSheet: [...demoTeeSheet(), ...s.teeSheet] };
}
