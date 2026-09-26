/**
 * Legal documents shown in the Player App. These are plain-language TEMPLATES to get the product
 * flow right; have a licensed attorney review and adapt them (jurisdiction, entity name, refund
 * terms, arbitration, state-specific waiver rules) before launch.
 *
 * Bump a document's `version` whenever its text changes materially; players are asked to accept
 * the new version.
 */
export type LegalDocId = 'tos' | 'privacy' | 'waiver';

export interface LegalDoc { id: LegalDocId; title: string; short: string; version: string; updated: string; sections: { h: string; p: string[] }[] }

const COMPANY = 'Exclusive.Golf';
const CONTACT = 'support@exclusive.golf';

export const LEGAL: Record<LegalDocId, LegalDoc> = {
  tos: {
    id: 'tos',
    title: 'Terms of Service & EULA',
    short: 'Terms of Service',
    version: '2026-09-26',
    updated: 'September 26, 2026',
    sections: [
      { h: '1. Agreement', p: [`These Terms of Service and End User License Agreement ("Terms") govern your use of the ${COMPANY} app and services. By creating an account or using the app you agree to these Terms. If you do not agree, do not use the app.`] },
      { h: '2. Eligibility & accounts', p: ['You must be at least 13 years old to use the app, and 18 (or the age of majority where you live) to buy tickets or place orders. You are responsible for your account, for keeping your sign-in methods (phone, Face ID, passwords) secure, and for everything done under your account. Give accurate information, including for teammates you register.'] },
      { h: '3. License (EULA)', p: [`${COMPANY} grants you a personal, revocable, non-exclusive, non-transferable license to install and use the app on devices you own or control, for your own non-commercial use. You may not copy, modify, reverse engineer, resell, or use the app to build a competing service, or remove proprietary notices. App-store terms (Apple, Google) also apply; they are not parties to these Terms and are not responsible for the app.`] },
      { h: '4. Conduct', p: ['Do not misuse the app: no harassment, false reports (including course pins), spam, scraping, attempts to access staff tools or other people’s data, or interfering with the service. Follow course rules and staff instructions at all times. We may suspend accounts that break these rules.'] },
      { h: '5. Distances & advice', p: ['Yardages, “plays like” numbers, club recommendations, weather and pin positions are estimates for entertainment and practice. They may be wrong. Rely on your own judgment and course markers; you are responsible for your shots and safety.'] },
      { h: '6. Tickets, orders & payments', p: ['Tournament tickets are sold on behalf of the event organizer, whose refund and rain policies apply. Balances owed for a team are the captain’s responsibility. On-course food, beverage and pro shop orders are fulfilled by the course; prices are set by the course and confirmed at checkout. Charity purchases (such as mulligans) are donations and are generally non-refundable.'] },
      { h: '7. Your content', p: ['You keep ownership of content you submit (scores, photos, reports). You grant us a license to host and display it to operate the service according to your privacy settings.'] },
      { h: '8. Termination', p: ['You can stop using the app and delete your account at any time in Settings. We may suspend or end access if you break these Terms or to protect players, courses or the service.'] },
      { h: '9. Disclaimers & limitation of liability', p: [`The app is provided "as is" without warranties of any kind. To the maximum extent permitted by law, ${COMPANY} is not liable for indirect, incidental or consequential damages, or for more than the amount you paid us in the 12 months before the claim. Nothing in these Terms limits liability that cannot be limited by law.`] },
      { h: '10. Changes & governing law', p: ['We may update these Terms; we will ask you to accept material changes. These Terms are governed by the laws of the State of Minnesota, USA, except where your local law requires otherwise. [Counsel to confirm venue / dispute-resolution terms.]'] },
      { h: '11. Contact', p: [`Questions: ${CONTACT}.`] },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    short: 'Privacy Policy',
    version: '2026-09-26',
    updated: 'September 26, 2026',
    sections: [
      { h: 'What we collect', p: ['Account: name, mobile number, email, handle. Golf: rounds, scores, shots, bag and club data, course downloads. Purchases: tournament registrations, team rosters you enter, orders (items, time, hole). Device: app version and crash data. Location: see below.'] },
      { h: 'Location & geofencing', p: [
        'Live tracking is strictly limited to your scheduled tee time and only activates upon arrival at the facility.',
        'Your location is shared with the course only while (1) a tournament or scheduled round you are registered for is live, and (2) your phone is physically on the course property — inside the course boundary plus a 250-foot buffer for GPS drift and parking-lot arrival.',
        'Before you arrive, and the moment you leave that boundary, the app stops sending location and deletes your last shared position (auto-kill switch). No off-property tracking is permitted — not at home, at a hotel, or on the way to the course.',
        'The course sees only your most recent on-property position (for pace of play and delivering orders). All positions are deleted when the event ends. On-course GPS for your own distances stays on your device unless you share a pin report.',
        'You can deny location permission at any time in your phone’s settings; distances and ordering still work with reduced accuracy.',
      ] },
      { h: 'How we use data', p: ['To run the app (distances, scoring, ordering), to let courses and organizers run events (rosters, payments, pace of play, delivery), to secure accounts, and to improve the service. We do not sell your personal information.'] },
      { h: 'Who we share with', p: ['The course and event organizer for events you join or orders you place (name, team, contact details you provided, order and on-property location). Payment processors to take payments. Service providers that host our data under contract. Other golfers only according to your visibility settings. Authorities when required by law.'] },
      { h: 'Teammates you register', p: ['If you enter a teammate’s name, phone and email, you confirm you have their permission. We use it only to manage that event (and the invite text you choose to send from your own phone).'] },
      { h: 'Retention & deletion', p: ['Live positions: deleted when the event ends. Orders and registrations: kept as business records for the course and for tax purposes. You can delete your account and personal data in Settings; some records may be retained where the law requires.'] },
      { h: 'Your choices', p: ['Control who sees your stats and handicap, turn off community pins, deny location, and access, correct or delete your data. Residents of certain states (e.g., California) have additional rights; contact us to exercise them.'] },
      { h: 'Security', p: ['Encryption in transit, row-level access controls on our database, and minimal data collection. No system is perfectly secure; tell us about any concern.'] },
      { h: 'Children', p: ['The app is not directed to children under 13, and we do not knowingly collect their data.'] },
      { h: 'Contact', p: [`Privacy questions or requests: ${CONTACT}.`] },
    ],
  },
  waiver: {
    id: 'waiver',
    title: 'Liability Waiver & Release',
    short: 'Liability Waiver',
    version: '2026-09-26',
    updated: 'September 26, 2026',
    sections: [
      { h: 'Assumption of risk', p: ['Golf involves risks including being struck by golf balls or clubs, uneven terrain, water hazards, heat, lightning and other weather, and wildlife. I understand these risks and voluntarily accept them. I will seek shelter when play is suspended for weather.'] },
      { h: 'Golf cart safety', p: ['If I drive a cart I hold a valid driver’s license (or meet the course’s minimum age), obey course cart rules and signage, keep all occupants seated with limbs inside, carry no more riders than seats, avoid wet or restricted areas, and never drive while impaired by alcohol or drugs. I am responsible for injury or damage caused by carts I operate.'] },
      { h: 'Property damage', p: ['I am responsible for damage I cause to the course, carts, equipment, buildings, vehicles or homes bordering the course (including from errant golf balls), and I will follow course repair rules (divots, ball marks, bunkers).'] },
      { h: 'Tournament participation', p: ['I will follow the organizer’s rules and decisions, including format, handicaps, pace of play and weather calls. Entry fees and charity purchases may be non-refundable per the organizer’s policy. I consent to being photographed or filmed at the event for event promotion, unless I tell the organizer in writing.'] },
      { h: 'Alcohol', p: ['Alcohol is served only to guests of legal drinking age with valid ID, and service may be refused at staff discretion.'] },
      { h: 'Release', p: ['To the fullest extent permitted by law, I release and agree not to sue the course, the event organizer, and Exclusive.Golf, and their owners, staff and volunteers, for injury, loss or damage arising from my participation, except for gross negligence or willful misconduct. I will indemnify them for claims caused by my own actions.'] },
      { h: 'Medical', p: ['I am physically able to participate. I authorize emergency medical treatment if I am unable to consent, at my own expense.'] },
      { h: 'Acknowledgment', p: ['I have read this waiver, understand it gives up certain legal rights, and accept it on behalf of myself. [Counsel to confirm enforceability in the course’s state and rules for minors and for captains accepting on behalf of teammates.]'] },
    ],
  },
};
