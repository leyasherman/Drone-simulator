# Plan: browser FPV drone simulator

Goal: copy the mechanics of the reference sim.

Scope, agreed with the client on 2026-10-04: **free flight, lessons and a lesson editor**.
Input: **keyboard and gamepad**. Design the input layer so real radios can be added later.
Build it ourselves, one feature at a time, foundations first.

References: `sendline-main/docs/research/` (formulas and constants), `docs/reference/observed-lessons.md`
(what the original does). Graphics should look similar in style (daylight low-poly world made of boxes,
light UI cards), but every asset and text is our own.

Stack: TypeScript, Three.js, Vite, Vercel, Supabase. Free tiers only.

Status: `[ ]` not started, `[~]` in progress, `[x]` done (criteria checked, committed).
Rule: one stage at a time. After each stage, report and wait for approval.

**Build order (agreed 2026-10-05):** 0, 1, 2a, 2b, 3, 4, 5, 7a, 8, 9a, 9b, 10a, 10b, 7b, 12a, 12b, 11a, 11b, 6, 13.
12 moved before 11 (2026-10-05): the client asked for login with Supabase.
7b moved before 11 (2026-10-05): without a start menu and an intro, a new player cannot find the lessons.
Lessons come before the city map: they are what the client values most and they only need the training area.

---

## Foundations

### Stage 0. Scaffold `[x]`
git init, Vite + strict TS + Three.js, Vitest, ESLint + Prettier, folder layout, a scene with a cube, `.env.example`.
**Done when:** `npm run dev` shows the scene; typecheck, lint, test and build pass.

### Stage 1. Clock and rigid body `[x]`
Fixed 1/240 s step (max 16 steps per frame, reset after a gap over 0.25 s), interpolation for rendering,
rigid body (position, quaternion, velocities, box inertia), gravity, applying forces and torques.
**Done when:** tests pass: a drop from 5 m hits the ground at √(2gh) ≈ 9.90 m/s (no drag yet); frame times of 1/15, 1/30, 1/60 and
1/144 s give the same result; two runs are bit-for-bit equal.

### Stage 2a. Motors, thrust, mixer, drag `[x]`
Freestyle 5" profile, throttle curve, Quad-X mixer with airmode, motor lag, thrust with inflow loss,
yaw reaction torque, stable drag. No controller yet: mixer commands drive the motors directly.
**Done when:** tests pass: hover at ~38-40% throttle stick; unpowered drop from 5 m hits at ~8.2 m/s (with drag);
motor reaches 63% of a step in its time constant; mixer commands turn the drone the right way on each axis;
top speed nose-down at 60° with full throttle is about 100 km/h.

### Stage 2b. Rate controller and rates `[x]`
Rate controller (P, I, D, FF, anti-windup), Betaflight Actual rates, rate presets.
**Done when:** tests pass: full roll stick gives ~800°/s and reaches 63% in ~40 ms; 20% yaw stick tracks its target;
hover for 10 s with sticks centred stays level with no drift.

### Stage 3. Input `[x]`
One "sticks" layer (throttle, roll, pitch, yaw, buttons) fed by keyboard and gamepad (Mode 2, deadband).
Arm only with throttle at or below 15%. A gentler keyboard mode for beginners. The source interface is ready
for radios (calibration later).
**Done when:** debug channel bars react to keyboard and gamepad; arming with throttle up is refused with a message;
tests for axis normalisation and deadband pass.

### Stage 4. Flying in 3D `[x]`
Our own low-poly drone model, FPV camera (FOV 100°, uptilt 30°), chase camera, test field (grid, sky, clouds, light).
**Done when:** you can take off, fly and land with keyboard and gamepad; steady 60 fps; camera switching works.

### Stage 5. Collisions and respawn `[x]`
World made of boxes (OBB), collisions with continuous detection, a downward raycast, ground states
(upright / tipped / upside down), light hits, crashes, respawn on R, a respawn prompt when upside down.
**Done when:** tests pass: at 30 m/s the drone does not pass through a 10 cm wall; it rests on the ground
without jitter; in the browser an upside-down drone shows the respawn prompt.

## Free flight

### Stage 6. Map `[ ]`
Box-based world generator: lesson area (track, grid), city (roads, towers, wind turbines, cranes), map borders.
**Done when:** map is ~400×400 m; 60 fps on a mid-range machine; leaving the borders returns you to spawn.

### Stage 7a. Flight HUD `[x]`
HUD like the original: speed (km/h) and altitude (m) top right, horizon marker in the centre.
The debug panel moves behind F3.
**Done when:** HUD shows correct values while flying; F3 toggles the debug panel.

