import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, ChevronLeft, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import { BRANDS, CATEGORIES, EQUIPMENT, modelId, optionId, type Brand, type Category, type Model } from '../data/equipment';
import type { BagClub, GearSelection } from '../lib/bag';

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);

interface Props {
  bag: BagClub[];
  gear: GearSelection;
  setGear: Dispatch<SetStateAction<GearSelection>>;
  setCarry: (key: string, carry: number) => void;
  resetCarry: (key: string) => void;
  onExit: () => void;
}

const card = 'rounded-xl border backdrop-blur-md transition-all';
const on = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400';
const off = 'bg-black/40 border-white/10 text-white/80 hover:bg-white/5';

export function BagWizard({ bag, gear: sel, setGear: setSel, setCarry, resetCarry, onExit }: Props) {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [query, setQuery] = useState('');

  // Stored ids are strings; keep only brands that still exist in the catalog.
  const brands = BRANDS.filter((b) => sel.brands.includes(b));
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      brands.map((brand) => ({
        brand,
        models: EQUIPMENT[brand].filter(
          (mo) => (category === 'All' || mo.category === category) && (!q || `${brand} ${mo.name}`.toLowerCase().includes(q)),
        ),
      })),
    [brands.join(), category, q],
  );

  const chosenModels = brands.flatMap((brand) =>
    EQUIPMENT[brand].filter((mo) => sel.models.includes(modelId(brand, mo))).map((mo) => ({ brand, model: mo })),
  );
  const optionCount = chosenModels.reduce(
    (a, { brand, model }) => a + model.options.filter((o) => sel.options.includes(optionId(brand, model, o))).length,
    0,
  );

  const back = () => (step > 1 ? setStep(step - 1) : onExit());
  const next = () => (step < 3 ? setStep(step + 1) : onExit());
  const canNext = step === 1 ? sel.brands.length > 0 : step === 2 ? chosenModels.length > 0 : true;

  const setAllOptions = (brand: Brand, model: Model, all: boolean) =>
    setSel((s) => {
      const ids = model.options.map((o) => optionId(brand, model, o));
      const rest = s.options.filter((id) => !ids.includes(id));
      return { ...s, options: all ? [...rest, ...ids] : rest };
    });

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-4 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={back} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md hover:bg-white/10 active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white">My Bag</h2>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-emerald-400">
          STEP {step}/3
        </span>
      </div>

      <div className="z-10 mb-3 flex shrink-0 gap-1.5">
        {[1, 2, 3].map((n) => (
          <div key={n} className={`h-1 flex-1 rounded-full ${step >= n ? 'bg-emerald-500' : 'bg-white/10'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-24">
          <p className="mb-3 text-[11px] text-white/60">Select the brands in your bag.</p>
          <div className="grid grid-cols-2 gap-2.5">
            {BRANDS.map((brand) => {
              const active = sel.brands.includes(brand);
              return (
                <button
                  key={brand}
                  onClick={() => setSel((s) => ({ ...s, brands: toggle(s.brands, brand) }))}
                  className={`${card} flex items-center justify-between p-3 text-left ${active ? on : off}`}
                >
                  <div>
                    <div className="text-xs font-bold tracking-wide">{brand}</div>
                    <div className="mt-0.5 text-[9px] text-white/40">{EQUIPMENT[brand].length} models</div>
                  </div>
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <div className="z-10 mb-2 shrink-0">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-8 text-xs text-white placeholder-white/30 backdrop-blur-md focus:border-emerald-500/50 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {(['All', ...CATEGORIES] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition-all ${
                    category === c ? 'border-white/20 bg-white/20 text-white' : 'border-white/5 bg-black/30 text-white/50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-24">
            {visible.map(({ brand, models }) => (
              <div key={brand} className="mb-4">
                <div className="mb-1.5 pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">{brand}</div>
                {models.length === 0 && <p className="pl-1 text-[10px] text-white/30">No matching models.</p>}
                {CATEGORIES.map((cat) => {
                  const inCat = models.filter((mo) => mo.category === cat);
                  if (!inCat.length) return null;
                  return (
                    <div key={cat} className="mb-2">
                      {category === 'All' && <div className="mb-1 pl-1 text-[8px] font-bold uppercase tracking-[0.2em] text-white/30">{cat}</div>}
                      <div className="grid grid-cols-2 gap-1.5">
                        {inCat.map((mo) => {
                          const id = modelId(brand, mo);
                          const active = sel.models.includes(id);
                          return (
                            <button
                              key={id}
                              onClick={() => setSel((s) => ({ ...s, models: toggle(s.models, id) }))}
                              className={`${card} flex items-center justify-between gap-1 px-2.5 py-2 text-left ${active ? on : off}`}
                            >
                              <span className="text-[11px] font-bold leading-tight">{mo.name}</span>
                              {active && <Check size={12} className="shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {step === 3 && (
        <div className="no-scrollbar z-10 flex-1 overflow-y-auto pb-24">
          <p className="mb-3 text-[11px] text-white/60">
            Pick exact lofts, clubs and heads · <span className="text-emerald-400">{optionCount} selected</span>
          </p>
          <div className="flex flex-col gap-2.5">
            {chosenModels.map(({ brand, model }) => {
              const picked = model.options.filter((o) => sel.options.includes(optionId(brand, model, o)));
              const all = picked.length === model.options.length;
              return (
                <div key={modelId(brand, model)} className="rounded-xl border border-white/10 bg-black/30 p-3 backdrop-blur-md">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white">{model.name}</div>
                      <div className="text-[9px] uppercase tracking-widest text-white/40">{brand} · {model.category}</div>
                    </div>
                    {model.category === 'Irons' && (
                      <button onClick={() => setAllOptions(brand, model, !all)} className="rounded-md border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white/60">
                        {all ? 'Clear' : 'Full set'}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {model.options.map((o) => {
                      const id = optionId(brand, model, o);
                      const active = sel.options.includes(id);
                      return (
                        <button
                          key={id}
                          onClick={() => setSel((s) => ({ ...s, options: toggle(s.options, id) }))}
                          className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold tracking-wide transition-all ${active ? on : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-black/30 p-3">
              <div className="flex items-baseline justify-between pl-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/50">Carry Yardages · {bag.length} clubs</span>
                <span className="text-[9px] text-emerald-400/70">Drives HUD club picks</span>
              </div>
              <p className="pl-1 text-[9px] leading-snug text-white/40">
                Built from the clubs picked above. Estimates are marked <span className="text-amber-300/80">est</span> — tap ± to set your real carry.
              </p>
              {bag.map((club) => (
                <div key={club.key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">{club.label}</div>
                    <div className="truncate text-[8px] uppercase tracking-wider text-white/35">{club.source}</div>
                  </div>
                  {club.carry === 0 ? (
                    <span className="text-[10px] uppercase tracking-wider text-white/40">On green</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      {club.estimated
                        ? <span className="text-[8px] font-bold uppercase text-amber-300/80">est</span>
                        : <button onClick={() => resetCarry(club.key)} aria-label={`Reset ${club.label} carry`} className="text-white/30"><RotateCcw size={10} /></button>}
                      <button onClick={() => setCarry(club.key, club.carry - 5)} aria-label={`Decrease ${club.label} carry`} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 active:scale-90"><Minus size={12} /></button>
                      <span className="w-12 text-center font-mono text-xs text-emerald-400">{club.carry}y</span>
                      <button onClick={() => setCarry(club.key, club.carry + 5)} aria-label={`Increase ${club.label} carry`} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 active:scale-90"><Plus size={12} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-5 bottom-6 z-20">
        <div className="rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-xl">
          <button
            onClick={next}
            disabled={!canNext}
            className="w-full rounded-xl bg-emerald-500 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40"
          >
            {step === 3 ? 'Save Bag' : step === 1 ? `Next · ${sel.brands.length} brands` : `Next · ${chosenModels.length} models`}
          </button>
        </div>
      </div>
    </div>
  );
}
