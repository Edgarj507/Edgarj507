export interface EventInfo {
  id: string;
  name: string;
  course: string;
  /** Short line used in lists and invite texts. */
  date: string;
  /** Full date, start time and location for the signup page. */
  longDate: string;
  time: string;
  location: string;
  /** Default organizer message (the organizer can replace it in the Clubhouse OS). */
  organizerText: string;
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
    longDate: 'Saturday, October 17, 2026',
    time: 'Check-in 7:00 AM · 8:00 AM shotgun start',
    location: 'Somerby Golf Club · Byron, MN',
    organizerText: 'Join us for a day of golf supporting Rochester youth golf! Every foursome includes lunch, range balls and a post-round awards reception.\nMulligans sold on course, and every dollar goes to junior programs.',
    format: '4-person scramble',
    foursomePrice: 600,
    mulliganPrice: 10,
    cause: 'Benefits Rochester youth golf programs',
    teams: 36,
  },
];
