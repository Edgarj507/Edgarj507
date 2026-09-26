import { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, LifeBuoy, Mail, MessageCircleQuestion, Phone, PlayCircle, Search, X } from 'lucide-react';

export type HelpAudience = 'player' | 'staff';
interface Entry { q: string; a: string }

const GUIDES: Record<HelpAudience, Entry[]> = {
  player: [
    { q: 'Reading the aerial HUD', a: 'Top left: hole, par, strokes and your running score; tap it for the scorecard. Under it: distance to the pin (community pin position when golfers have reported it) and the elevation change. Top right: weather, wind relative to your shot, rain and UV. Tap anywhere on the map to measure to that spot.' },
    { q: 'Line, Plays Like & club choice', a: 'Line is the straight distance to your target. Plays Like adjusts it for wind and elevation. The club shown is picked from YOUR bag carries (My Bag) — set your real carry numbers for the best recommendation. Tap Log Shot, then pick where it went to build your tendencies.' },
    { q: 'Ordering food, drinks & pro shop', a: 'Tap the bag icon on the HUD to open the Clubhouse Store. Your order is sent with your hole and GPS spot so the cart can find you. Food & drink is only available during restaurant hours — outside them you’ll see “Kitchen Closed”. Tap the cart icon to hail the drink cart.' },
    { q: 'Tournaments & your team', a: 'Tournaments → pick the event → name your team and add up to three teammates (open slots are fine). After paying, tap “Text Your Team The Invite”. Use My Tournaments to swap players or pay a balance before the event starts.' },
    { q: 'Location & privacy', a: 'Live tracking is strictly limited to your scheduled tee time and only activates upon arrival at the facility. It works only on the course property (plus 250 ft) during a live event, and stops the moment you leave.' },
  ],
  staff: [
    { q: 'Tee Sheet: phone bookings & blocks', a: 'Add Phone Booking reserves a time for callers and walk-ups (name, group size, phone). Block Times closes one tee time, a time window, or whole days across a date range — pick a reason (Maintenance, Private Event, Tournament, Season Closed, Irrigation repair…). Tap a block chip to reopen those times.' },
    { q: 'Pre-Event CRM', a: 'Lists every registered team with player count (e.g. 3/4) and Fully / Partially Paid. Tap a team for contacts, Edit Roster to swap players, and Send Balance Reminder to text or email the captain. There is no map and no location data before the event starts.' },
    { q: 'Starting the tournament', a: 'Flip Start Tournament to switch to the Live Radar. Registered players’ phones share location only while on the property. Groups more than the alert limit behind pace pulse red and raise an alert. Ending the tournament deletes all positions.' },
    { q: 'Fulfillment queue', a: 'New orders appear with the player, hole and GPS position. Optionally tap En Route, then Mark Completed when delivered — completed orders leave the queue and count toward the End of Day tally.' },
    { q: 'End of Day tally', a: 'Reports → End of Day shows completed orders, an itemized list of what sold and total revenue for any date. Print it or export CSV for your POS / accounting.' },
    { q: 'In-House Tournament mode', a: 'Settings → In-House Tournament merges the Tee Sheet with the CRM / Live Radar on one screen for courses running their own events.' },
    { q: 'Hours & switches', a: 'Settings controls pace of play limits, course and restaurant hours (outside restaurant hours players see Kitchen Closed), and the Hail Drink Cart / Live Ordering switches — changes reach player phones immediately.' },
  ],
};

const FAQ: Record<HelpAudience, Entry[]> = {
  player: [
    { q: 'Why is food ordering locked?', a: 'You’ll see “Kitchen Closed” when the restaurant / kitchen is closed. The hours are shown on the lock; pro shop items can still be ordered.' },
    { q: 'Is my location tracked at home or my hotel?', a: 'No. Location is only shared during a live event you are registered for, and only while your phone is on the course property (plus a 250 ft GPS buffer). Off property, nothing is sent and your last position is deleted.' },
    { q: 'A teammate dropped out — what now?', a: 'Tournaments → My Tournaments → Edit roster. Remove the player or enter the replacement’s details, then text them the invite. Rosters lock once the event goes live.' },
    { q: 'How do I pay the rest of my team’s balance?', a: 'My Tournaments shows “$… due” with a Pay balance button.' },
    { q: 'Distances look off.', a: 'Make sure location is on and accurate, and check your tee color in round setup. Distances are estimates — always use course markers too.' },
    { q: 'How do I delete my account?', a: 'Settings → Profile → Delete account. You can also email support.' },
  ],
  staff: [
    { q: 'I forgot the staff PIN.', a: 'Five wrong entries lock the tablet for 5 minutes. A course admin can reset the PIN; in cloud mode staff access is tied to staff accounts.' },
    { q: 'Why can’t I book 3:20 PM?', a: 'It’s inside a block. Tap the striped row to see the reason and remove the block if needed.' },
    { q: 'Orders are piling up.', a: 'Mark each delivered order Completed. Turn off Live Ordering or Hail Drink Cart in Settings to pause new ones.' },
    { q: 'Players can’t order food.', a: 'Check Restaurant / Bar hours in Settings and that Live Ordering is on.' },
    { q: 'A group shows the wrong pace.', a: 'Pace uses the target minutes per hole in Settings. Adjust the target or alert threshold there.' },
  ],
};

