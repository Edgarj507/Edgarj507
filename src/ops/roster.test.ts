import { blankContact, initialOps, inverseOf, opsReducer, type Contact, type OpsState, type Registration } from './model';
import { searchGolfers } from './roster';

const c = (first: string, last: string, phone: string): Contact => ({ first, last, phone, email: `${first.toLowerCase()}@example.com` });
const team = (id: string, eventId: string, name: string, cap: Contact, roster: Contact[] = [], paid = 0): Registration => ({
  id, eventId, teamName: name, captain: cap, roster: [...roster, blankContact(), blankContact(), blankContact()].slice(0, 3) as Registration['roster'],
  total: 600, paid, paidAt: 0, teeTime: '',
});
const setup = (): OpsState => {
  let s = initialOps();
  s = opsReducer(s, { type: 'staffRegister', reg: team('t1', 'kids-cup-2026', 'Fore Play', c('Pat', 'Walker', '507-555-0101'), [c('Quinn', 'Ortiz', '507-555-0102'), c('Rae', 'Lind', '507-555-0103'), c('Sam', 'Hart', '507-555-0104')], 600) }, 'organizer');
  return s;
};

describe('manual entry (organizer / staff)', () => {
  it('registers for the chosen tournament with price, payment and tee assignment', () => {
    const s = setup();
    expect(s.registrations[0]).toMatchObject({ eventId: 'kids-cup-2026', total: 600, paid: 600, teeTime: 'Shotgun · Hole 1' });
    expect(s.registrations[0].captain.phone).toBe('+15075550101');
  });
  it('refuses players, unknown events, duplicates in the same event, and full fields', () => {
    const r = team('t2', 'rotary-fall-2026', 'Birdies', c('Ann', 'Lee', '507-555-0110'));
    const s0 = initialOps();
    expect(opsReducer(s0, { type: 'staffRegister', reg: r }, 'player')).toBe(s0);
    expect(opsReducer(s0, { type: 'staffRegister', reg: { ...r, eventId: 'nope' } }, 'organizer')).toBe(s0);
    const s = setup();
    expect(opsReducer(s, { type: 'staffRegister', reg: team('t3', 'kids-cup-2026', 'Again', c('Pat', 'Walker', '(507) 555-0101')) }, 'organizer')).toBe(s);
    expect(opsReducer(s, { type: 'staffRegister', reg: team('t4', 'rotary-fall-2026', 'Other day', c('Pat', 'Walker', '(507) 555-0101')) }, 'organizer').registrations).toHaveLength(2); // other event is fine
    const tiny = { ...s0, events: s0.events.map((e) => (e.id === 'rotary-fall-2026' ? { ...e, teams: 1 } : e)) };
    const one = opsReducer(tiny, { type: 'staffRegister', reg: r }, 'staff');
    expect(opsReducer(one, { type: 'staffRegister', reg: team('t5', 'rotary-fall-2026', 'Late', c('Bo', 'Zed', '507-555-0120')) }, 'staff')).toBe(one);
  });
});

describe('cross-tournament search', () => {
  it('finds golfers by name tokens or phone digits in any slot', () => {
    const s = setup();
    const ev = s.events;
    expect(searchGolfers(s.registrations, ev, 'rae').map((h) => [h.contact.last, h.slot])).toEqual([['Lind', 1]]);
    expect(searchGolfers(s.registrations, ev, 'pat walk')[0].slot).toBe(-1);
    expect(searchGolfers(s.registrations, ev, '555-0104')[0].contact.first).toBe('Sam');
    expect(searchGolfers(s.registrations, ev, '+1 507 555 0102')[0].contact.first).toBe('Quinn');
    expect(searchGolfers(s.registrations, ev, 'x')).toEqual([]);
  });
});

describe('move / reassign', () => {
  it('moves a whole team with its payment to another date; undo restores it', () => {
    const s = setup();
    const a = { type: 'moveTeam' as const, id: 't1', toEventId: 'rotary-fall-2026' };
    const m = opsReducer(s, a, 'organizer');
    expect(m.registrations[0]).toMatchObject({ eventId: 'rotary-fall-2026', paid: 600, total: 480 });
    const back = opsReducer(m, inverseOf(s, a)!, 'organizer');
    expect(back.registrations).toEqual(s.registrations);
    expect(opsReducer(s, a, 'player')).toBe(s);
  });
  it('moves one player with their share; team keeps an open slot and the rest of the payment', () => {
    const s = setup();
    const a = { type: 'movePlayer' as const, id: 't1', slot: 1 as const, toEventId: 'rotary-fall-2026', newId: 'n1' };
    const m = opsReducer(s, a, 'staff');
    const left = m.registrations.find((r) => r.id === 't1')!;
    const moved = m.registrations.find((r) => r.id === 'n1')!;
    expect(left.roster[1].phone).toBe('');
    expect(left.paid).toBe(450);
    expect(moved).toMatchObject({ eventId: 'rotary-fall-2026', total: 120, paid: 120, teamName: 'Lind (moved)' });
    expect(moved.captain.first).toBe('Rae');
    const back = opsReducer(m, inverseOf(s, a)!, 'staff');
    expect(back.registrations).toEqual(s.registrations);
  });
  it('refuses moves into a tournament where the golfer is already registered', () => {
    let s = setup();
    s = opsReducer(s, { type: 'staffRegister', reg: team('t9', 'rotary-fall-2026', 'Dup', c('Rae', 'Lind', '507-555-0103')) }, 'staff');
    expect(opsReducer(s, { type: 'movePlayer', id: 't1', slot: 1, toEventId: 'rotary-fall-2026', newId: 'n2' }, 'staff')).toBe(s);
    expect(opsReducer(s, { type: 'moveTeam', id: 't1', toEventId: 'rotary-fall-2026' }, 'staff')).toBe(s);
  });
});
