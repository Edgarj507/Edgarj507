import { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, FileText, Flag, Globe, LifeBuoy, Ruler, Shield, Users } from 'lucide-react';
import { LEGAL, type LegalDocId } from '../legal/documents';
import { LegalModal } from '../legal/LegalUI';
import { acceptedAt } from '../legal/consent';
import { usePrefs, type Units } from '../i18n/prefs';
import { LANGUAGES, type Lang } from '../i18n/strings';

export function SettingsView({ onBack, onProfile, onCourses, onHelp, onTutorial }: { onBack: () => void; onProfile: () => void; onCourses: () => void; onHelp: () => void; onTutorial: () => void }) {
  const { t, lang, units, communityPins, langDetected, set } = usePrefs();
  const [doc, setDoc] = useState<LegalDocId | null>(null);
  const row = 'flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-md transition-all hover:bg-white/5 active:scale-[0.98]';
  const seg = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${active ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/50'}`;

  return (
    <div className="relative flex h-full w-full flex-col p-5">
      <div className="z-10 mb-6 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md active:scale-95">
          <ChevronLeft size={16} />
        </button>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white">{t('settings.title')}</h2>
      </div>

      <div className="no-scrollbar z-10 flex flex-1 flex-col gap-5 overflow-y-auto pb-10">
        <section className="flex flex-col gap-2">
          <label htmlFor="lang" className="flex items-center gap-1.5 pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
            <Globe size={11} /> {t('settings.language')}
          </label>
          <div className="relative">
            <select
              id="lang"
              value={lang}
              onChange={(e) => set({ lang: e.target.value as Lang })}
              className="w-full appearance-none rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white backdrop-blur-md focus:border-emerald-500/50 focus:outline-none"
            >
              {Object.entries(LANGUAGES).map(([id, l]) => (
                <option key={id} value={id} className="bg-zinc-900">{l.label}</option>
              ))}
            </select>
            <ChevronRight size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-white/40" />
          </div>
          {langDetected && <p className="px-1 text-[9px] text-emerald-400/70">{t('settings.detected')}</p>}
        </section>

        <section className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
            <Ruler size={11} /> {t('settings.units')}
          </span>
          <div role="radiogroup" aria-label={t('settings.units')} className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1 backdrop-blur-md">
            {(['yards', 'meters'] as Units[]).map((id) => (
              <button key={id} role="radio" aria-checked={units === id} onClick={() => set({ units: id })} className={seg(units === id)}>
                {t(id === 'yards' ? 'settings.yards' : 'settings.meters')}
              </button>
            ))}
          </div>
          <p className="px-1 text-[9px] text-white/40">{t('settings.units.sub')}</p>
        </section>

        <section className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
          <div className="flex items-start gap-2">
            <Users size={14} className="mt-0.5 text-emerald-400" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-white">{t('settings.pins')}</div>
              <div className="mt-0.5 text-[9px] text-white/50">{t('settings.pins.sub')}</div>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={communityPins}
            aria-label={t('settings.pins')}
            onClick={() => set({ communityPins: !communityPins })}
            className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${communityPins ? 'bg-emerald-500' : 'border border-white/10 bg-white/10'}`}
          >
            <span className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white transition-transform ${communityPins ? 'translate-x-5' : ''}`} />
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <span className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">{t('settings.account')}</span>
          <button onClick={onCourses} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-md transition-all hover:bg-white/5 active:scale-[0.98]">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white">
              <Flag size={14} className="text-emerald-400" /> {t('courses.title')}
            </span>
            <ChevronRight size={16} className="text-white/30" />
          </button>
          <button onClick={onProfile} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-md transition-all hover:bg-white/5 active:scale-[0.98]">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white">
              <Shield size={14} className="text-emerald-400" /> {t('settings.profile')}
            </span>
            <ChevronRight size={16} className="text-white/30" />
          </button>
        </section>

        <section className="flex flex-col gap-2" aria-label="Help">
          <span className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">Help</span>
          <button onClick={onHelp} className={row}>
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white"><LifeBuoy size={14} className="text-emerald-400" /> Help Center & FAQ</span>
            <ChevronRight size={16} className="text-white/30" />
          </button>
          <button onClick={onTutorial} className={row}>
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white"><BookOpen size={14} className="text-emerald-400" /> Replay tutorial</span>
            <ChevronRight size={16} className="text-white/30" />
          </button>
        </section>

        <section className="flex flex-col gap-2" aria-label="Legal">
          <span className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">Legal</span>
          {(['tos', 'privacy', 'waiver'] as const).map((d) => {
            const at = acceptedAt(d);
            return (
              <button key={d} onClick={() => setDoc(d)} className={row}>
                <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white"><FileText size={14} className="text-emerald-400" /> {LEGAL[d].title}</span>
                <span className="text-[9px] text-white/40">{at ? `Accepted ${new Date(at).toLocaleDateString()}` : 'View'}</span>
              </button>
            );
          })}
        </section>
      </div>
      {doc && <LegalModal doc={doc} onClose={() => setDoc(null)} />}
    </div>
  );
}
