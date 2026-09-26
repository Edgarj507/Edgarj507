import { useState } from 'react';
import { BadgeCheck, Building2, Check, ChevronLeft, Clock, FileUp, Search, ShieldCheck, X, XCircle } from 'lucide-react';
import { PROOF_MAX_CHARS, validateVerification, VENUES, type CourseVerification } from '../ops/venues';
import { useOps, newId } from '../ops/useOps';
import { prepareScreenshot } from '../support/screenshot';
import { haptic } from '../lib/haptics';

const MINE = 'eg.verif.mine.v1';
const mineIds = (): string[] => { try { const v = JSON.parse(localStorage.getItem(MINE) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const DEMO = !import.meta.env.VITE_SUPABASE_URL;
const input = 'w-full rounded-xl border bg-black/40 px-3 py-2.5 text-[13px] text-white placeholder-white/30 focus:outline-none';

/** Read a proof file: images are re-encoded (EXIF stripped); PDFs must start with %PDF-. */
async function readProof(file: File): Promise<NonNullable<CourseVerification['proof']>> {
  if (file.type === 'application/pdf') {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== '%PDF-') throw new Error('That file is not a valid PDF.');
    const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(file); });
    if (dataUrl.length > PROOF_MAX_CHARS) throw new Error('PDF must be under 1.5 MB.');
    return { name: file.name.slice(0, 80), type: 'application/pdf', dataUrl };
  }
  return { name: file.name.slice(0, 80), type: 'image/jpeg', dataUrl: await prepareScreenshot(file) };
}

/**
 * Clubhouse onboarding: a course manager claims their course from the verified directory and
 * proves they run it. Exclusive.Golf reviews the claim; only then can Clubhouse OS staff PINs be
 * created for that course (cloud: staff_members rows are created on approval).
 */
