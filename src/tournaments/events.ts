export interface EventInfo {
  id: string;
  name: string;
  course: string;
  date: string;
  format: string;
  foursomePrice: number;
  mulliganPrice: number;
  cause: string;
  teams: number;
}

/** Demo event catalogue (production: public.events). */
export const EVENTS: EventInfo[] = [
  {
    id: 'kids-cup-2026',
    name: "Kid's Cup Charity Tournament",
    course: 'Somerby Golf Club',
    date: 'Sat, Oct 17 · 8:00 AM shotgun',
    format: '4-person scramble',
    foursomePrice: 600,
    mulliganPrice: 10,
    cause: 'Benefits Rochester youth golf programs',
    teams: 36,
  },
];