### Stage 7b. Menus, intro and settings `[x]`
Main menu at start (Flight School, Free flight, Controls intro, Settings). A short intro with the mascot on the first
visit (controls, arming, respawn, Esc). Pause menu on Esc (Resume, Respawn, Flight School, Settings, Main menu).
Settings: keyboard feel, gamepad throttle mode, rate preset, FPV FOV and uptilt, graphics quality. Saved locally.
**Done when:** a first-time visitor sees the intro, then the menu, and can reach lessons and free flight by mouse;
Esc pauses and resumes; settings apply at once and survive a reload.

## Lessons

### Stage 8. Recording and playing back flights `[x]`
Recorder for poses and sticks at 60 Hz, player with interpolation (lerp/slerp), serialisation.
**Done when:** tests pass: playback stays within 1 mm of the original path; in the browser a recorded flight
plays with the FPV camera and live sticks on the overlay.

### Stage 9a. Lesson format and logic `[x]`
Lesson format (Zod): steps (instructor lines + demo + camera), practice (gates, landing pads).
Gate crossing and landing checks, a lesson runner (briefing → practice → complete) with no UI.
**Done when:** tests pass: schema accepts a good lesson and rejects bad ones; gate crossing (front to back,
inside the opening, fast segments); landing (after being airborne, inside the radius, upright, slow for 0.6 s);
the runner walks lines and steps, counts gates in order, gives +10 XP per gate and completes.

### Stage 9b. Lesson UI and lesson 1 `[x]`
Lesson UI (step badge, instructor bubble with a placeholder mascot, radio overlay, "+XP" per gate, gate and pad
visuals, completion screen). Lesson 1 (takeoff) with our own texts and demo flights.
**Done when:** lesson 1 runs from start to the completion screen in the browser.

### Stage 10a. Lesson list and progress `[x]`
Courses file, lesson list screen (course tabs with progress, lesson cards with status, lesson panel with Start),
local progress (localStorage), completion screen with Next lesson / Try again / All lessons. L opens the list.
**Done when:** the list shows lesson 1 and its status; finishing it marks it done and survives a reload;
Next lesson / All lessons / Exit go where they say.

### Stage 10b. Course 1: seven lessons `[x]`
A lesson lane on the field, an autopilot that flies any lesson's objectives, demo clips made by it,
six more lessons with our own texts.
**Done when:** a test flies every lesson's practice with the autopilot and completes it; all 7 lessons play in the browser.

### Stage 11a. Lesson editor in the game `[x]`
A side panel over free flight: lesson details, spawn, steps with instructor lines and poses, practice objectives
placed where the drone is (gate facing the drone's heading, or a pad below it) and fine-tuned with numbers,
demo flights recorded by flying, a Test button that plays the draft as a lesson, drafts kept in the browser,
JSON export and import (same format as content/lessons).
**Done when:** a new lesson is made in the editor without touching code, passes the lesson schema, and can be
played start to finish with Test; export then import gives the same lesson; tests cover the draft operations.

### Stage 11b. Publish lessons through Supabase `[x]`
Lessons table with an author role; published lessons and their demo clips load for every player and show in the list.
**Done when:** an author publishes a lesson from the editor and a fresh browser sees and plays it; non-authors cannot write lessons.

## Data and release

### Stage 12a. Supabase: accounts and progress in the database `[x]`
Tables profiles and lesson_completions with RLS; XP and completions written only through RPC functions that check
and cap them. A silent anonymous account on the first visit. Progress loads from and saves to Supabase
(local copy as offline fallback). Supabase URL and publishable key set in Vercel.
**Done when:** a new browser gets an account without a form; finishing a lesson shows up in the database and
survives a reload; a direct update of XP from the client is refused; Supabase advisors report no security issues;
the live site saves progress too.

### Stage 12b. Account screen: email and password `[x]`
Create an account (turns the anonymous one into a permanent one, progress kept), sign in, sign out, nickname.
**Done when:** progress made anonymously survives signing up; signing in from another browser shows the same
progress; a bad password or a taken email shows a clear message.

### Stage 13. Sound, polish, deploy `[ ]`
Motor sound from RPM, camera effects, Low/Medium/High quality, course 2, deploy to Vercel.
**Done when:** the production URL works from first visit through a finished lesson and free flight.

---

## Out of scope (client's answer)
Races, multiplayer, chat, skill chain, replay editor, shop, other drones, real radio calibration
(the architecture allows it, built later).

## Open questions
- What exactly the client means by "the lessons are inside like the editor" (affects stage 11).
