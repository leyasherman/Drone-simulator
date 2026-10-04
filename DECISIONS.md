# Decisions

One entry per decision, newest first. Add one when choosing between options, or when we move away from
the research in `sendline-main/docs/` or from PLAN.md.

## Template

```
## D-NNN. Short title
- Date: YYYY-MM-DD
- Stage: N
- Status: accepted | replaced by D-NNN | cancelled
- Context: what problem or choice we had.
- Options: what we considered, with short pros and cons.
- Decision: what we picked.
- Why: the main reasons.
- Consequences: what this changes, the risks, when to revisit.
```

---

<!-- Entries below -->

## D-009. Motor and thrust model
- Date: 2026-10-04
- Stage: 2a
- Status: accepted
- Context: without inflow loss, top speed came out at 122 km/h against ~104 in the research.
- Options: raise drag to fit / add inflow loss (thrust drops when air already flows through the prop).
- Decision: add inflow loss now, per prop, including the rotation at each prop. Keep drag at the research values.
- Also: Quad-X mixer with our own airmode version (shrink corrections over the full range, then shift throttle
  to keep all motors in 0..1); first-order motor lag, 0.65× faster when braking; thrust ∝ command²;
  yaw from rotor reaction torque; implicit quadratic drag (1× forward, 1.15× sideways, 4× vertical, plus rotor drag).
- Why: inflow is part of how a prop makes thrust, not a separate effect; fitting drag would break the drop test.
- Measured: hover 38.8% stick, unpowered 5 m drop 8.23 m/s, top speed nose-down 60° 109 km/h.
- Consequences: prop wash, ground effect and battery sag are still missing; top speed may drop a little when added.

## D-008. Rigid body design
- Date: 2026-10-04
- Stage: 1
- Status: accepted
- Decision: semi-implicit Euler at 240 Hz; angular velocity stored in the body frame (like a gyro);
  Euler's equations with the gyroscopic term; quaternion integrated and normalised each step;
  forces and torques accumulated, then cleared after each step; Three.js Vector3/Quaternion as maths types;
  scratch objects at module level so step() never allocates.
- Why: simple, stable at this step size, deterministic; the body-frame rate is what the rate controller needs.
- Consequences: the drop-test target changes from 8.2 m/s (research value, includes drag) to 9.90 m/s
  (no drag yet). The 8.2 m/s check returns with drag in stage 2.

## D-007. Docs in English, chat in Russian
- Date: 2026-10-04
- Stage: 0
- Status: accepted
- Decision: everything written into the project (PLAN, DECISIONS, CLAUDE.md, notes, commits, code comments)
  is in plain, short English. Conversation with the user stays in Russian.
- Why: the user's request.

## D-006. Scaffold tooling
- Date: 2026-10-04
- Stage: 0
- Status: accepted
- Decision: Vite 8, TypeScript 6 (strict + noUncheckedIndexedAccess), Vitest 5 in the node environment,
  ESLint 10 (typescript-eslint) + Prettier, LF line endings (.gitattributes). Two runtime packages: three, zod.
- Why: Vitest reuses the Vite config; node is enough to test `sim/` and build a scene without WebGL.
- Consequences: Vite warns about a chunk over 500 KB. That is three.js; we split chunks at release.

## D-005. Scope: free flight + lessons + lesson editor; we write our own code
- Date: 2026-10-04
- Stage: 0
- Status: accepted
- Context: the client said "build it independently", "free flight and lessons only", the lesson editor is valuable,
  input is "keyboard and gamepad", build feature by feature from the foundations.
- Decision: our own code in small stages; sendline is only a reference for formulas and constants.
  Races, multiplayer, chat, skill chain, replays and shop are removed from the plan.
- Why: the client asked for it; small stages are cheap to roll back.
- Consequences: cancels D-001; D-002 is on hold while multiplayer is out of scope.

## D-004. Graphics: SVG placeholders until stage 7
- Date: 2026-10-04
- Stage: 0
- Status: accepted
- Context: the mascot and icons could be generated (GPT image) now or later.
- Options: generate now (may need redoing while the UI changes) / placeholders now, brief later.
- Decision: simple SVG placeholders; write the image brief at stage 7 (HUD and menus).
- Why: cheaper, the UI will still change.
- Consequences: final art arrives after the stage 7 layout is approved.

## D-003. Collisions: our own OBBs instead of Rapier
- Date: 2026-10-04
- Stage: 0
- Status: accepted
- Context: the world is made of boxes; Rapier adds 2+ MB of WASM.
- Options: Rapier (ready-made, heavy) / our own OBBs and raycasts (light, deterministic, more code).
- Decision: our own OBB colliders and raycasts.
- Why: bundle size, determinism, easier debugging; the sendline prototype does the same.
- Consequences: if we need complex shapes (ragdolls, dynamic objects), reconsider Rapier.

## D-002. Multiplayer and chat over Supabase Realtime
- Date: 2026-10-04
- Stage: 0
- Status: on hold (multiplayer is out of scope, see D-005)
- Context: the research uses a Cloudflare Worker; the client wants only Vercel + Supabase.
- Options: Cloudflare Durable Objects / Supabase Realtime (presence + broadcast).
- Decision: Supabase Realtime.
- Why: fewer services, free tier, presence with a 3.5 s delay needs no custom server.
- Consequences: check free Realtime limits (connections, messages) if multiplayer comes back.

## D-001. Reuse MIT code from sendline-main
- Date: 2026-10-04
- Stage: 0
- Status: cancelled by D-005
- Context: the folder holds a tested MIT prototype (Pavel Nguyen): sim, input, audio, replay, migrations.
- Options: write from scratch / port with changes.
- Decision: port the code (not the brand) with credit in file headers and the README.
- Why: saves stages 1-2 and part of 4; the code is already tested.
