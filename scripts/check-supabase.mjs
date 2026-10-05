// Checks the live Supabase rules with a throwaway anonymous user.
// Usage: node --env-file=.env.local scripts/check-supabase.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const fresh = () => createClient(url, key, { auth: { persistSession: false } });
const ok = (cond, msg) => console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);

// Not signed in: the RPC must be refused
const nobody = fresh();
const r0 = await nobody.rpc('complete_lesson', { p_lesson_id: 'first-takeoff', p_flight_xp: 10 });
ok(!!r0.error, `anonymous visitor without a session cannot award XP (${r0.error?.message ?? 'no error!'})`);

const a = fresh();
const { data: s, error: se } = await a.auth.signInAnonymously();
if (se) {
  console.log('FAIL  anonymous sign-in:', se.message);
  process.exit(1);
}
const uid = s.user.id;
ok(true, `anonymous sign-in works (user ${uid.slice(0, 8)}…)`);

const p1 = await a.from('profiles').select('nickname, xp').single();
ok(
  p1.data?.xp === 0 && /^pilot_/.test(p1.data?.nickname ?? ''),
  `profile created by trigger: ${JSON.stringify(p1.data)}`,
);

const c1 = await a.rpc('complete_lesson', { p_lesson_id: 'first-takeoff', p_flight_xp: 10 });
ok(c1.data?.[0]?.awarded === 40, `complete_lesson awards 10 + 30: ${JSON.stringify(c1.data ?? c1.error)}`);

const c2 = await a.rpc('complete_lesson', { p_lesson_id: 'first-takeoff', p_flight_xp: 10 });
ok(c2.data?.[0]?.awarded === 0, `repeat within 15 s earns nothing: ${JSON.stringify(c2.data ?? c2.error)}`);

const c3 = await a.rpc('complete_lesson', { p_lesson_id: 'going-forward', p_flight_xp: 99999 });
ok(c3.data?.[0]?.awarded === 230, `flight XP is capped at 200: ${JSON.stringify(c3.data ?? c3.error)}`);

const c4 = await a.rpc('complete_lesson', { p_lesson_id: 'DROP TABLE', p_flight_xp: 1 });
ok(!!c4.error, `bad lesson id is refused (${c4.error?.message})`);

const u = await a.from('profiles').update({ xp: 1000000 }).eq('id', uid).select();
const after = await a.from('profiles').select('xp').single();
ok(
  after.data?.xp === 270,
  `direct XP update is refused (${u.error?.message ?? `${u.data?.length ?? 0} rows changed`}); xp is ${after.data?.xp}`,
);

const ins = await a.from('lesson_completions').insert({ user_id: uid, lesson_id: 'fake', best_xp: 999 });
ok(!!ins.error, `direct insert into lesson_completions is refused (${ins.error?.message})`);

// A second player sees nothing of the first
const b = fresh();
await b.auth.signInAnonymously();
const seen = await b.from('lesson_completions').select('*');
const seenP = await b.from('profiles').select('id');
ok(
  (seen.data ?? []).length === 0 && (seenP.data ?? []).length === 1,
  `another player sees only their own rows (${seen.data?.length} completions, ${seenP.data?.length} profile)`,
);
