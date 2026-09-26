import { supabase } from '../lib/supabase';
import { LEGAL, type LegalDocId } from './documents';

/**
 * Records which version of each legal document this player accepted, and when. Kept on the
 * device, and in cloud mode also written to `legal_acceptances` (an append-only audit trail).
 */
const KEY = 'eg.legal.v1';
export type ConsentContext = 'signup' | 'checkout' | 'settings';
type Record_ = Partial<Record<LegalDocId, { v: string; at: number }>>;

function read(): Record_ {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

/** Accepted the *current* version? */
export const hasAccepted = (doc: LegalDocId) => read()[doc]?.v === LEGAL[doc].version;
export const acceptedAt = (doc: LegalDocId) => read()[doc]?.at ?? null;

export function accept(docs: LegalDocId[], context: ConsentContext, eventId?: string) {
  const r = read();
  const at = Date.now();
  for (const d of docs) r[d] = { v: LEGAL[d].version, at };
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage blocked */ }
  if (supabase) {
    void supabase.from('legal_acceptances').insert(docs.map((d) => ({ document: d, version: LEGAL[d].version, context, event_id: eventId ?? null })))
      .then(({ error }) => { if (error) console.warn('legal acceptance not recorded', error.message); });
  }
}
