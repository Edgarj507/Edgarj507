// Supabase Edge Function (Deno). Deploy: supabase functions deploy submit-score
// Secrets (server-side only): supabase secrets set ALLOWED_ORIGINS=... (SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseOrigins } from '../_shared/cors.ts';
import { handle, rateLimiter } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const allowedOrigins = parseOrigins(Deno.env.get('ALLOWED_ORIGINS'));

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const allow = rateLimiter(30, 60_000);

Deno.serve((req) =>
  handle(req, {
    allowedOrigins,
    allow,
    verifyUser: async (jwt) => {
      const { data, error } = await authClient.auth.getUser(jwt);
      return error ? null : data.user?.id ?? null;
    },
    recordScore: async (userId, s) => {
      const { data, error } = await admin.rpc('record_hole_score', {
        p_user: userId,
        p_round: s.roundId,
        p_hole: s.hole,
        p_strokes: s.strokes,
        p_putts: s.putts,
      });
      if (error) throw new Error(error.message);
      return data;
    },
  }),
);
