import type { ReactNode } from 'react';
import { ChefHat, Flag, Gauge, HandCoins, Merge, Minus, Plus, ToggleRight } from 'lucide-react';
import { fmtTime, isOpenAt, type Hours, type OpsSettings } from '../../ops/model';
import { field, glass, Toggle } from '../ui';

/** Staff-only operational controls. Every change syncs to player phones immediately. */
export function OpsSettingsView({ settings, onChange, now }: { settings: OpsSettings; onChange: (p: Partial<OpsSettings>) => void; now: number }) {
  const kitchenOpen = isOpenAt(settings.kitchenHours, now);
  const courseOpen = isOpenAt(settings.courseHours, now);
  return (
    <div className="no-scrollbar grid h-full min-h-0 auto-rows-min grid-cols-1 gap-3 overflow-y-auto @4xl:grid-cols-2" data-testid="ops-settings">
      <Card icon={<Merge size={14} />} title="Tournament Mode">
        <Toggle label="In-House Tournament" sub="For courses hosting their own event: merge the Tee Sheet with the Pre-Event CRM / Live Radar into one Operations view"
          on={settings.inHouse} onChange={(v) => onChange({ inHouse: v })} />
      </Card>

      <Card icon={<Gauge size={14} />} title="Pace of Play">
        <Stepper label="Target pace" unit="min / hole" value={settings.paceMinPerHole} step={0.5} onChange={(v) => onChange({ paceMinPerHole: v })}
          sub={`${Math.floor((settings.paceMinPerHole * 18) / 60)}h ${Math.round((settings.paceMinPerHole * 18) % 60)}m for 18 holes`} />
        <Stepper label="Alert when behind by" unit="min" value={settings.paceAlertMin} step={1} onChange={(v) => onChange({ paceAlertMin: v })}
          sub="Groups past this turn red on the radar and raise an alert" />
      </Card>

      <Card icon={<ToggleRight size={14} />} title="Master Toggles">
        <Toggle label="Hail Drink Cart" sub="Players can call the beverage cart to their GPS spot" on={settings.hailCart} onChange={(v) => onChange({ hailCart: v })} />
        <Toggle label="Live Ordering" sub="Clubhouse Store on player phones (food & pro shop)" on={settings.liveOrdering} onChange={(v) => onChange({ liveOrdering: v })} />
        <Stepper label="Charity mulligan limit" unit="per player" value={settings.mulliganLimit} step={1} onChange={(v) => onChange({ mulliganLimit: v })} icon={<HandCoins size={12} />} />
      </Card>

      <Card icon={<Flag size={14} />} title="Golf Course Hours" badge={courseOpen ? 'Open now' : 'Closed now'} open={courseOpen}>
        <HoursEditor name="Course" hours={settings.courseHours} onChange={(h) => onChange({ courseHours: h })} />
        <p className="text-[10px] text-white/45">Sets the first and last tee times on the tee sheet.</p>
      </Card>

      <Card icon={<ChefHat size={14} />} title="Restaurant / Bar Hours" badge={kitchenOpen ? 'Kitchen open' : 'Kitchen closed'} open={kitchenOpen}>
        <HoursEditor name="Kitchen" hours={settings.kitchenHours} onChange={(h) => onChange({ kitchenHours: h })} />
        <p className="text-[10px] text-white/45">Outside these hours, food & drink ordering is locked on every player phone (“Kitchen Closed”) and refused by the server. Pro shop items stay available.</p>
      </Card>
    </div>
  );
}

function Card({ icon, title, children, badge, open }: { icon: ReactNode; title: string; children: ReactNode; badge?: string; open?: boolean }) {
  return (
    <section className={`${glass} flex flex-col gap-4 rounded-3xl p-4`}>
      <h2 className="flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/85">
        <span className="flex items-center gap-1.5 text-emerald-300">{icon}<span className="text-white/85">{title}</span></span>
        {badge && <span role="status" className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${open ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{badge}</span>}
      </h2>
      {children}
    </section>
  );
}

function Stepper({ label, unit, value, step, onChange, sub, icon }: { label: string; unit: string; value: number; step: number; onChange: (v: number) => void; sub?: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-white/80">{icon}{label}</span>
        {sub && <span className="text-[10px] text-white/45">{sub}</span>}
      </span>
      <span className="flex items-center gap-2" role="group" aria-label={label}>
        <button aria-label={`Lower ${label}`} onClick={() => onChange(value - step)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><Minus size={13} /></button>
        <span className="w-14 text-center font-mono text-lg text-emerald-300" aria-live="polite">{value}<span className="block text-[8px] uppercase tracking-widest text-white/40">{unit}</span></span>
        <button aria-label={`Raise ${label}`} onClick={() => onChange(value + step)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><Plus size={13} /></button>
      </span>
    </div>
  );
}

function HoursEditor({ name, hours, onChange }: { name: string; hours: Hours; onChange: (h: Hours) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(['open', 'close'] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{k === 'open' ? 'Opens' : 'Closes'} · {fmtTime(hours[k])}</span>
          <input type="time" aria-label={`${name} ${k === 'open' ? 'opens' : 'closes'}`} value={hours[k]} step={600}
            onChange={(e) => e.target.value && onChange({ ...hours, [k]: e.target.value.slice(0, 5) })} className={`${field} font-mono [color-scheme:dark]`} />
        </label>
      ))}
    </div>
  );
}
