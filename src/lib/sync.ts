import { useEffect, useRef, useState, type Dispatch } from 'react';
import { supabase } from './supabase';
import { holeRange, type RoundAction, type RoundState } from './round';
import type { Visibility } from '../auth/AuthContext';

export type SyncStatus = 'off' | 'synced' | 'pending' | 'error';

/** Rule violations the server may return; these are not retried. */
const PERMANENT = new Set(['round_not_found', 'round_not_active', 'not_participant', 'hole_out_of_range', 'strokes_out_of_range', 'putts_out_of_range', 'too_many_edits', 'unexpected_field']);

async function createRemoteRound(round: RoundState, visibility: Visibility, ownerId: string, course: { name: string; pars: number[] }) {
  if (!supabase) throw new Error('not_configured');
  const { data, error } = await supabase
    .from('rounds')
    .insert({
      owner_id: ownerId,
      course_name: course.name,
      tee: round.config.tee,
      format: round.config.format,
      length: round.config.length,
      // Server stores 18 pars; nine-hole courses pad the unused back nine with 4s.
      pars: Array.from({ length: 18 }, (_, i) => course.pars[i] ?? 4),
      visibility,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('create_failed');
  const { error: pErr } = await supabase.from('round_players').insert({ round_id: data.id, user_id: ownerId });
  if (pErr) throw new Error('create_failed');
  return data.id as string;
}

/** Submits through the validated edge function — the only path that can write scores. */
async function submitHole(roundId: string, hole: number, strokes: number, putts: number) {
  if (!supabase) throw new Error('not_configured');
  const { error } = await supabase.functions.invoke('submit-score', { body: { roundId, hole, strokes, putts } });
  if (!error) return;
  let code = 'network';
  try { code = (await (error as { context?: Response }).context?.json())?.error ?? code; } catch { /* non-JSON */ }
  throw new Error(code);
}

export async function completeRemoteRound(id: string) {
  await supabase?.from('rounds').update({ status: 'completed' }).eq('id', id);
}

/**
 * Keeps a signed-in user's round mirrored on the server. Finished holes (every hole in range
 * except the one being played) are submitted; `flush(hole)` forces one (e.g. on Finish).
 * Transient failures retry every 30 s and when the device comes back online.
 */
export function useRoundSync(round: RoundState, dispatch: Dispatch<RoundAction>, opts: { userId: string | null; visibility: Visibility; course: { name: string; pars: number[] } }) {
  const [status, setStatus] = useState<SyncStatus>('off');
  const synced = useRef<Record<string, number>>({});
  const creating = useRef(false);
  const [tick, setTick] = useState(0);
  const enabled = !!supabase && !!opts.userId;

  // Create the server round lazily, the first time a signed-in user plays.
  useEffect(() => {
    if (!enabled || round.remoteId || creating.current) return;
    creating.current = true;
    createRemoteRound(round, opts.visibility, opts.userId!, opts.course)
      .then((id) => dispatch({ type: 'attachRemote', id }))
      .catch(() => setStatus('error'))
      .finally(() => { creating.current = false; });
  }, [enabled, round.remoteId, round.config, opts.visibility, opts.userId, dispatch]);

  const push = async (holes: number[]) => {
    const id = round.remoteId;
    if (!id) return;
    let failed = false;
    for (const i of holes) {
      const shots = round.shots[i];
      const key = `${id}:${i}`;
      if (!shots.length || synced.current[key] === shots.length) continue;
      setStatus('pending');
      try {
        await submitHole(id, i + 1, Math.min(shots.length, 15), Math.min(shots.filter((s) => s.club === 'Putter').length, shots.length));
        synced.current[key] = shots.length;
      } catch (e) {
        const code = e instanceof Error ? e.message : 'network';
        if (PERMANENT.has(code)) synced.current[key] = shots.length; // don't hammer the server
        failed = true;
      }
    }
    setStatus(failed ? 'error' : 'synced');
  };

  useEffect(() => {
    if (!enabled || !round.remoteId) return;
    const { start, end } = holeRange(round.config.length);
    const done = Array.from({ length: end - start + 1 }, (_, k) => start + k).filter((i) => i !== round.current);
    void push(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, round.remoteId, round.shots, round.current, tick]);

  useEffect(() => {
    if (!enabled) return;
    const retry = () => setTick((t) => t + 1);
    const id = setInterval(retry, 30_000);
    window.addEventListener('online', retry);
    return () => { clearInterval(id); window.removeEventListener('online', retry); };
  }, [enabled]);

  return { status: enabled ? status : ('off' as const), flush: (hole: number) => push([hole]) };
}
