import { useState, type ReactNode } from 'react';
import { ArrowUp, Car, ChefHat, Flag, MapPinned, ShoppingBag, Sparkles, Target } from 'lucide-react';
import { TRACKING_NOTICE } from '../views/TrackingNotice';

const KEY = 'eg.onboarded.v1';
export const isOnboarded = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };
const markOnboarded = () => { try { localStorage.setItem(KEY, '1'); } catch { /* blocked */ } };

interface Step { title: string; body: string; art: ReactNode }

const pill = 'rounded-xl border border-white/15 bg-black/50 px-2.5 py-1.5 backdrop-blur-md';

const STEPS: Step[] = [
  {
    title: 'Welcome to Exclusive.Golf',
    body: 'Your caddie, scorecard and clubhouse in one app. Here’s a 30-second tour.',
    art: <div className="grid h-full place-items-center"><span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-400/50"><Target size={34} className="text-emerald-400" /></span></div>,
  },
  {
    title: 'The aerial map HUD',
    body: 'Satellite view of the hole. Top left: hole, par, strokes and distance to the pin. Top right: weather and wind. Tap anywhere on the map to measure to that spot.',
    art: (
      <div className="relative h-full bg-[radial-gradient(ellipse_at_center,#14532d,#052e16_70%,#000)]">
        <div className={`absolute left-3 top-3 ${pill} text-left`}><div className="text-[8px] font-bold uppercase text-white/50">Hole</div><div className="font-mono text-xl font-semibold leading-none text-white">7</div><div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-white"><Flag size={10} className="text-red-400" />152y</div></div>
        <div className={`absolute right-3 top-3 ${pill} flex items-center gap-1 font-mono text-[10px] text-white`}>72° <ArrowUp size={10} className="rotate-45 text-sky-300" /> 12</div>
        <div className="absolute left-1/2 top-[30%] h-3 w-3 -translate-x-1/2 rounded-full bg-red-500 ring-2 ring-white" />
        <div className="absolute left-1/2 top-[34%] h-[42%] w-px -translate-x-1/2 border-l-2 border-dashed border-white/70" />
        <div className="absolute bottom-[18%] left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white" />
      </div>
    ),
  },
  {
    title: 'Club selection',
    body: 'Line is the raw distance, Plays Like adds wind and elevation. The club comes from your own carries in My Bag. Tap Log Shot after each swing to learn your tendencies.',
    art: (
      <div className="grid h-full place-items-center">
        <div className="w-60 rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur-xl">
          <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
            <div><div className="text-[8px] font-bold uppercase text-white/50">Line</div><div className="font-mono text-lg text-white">152</div></div>
            <div><div className="text-[8px] font-bold uppercase text-emerald-400/80">Plays like</div><div className="font-mono text-lg font-semibold text-emerald-400">161</div></div>
            <div><div className="text-[8px] font-bold uppercase text-white/50">Club</div><div className="text-lg font-black text-white">7i</div></div>
          </div>
          <div className="mt-2 h-8 rounded-xl bg-emerald-500 text-center text-[10px] font-black uppercase leading-8 tracking-[0.2em] text-black">Log Shot</div>
        </div>
      </div>
    ),
  },
  {
    title: 'Clubhouse ordering',
    body: 'Order food, drinks or pro shop items from the bag button — it’s delivered to your hole using your GPS spot. Hail the drink cart with one tap. When the kitchen is closed, food & drink shows as locked.',
    art: (
      <div className="flex h-full items-center justify-center gap-3">
        {[ShoppingBag, Car, ChefHat].map((I, i) => (
          <span key={i} className={`grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-black/50 ${i === 2 ? 'text-white/40' : i === 1 ? 'text-sky-300' : 'text-emerald-300'}`}><I size={22} /></span>
        ))}
      </div>
    ),
  },
  {
    title: 'Your location, your rules',
    body: `${TRACKING_NOTICE} It only works on the course property (plus 250 ft) and stops the moment you leave.`,
    art: <div className="grid h-full place-items-center"><span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500/10 ring-2 ring-emerald-400/40"><MapPinned size={32} className="text-emerald-300" /></span></div>,
  },
];

/** First-launch interactive walkthrough (also replayable from Settings / Help). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const finish = () => { markOnboarded(); onDone(); };
  return (
    <div className="absolute inset-0 z-[55] flex items-end bg-black/75 p-3 pb-safe backdrop-blur-sm">
      <section role="dialog" aria-label="Walkthrough" className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-2xl">
        <div className="relative h-48 overflow-hidden border-b border-white/10">{step.art}</div>
        <div className="p-5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400"><Sparkles size={11} /> Step {i + 1} of {STEPS.length}</div>
          <h2 className="text-lg font-black text-white">{step.title}</h2>
          <p className="mt-1.5 min-h-[64px] text-[12px] leading-relaxed text-white/70">{step.body}</p>
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {STEPS.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-emerald-400' : 'w-1.5 bg-white/20'}`} />)}
          </div>
          <div className="mt-4 flex gap-2">
            {i > 0 ? <button onClick={() => setI(i - 1)} className="h-11 flex-1 rounded-2xl border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/70">Back</button>
              : <button onClick={finish} className="h-11 flex-1 rounded-2xl border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/50">Skip</button>}
            <button onClick={() => (last ? finish() : setI(i + 1))} className="h-11 flex-[2] rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-[0.18em] text-black">{last ? 'Start playing' : 'Next'}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
