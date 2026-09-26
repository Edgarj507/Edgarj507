import { useState } from 'react';
import { KeyRound, Mail, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { useRole } from '../auth/RoleContext';
import { staffService, useStaffState } from './useStaff';
import { PERMISSIONS, pinProblem, roleLabel, ROLES, type StaffMember, type StaffScope } from './model';
import { field, glass, Modal } from '../clubhouse/ui';
import { haptic } from '../lib/haptics';

const lbl = 'text-[10px] font-bold uppercase tracking-widest text-white/50';
const ago = (t?: number) => (t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never');

/**
 * Staff Settings & Permissions (owners / head managers): add staff with a role and permissions,
 * assign each a 4–6 digit PIN, send an invite to set their password, and deactivate (instant
 * revoke) or remove former / seasonal staff.
 */
export function StaffAdmin({ scope }: { scope: StaffScope }) {
  const { session, update } = useRole();
  const st = useStaffState();
  const members = st.members.filter((m) => m.scope === scope).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const [edit, setEdit] = useState<StaffMember | 'new' | null>(null);
  const [pinFor, setPinFor] = useState<StaffMember | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const say = (ok: boolean, text: string) => { setToast({ ok, text }); haptic(ok ? 'success' : 'error'); };
  if (!session) return null;

  const toggle = (m: StaffMember) => {
    const r = staffService.setActive(session, m.id, !m.active);
    say(r.ok, r.ok ? `${m.name} ${m.active ? 'deactivated — access revoked' : 'reactivated'}` : r.error);
  };
  const remove = (m: StaffMember) => {
    if (!window.confirm(`Remove ${m.name} permanently?`)) return;
    const r = staffService.remove(session, m.id);
    say(r.ok, r.ok ? `${m.name} removed` : r.error);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="staff-admin">
      <section className={`${glass} flex flex-wrap items-center gap-3 rounded-3xl p-3`}>
        <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]"><Users size={14} className="text-emerald-300" /> Staff & Permissions</h2>
        <span className="text-[10px] text-white/45">{members.filter((m) => m.active).length} active · {members.filter((m) => !m.active).length} deactivated</span>
        <button onClick={() => setEdit('new')} className="ml-auto flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-widest text-black"><Plus size={13} /> Add staff</button>
      </section>
      {toast && <p role={toast.ok ? 'status' : 'alert'} className={`rounded-xl px-3 py-2 text-[11px] ${toast.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}>{toast.text}</p>}

      <ul aria-label="Staff members" className="eg-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto pr-1 @4xl:grid-cols-2">
        {members.map((m) => (
          <li key={m.id} aria-label={`Staff ${m.name}`} className={`${glass} flex flex-col gap-2 rounded-2xl p-3 ${m.active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[14px] font-bold">{m.name}{m.id === session.id && <span className="text-[9px] font-normal text-white/45">(you)</span>}</div>
                <div className="truncate text-[11px] text-white/55">{m.email}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${m.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{m.active ? roleLabel(scope, m.role) : 'Deactivated'}</span>
            </div>
            <div className="flex flex-wrap gap-1">{m.permissions.map((p) => <span key={p} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] text-white/60">{PERMISSIONS[scope][p] ?? p}</span>)}</div>
            <div className="flex flex-wrap items-center gap-x-3 text-[10px] text-white/45">
              <span>PIN {m.pin ? 'set' : <b className="text-amber-200">not set</b>}</span>
              <span>Password {m.password ? 'set' : <b className="text-amber-200">invite pending</b>}</span>
              <span>Last sign-in {ago(m.lastLoginAt)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {m.active && <button onClick={() => setEdit(m)} aria-label={`Edit ${m.name}`} className="flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-[9px] font-bold uppercase tracking-widest text-white/80"><Pencil size={11} /> Role & access</button>}
              {m.active && <button onClick={() => setPinFor(m)} aria-label={`Set PIN for ${m.name}`} className="flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-[9px] font-bold uppercase tracking-widest text-white/80"><KeyRound size={11} /> {m.pin ? 'Reset PIN' : 'Set PIN'}</button>}
              {m.active && m.id !== session.id && <button onClick={async () => { const r = await staffService.resendInvite(session, m.id); say(r.ok, r.ok ? `Sent ${m.password ? 'a reset' : 'an invite'} code to ${m.email}` : r.error); }} aria-label={`Send code to ${m.name}`} className="flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-[9px] font-bold uppercase tracking-widest text-white/80"><Mail size={11} /> {m.password ? 'Send reset' : 'Resend invite'}</button>}
              {m.id !== session.id && (
                <button onClick={() => toggle(m)} aria-label={`${m.active ? 'Deactivate' : 'Reactivate'} ${m.name}`} className={`flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[9px] font-black uppercase tracking-widest ${m.active ? 'border-red-400/40 text-red-300' : 'border-emerald-400/40 text-emerald-300'}`}>
                  {m.active ? <><UserX size={11} /> Deactivate</> : <><UserCheck size={11} /> Reactivate</>}
                </button>
              )}
              {!m.active && <button onClick={() => remove(m)} aria-label={`Remove ${m.name}`} className="grid h-8 w-8 place-items-center rounded-lg border border-red-400/30 text-red-300"><Trash2 size={12} /></button>}
            </div>
          </li>
        ))}
      </ul>

      {edit && <MemberEditor scope={scope} member={edit === 'new' ? null : edit} ownerActor={session.owner} onClose={() => setEdit(null)}
        onSave={async (v) => {
          const r = edit === 'new' ? await staffService.addStaff(session, v) : await staffService.updateStaff(session, edit.id, v);
          if (!r.ok) return r.error;
          if (edit !== 'new' && edit.id === session.id) update(staffService.refresh(session));
          say(true, edit === 'new' ? `Added ${v.name}. An invite code to set their password was emailed to ${v.email}.` : `Updated ${v.name}`);
          setEdit(null);
          return null;
        }} />}
      {pinFor && <PinEditor member={pinFor} onClose={() => setPinFor(null)} onSave={async (pin) => {
        const r = await staffService.setPin(session, pinFor.id, pin);
        if (!r.ok) return r.error;
        say(true, `PIN updated for ${pinFor.name}`); setPinFor(null); return null;
      }} />}
    </div>
  );
}

function MemberEditor({ scope, member, ownerActor, onSave, onClose }: {
  scope: StaffScope; member: StaffMember | null; ownerActor: boolean;
  onSave: (v: { name: string; email: string; role: string; permissions: string[]; pin?: string }) => Promise<string | null>; onClose: () => void;
}) {
  const roles = ROLES[scope];
  const [name, setName] = useState(member?.name ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [role, setRole] = useState(member?.role ?? roles[roles.length - 1].id);
  const [perms, setPerms] = useState<string[]>(member?.permissions ?? roles[roles.length - 1].permissions);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preset = roles.find((r) => r.id === role);
  const pickRole = (id: string) => { setRole(id); setPerms(roles.find((r) => r.id === id)!.permissions); };
  const save = async () => {
    setErr(null);
    if (!member && pin) { const p = pinProblem(pin); if (p) return setErr(p); }
    setBusy(true);
    const e = await onSave({ name, email, role, permissions: perms, ...(member ? {} : { pin: pin || undefined }) });
    setBusy(false);
    if (e) setErr(e);
  };
  return (
    <Modal title={member ? `Edit ${member.name}` : 'Add staff'} onClose={onClose} wide>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><span className={lbl}>Name</span><input aria-label="Staff name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>Email</span><input aria-label="Staff email address" type="email" value={email} disabled={!!member} maxLength={254} onChange={(e) => setEmail(e.target.value)} className={`${field} disabled:opacity-50`} /></label>
        </div>
        <label className="flex flex-col gap-1"><span className={lbl}>Role</span>
          <select aria-label="Role" value={role} onChange={(e) => pickRole(e.target.value)} className={field}>
            {roles.map((r) => <option key={r.id} value={r.id} disabled={r.owner && !ownerActor}>{r.label}</option>)}
          </select></label>
        <fieldset className="flex flex-col gap-1">
          <legend className={`${lbl} mb-1`}>Permissions {preset?.owner && <span className="normal-case tracking-normal text-white/40">· owners have everything</span>}</legend>
          <div className="grid grid-cols-1 gap-1 @xl:grid-cols-2">
            {Object.entries(PERMISSIONS[scope]).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5 text-[12px] text-white/80">
                <input type="checkbox" checked={perms.includes(k)} disabled={preset?.owner || (k === 'staff' && !ownerActor)} onChange={(e) => setPerms((p) => (e.target.checked ? [...p, k] : p.filter((x) => x !== k)))} className="accent-emerald-500" />
                {label}{k === 'staff' && !ownerActor && <span className="text-[9px] text-white/35">(owner only)</span>}
              </label>
            ))}
          </div>
        </fieldset>
        {!member && (
          <label className="flex flex-col gap-1"><span className={lbl}>PIN (4–6 digits, optional now)</span>
            <input aria-label="New staff PIN" type="password" inputMode="numeric" value={pin} maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={`${field} font-mono`} /></label>
        )}
        {!member && <p className="text-[10px] text-white/45">They’ll get an email with a code to set their own password. Admins never see or choose staff passwords.</p>}
        {err && <p role="alert" className="text-[11px] text-rose-300">{err}</p>}
        <button disabled={busy} onClick={save} className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-[0.18em] text-black disabled:opacity-40"><ShieldCheck size={14} /> {member ? 'Save changes' : 'Add staff member'}</button>
      </div>
    </Modal>
  );
}

function PinEditor({ member, onSave, onClose }: { member: StaffMember; onSave: (pin: string) => Promise<string | null>; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null);
    if (pin !== confirm) return setErr('PINs don’t match');
    const p = pinProblem(pin); if (p) return setErr(p);
    setBusy(true); const e = await onSave(pin); setBusy(false);
    if (e) setErr(e);
  };
  return (
    <Modal title={`PIN for ${member.name}`} onClose={onClose}>
      <div className="grid gap-2">
        <input aria-label="PIN" type="password" inputMode="numeric" value={pin} maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4–6 digits" className={`${field} font-mono`} />
        <input aria-label="Confirm PIN" type="password" inputMode="numeric" value={confirm} maxLength={6} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="Confirm" className={`${field} font-mono`} />
        <p className="text-[10px] text-white/45">Each person’s PIN must be unique. Avoid 1234, 0000 and repeated digits.</p>
        {err && <p role="alert" className="text-[11px] text-rose-300">{err}</p>}
        <button disabled={busy} onClick={save} className="h-11 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-[0.18em] text-black disabled:opacity-40">{busy ? 'Saving…' : 'Save PIN'}</button>
      </div>
    </Modal>
  );
}