export function CourseVerificationWizard({ onClose }: { onClose: () => void }) {
  const [ops, dispatch] = useOps('player');
  const [, adminDispatch] = useOps('admin');
  const [step, setStep] = useState<'status' | 'course' | 'you' | 'proof' | 'sent'>(() => (mineIds().length ? 'status' : 'course'));
  const [q, setQ] = useState('');
  const [v, setV] = useState<CourseVerification>({ id: newId(), venueId: '', venueName: '', applicant: '', title: '', email: '', phone: '', submittedAt: 0, status: 'pending' });
  const [touched, setTouched] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const val = validateVerification(v);
  const matches = VENUES.filter((x) => `${x.name} ${x.location}`.toLowerCase().includes(q.trim().toLowerCase()));
  const mine = ops.verifications.filter((x) => mineIds().includes(x.id));
  const cls = (bad?: string) => `${input} ${touched && bad ? 'border-rose-400/60' : 'border-white/10'}`;

  const submit = () => {
    setTouched(true);
    if (!val.ok) { haptic('error'); return; }
    const req = { ...v, submittedAt: Date.now() };
    dispatch({ type: 'verifyRequest', request: req });
    try { localStorage.setItem(MINE, JSON.stringify([...mineIds(), req.id].slice(-20))); } catch { /* private mode */ }
    haptic('success');
    setStep('sent');
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/70 p-3 pb-safe backdrop-blur-sm" role="dialog" aria-label="Register your course">
      <div className="relative flex max-h-full w-full max-w-sm flex-col rounded-3xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl backdrop-blur-2xl">
        <div className="mb-3 flex items-center gap-2">
          {(step === 'you' || step === 'proof') && <button onClick={() => setStep(step === 'proof' ? 'you' : 'course')} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/60"><ChevronLeft size={14} /></button>}
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-300"><Building2 size={12} /> Clubhouse onboarding</div>
            <div className="text-sm font-bold text-white">{step === 'status' ? 'Your course claims' : step === 'course' ? 'Find your course' : step === 'you' ? 'About you' : step === 'proof' ? 'Proof of management' : 'Submitted'}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/60"><X size={14} /></button>
        </div>
        {['course', 'you', 'proof'].includes(step) && (
          <div className="mb-3 flex gap-1" aria-hidden>{['course', 'you', 'proof'].map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full ${['course', 'you', 'proof'].indexOf(step) >= i ? 'bg-emerald-400' : 'bg-white/15'}`} />)}</div>
        )}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {step === 'status' && (
            <div className="flex flex-col gap-2">
              {mine.map((x) => (
                <div key={x.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3" aria-label={`Claim for ${x.venueName}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-white">{x.venueName}</span>
                    <span role="status" className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${x.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : x.status === 'rejected' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-300/15 text-amber-200'}`}>
                      {x.status === 'approved' ? <BadgeCheck size={11} /> : x.status === 'rejected' ? <XCircle size={11} /> : <Clock size={11} />}{x.status === 'pending' ? 'Pending review' : x.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/50">{x.applicant} · {x.title}</div>
                  {x.status === 'approved' && <p className="mt-1 text-[11px] text-emerald-200">Verified — create your staff PIN with “Staff sign-in”.</p>}
                  {x.status === 'rejected' && x.reason && <p className="mt-1 text-[11px] text-rose-200">{x.reason}</p>}
                  {x.status === 'pending' && DEMO && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button onClick={() => adminDispatch({ type: 'verifyDecision', id: x.id, status: 'approved' })} className="h-9 rounded-xl bg-emerald-500 text-[9px] font-black uppercase tracking-widest text-black">Demo: approve</button>
                      <button onClick={() => adminDispatch({ type: 'verifyDecision', id: x.id, status: 'rejected', reason: 'We could not confirm your role at this course.' })} className="h-9 rounded-xl border border-white/15 text-[9px] font-bold uppercase tracking-widest text-white/60">Demo: reject</button>
                    </div>
                  )}
                </div>
              ))}
              {DEMO && <p className="text-[9px] text-amber-200/70">Demo mode: approval normally comes from the Exclusive.Golf team after review.</p>}
              <button onClick={() => { setV({ ...v, id: newId() }); setStep('course'); }} className="mt-1 h-11 rounded-2xl border border-white/15 text-[10px] font-bold uppercase tracking-widest text-white/80">Claim another course</button>
            </div>
          )}

          {step === 'course' && (
            <div className="flex flex-col gap-2">
              <label className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input aria-label="Search courses" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the verified course directory" className={`${input} border-white/10 pl-9`} /></label>
              <ul className="flex flex-col gap-1" aria-label="Verified courses">
                {matches.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => { setV({ ...v, venueId: x.id, venueName: x.name }); setStep('you'); }} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${v.venueId === x.id ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                      <span><span className="block text-[13px] font-semibold text-white">{x.name}</span><span className="text-[10px] text-white/45">{x.location}</span></span>
                      {x.onPlatform && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-300">On platform</span>}
                    </button>
                  </li>
                ))}
                {!matches.length && <li className="py-4 text-center text-[11px] text-white/45">Not listed? Email courses@exclusive.golf to be added to the directory.</li>}
              </ul>
            </div>
          )}

          {step === 'you' && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-white/55">Claiming <b className="text-white">{v.venueName}</b>. Use your work contact details — we verify them with the course.</p>
              <input aria-label="Full name" value={v.applicant} maxLength={60} onChange={(e) => setV({ ...v, applicant: e.target.value })} placeholder="Full name" className={cls(val.errors.applicant)} />
              <input aria-label="Role at the course" value={v.title} maxLength={60} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Role (e.g. General Manager, Head Pro)" className={cls(val.errors.title)} />
              <input aria-label="Work email" type="email" value={v.email} maxLength={254} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="Work email" className={cls(val.errors.email)} />
              <input aria-label="Course phone" type="tel" value={v.phone} maxLength={20} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="Course phone number" className={cls(val.errors.phone)} />
              {touched && <p className="text-[10px] text-rose-300">{[val.errors.applicant, val.errors.title, val.errors.email, val.errors.phone].filter(Boolean).join(' · ')}</p>}
              <button onClick={() => { const bad = val.errors.applicant || val.errors.title || val.errors.email || val.errors.phone; setTouched(!!bad); if (!bad) { setTouched(false); setStep('proof'); } }} className="mt-1 h-11 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-widest text-black">Continue</button>
            </div>
          )}

          {step === 'proof' && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-white/55">Upload something that shows you manage the course: a business card, letterhead, liquor/business license, or an authorization letter from the owner.</p>
              <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-dashed p-4 text-center ${touched && val.errors.proof ? 'border-rose-400/60' : 'border-white/20'}`}>
                <FileUp size={20} className="text-white/60" />
                <span className="text-[12px] font-semibold text-white">{v.proof ? v.proof.name : 'Choose image or PDF'}</span>
                <span className="text-[10px] text-white/45">PNG, JPG, WebP or PDF · up to 1.5 MB</span>
                <input aria-label="Proof of management" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only"
                  onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setFileErr(null); try { setV({ ...v, proof: await readProof(f) }); } catch (err) { setFileErr((err as Error).message); } }} />
              </label>
              {v.proof?.type.startsWith('image/') && <img src={v.proof.dataUrl} alt="Proof preview" className="max-h-32 rounded-xl object-contain" />}
              {(fileErr || (touched && val.errors.proof)) && <p role="alert" className="text-[11px] text-rose-300">{fileErr ?? val.errors.proof}</p>}
              <textarea aria-label="Note for reviewers" value={v.note ?? ''} maxLength={300} rows={2} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Anything we should know? (optional)" className={`${input} resize-none border-white/10`} />
              <button onClick={submit} className="mt-1 flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-[11px] font-black uppercase tracking-widest text-black"><ShieldCheck size={14} /> Submit for verification</button>
              <p className="text-[9px] text-white/40">Your documents are used only to verify this claim and are deleted after review.</p>
            </div>
          )}

          {step === 'sent' && (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-400/60"><Check size={26} className="text-emerald-400" /></span>
              <div className="text-base font-black text-white">Claim submitted</div>
              <p className="text-[12px] text-white/60">We’ll verify {v.venueName} with you at {v.email}, usually within one business day.</p>
              <button onClick={() => setStep('status')} className="mt-2 h-11 w-full rounded-2xl border border-white/15 text-[10px] font-bold uppercase tracking-widest text-white/80">View status</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