/** Interactive help center: quick-reference guides, searchable FAQ and support contacts. */
export function HelpCenter({ audience, onClose, onTutorial }: { audience: HelpAudience; onClose: () => void; onTutorial?: () => void }) {
  const [tab, setTab] = useState<'guides' | 'faq' | 'contact'>('guides');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = tab === 'guides' ? GUIDES[audience] : FAQ[audience];
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? [...GUIDES[audience], ...FAQ[audience]].filter((e) => `${e.q} ${e.a}`.toLowerCase().includes(s)) : list;
  }, [q, list, audience]);
  const staff = audience === 'staff';

  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 pb-safe backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-label="Help Center" onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92%] w-full flex-col rounded-3xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-2xl ${staff ? 'max-w-2xl self-center' : 'max-w-md'}`}>
        <header className="flex items-start justify-between gap-3 p-4 pb-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400"><LifeBuoy size={12} /> {staff ? 'Clubhouse OS' : 'Exclusive.Golf'}</div>
            <h2 className="text-base font-black text-white">Help Center</h2>
          </div>
          <button onClick={onClose} aria-label="Close help" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60"><X size={14} /></button>
        </header>
        <div className="px-4">
          <label className="relative block">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help" aria-label="Search help"
              className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-8 pr-3 text-[13px] text-white placeholder-white/30 focus:border-emerald-500/50 focus:outline-none" />
          </label>
          {!q && (
            <div role="tablist" className="mt-3 flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
              {([['guides', 'Quick guides', BookOpen], ['faq', 'FAQ', MessageCircleQuestion], ['contact', 'Contact', Mail]] as const).map(([id, label, Icon]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest ${tab === id ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50'}`}><Icon size={12} />{label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto p-4">
          {tab === 'contact' && !q ? (
            <div className="flex flex-col gap-2">
              <a href="mailto:support@exclusive.golf?subject=Exclusive.Golf%20support" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <Mail size={16} className="text-emerald-400" /><span className="flex flex-col"><b className="text-[12px] text-white">Email support</b><span className="text-[10px] text-white/50">support@exclusive.golf · replies within 1 business day</span></span>
              </a>
              <a href="tel:+15075550199" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <Phone size={16} className="text-emerald-400" /><span className="flex flex-col"><b className="text-[12px] text-white">{staff ? 'Exclusive.Golf course success' : 'Call the pro shop'}</b><span className="text-[10px] text-white/50">(507) 555-0199 · demo number</span></span>
              </a>
              <a href={`mailto:support@exclusive.golf?subject=${encodeURIComponent('Problem report')}&body=${encodeURIComponent(`What happened:\n\nApp: ${staff ? 'Clubhouse OS' : 'Player App'}\nDevice: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`)}`}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <MessageCircleQuestion size={16} className="text-emerald-400" /><span className="flex flex-col"><b className="text-[12px] text-white">Report a problem</b><span className="text-[10px] text-white/50">Opens an email with your device details</span></span>
              </a>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {shown.map((e) => (
                <li key={e.q} className="rounded-2xl border border-white/10 bg-white/[0.04]">
                  <button onClick={() => setOpen(open === e.q ? null : e.q)} aria-expanded={open === e.q} className="flex w-full items-center justify-between gap-2 p-3 text-left text-[12px] font-bold text-white">
                    {e.q}<ChevronDown size={14} className={`shrink-0 text-white/40 transition-transform ${open === e.q ? 'rotate-180' : ''}`} />
                  </button>
                  {open === e.q && <p className="px-3 pb-3 text-[12px] leading-relaxed text-white/70">{e.a}</p>}
                </li>
              ))}
              {!shown.length && <li className="py-6 text-center text-[11px] text-white/40">No matches — try the Contact tab.</li>}
            </ul>
          )}
          {onTutorial && (
            <button onClick={onTutorial} className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-[10px] font-black uppercase tracking-widest text-emerald-200">
              <PlayCircle size={14} /> Replay the walkthrough
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
