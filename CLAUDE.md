# CLAUDE.md: project rules

Browser FPV drone simulator that copies the mechanics of the reference sim.
Plan: [PLAN.md](PLAN.md). Decision log: [DECISIONS.md](DECISIONS.md).
Research: `sendline-main/docs/research/` (GUIDE.md, BUILD.md, internals notes).
What the original does: `docs/reference/`.

## Language
- Everything written into the project (docs, notes, commits, code, comments) is in plain, short English. No filler.
- Talk to the user in Russian.

## Stack
- TypeScript (strict), Three.js, Vite. No React or Next.js: UI is HTML/CSS over the canvas.
- Tests: Vitest. Lint: ESLint + Prettier.
- Data validation (lessons): Zod.
- Frontend on Vercel (static `dist/`). Backend on Supabase (Auth, Postgres + RLS, RPC, Storage).
- Free tiers only. Do not add paid services without asking.

## Commands
```
npm run dev        # local, http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run lint
npm test           # vitest run
npm run build      # production build
```

## Folders
```
src/
  main.ts          entry point, wires the game together
  sim/             flight model: clock, rates, mixer, controller, rigid body, drone profiles, gates, recording.
                   Plain TS: no DOM, no Three.js scene, no Supabase (maths types only)
  input/           keyboard, gamepad, later radios
  audio/           motor sound, effects
  world/           box-based map, colliders, drone model, gates
  render/          renderer, cameras, post-processing, quality
  game/            modes and logic: free flight, lessons, lesson editor, game state
  ui/              HUD, menus, dialogs, styles and design tokens
  net/             Supabase client, auth, RPC wrappers
content/           lesson JSON (database seeds)
public/            static assets (our own models, icons, mascot)
supabase/migrations/  SQL migrations (schema, RLS, functions)
tests/             Vitest tests
docs/reference/    notes on what the original does
sendline-main/     reference prototype and research (read only, not in git, not in the build)
```

## Code rules
- `src/sim/` stays framework-free and deterministic. No allocations inside the 240 Hz step.
- Physics runs only on the fixed 1/240 s step. Nothing in gameplay depends on render fps.
- Signs everywhere: roll > 0 is right, pitch > 0 is nose up, yaw > 0 is right, throttle is 0..1.
- XP and progress rewards are granted only by the server through RPC. The client never writes those fields directly.
- RLS on every table. Schema changes only through new files in `supabase/migrations/`.
- Secrets only in `.env.local` (never committed). The client gets only `VITE_SUPABASE_URL` and the anon key.

## Do not copy
- the reference sim's assets, models, textures, mascot (crash-test dummy), icons, fonts, dialogue, UI text or names.
  Similar style (daylight low-poly world, light cards), our own execution.
- The Sendline brand in `sendline-main/brand/`. Do not copy `sendline-main/` code (D-005); write our own and use it
  only as a reference for formulas and constants.
- Physics constants from the research are fine as starting values to tune.

## Working on a stage
1. Before starting: mark the stage `[~]` in PLAN.md and reread its "done when" criteria.
2. Build only what the stage covers. Write anything extra into PLAN.md instead of doing it.
3. Log meaningful choices in DECISIONS.md as you make them.

## After every stage (required)
1. **Run:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. All must pass.
2. **Check:** run `npm run dev` and go through each "done when" criterion. In the report, say which were checked
   by tests and which by hand. Say plainly what was not checked.
3. **Update:** mark the stage `[x]` in PLAN.md, add the stage's decisions to DECISIONS.md.
4. **Commit:** one commit per stage, message `stage N: short description`. No `--no-verify`.
5. **Report and wait:** short summary of what was done, how it was checked, what is left or risky.
   Do not start the next stage without the user's approval.
