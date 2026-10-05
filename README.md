# Drone simulator

A browser FPV drone simulator for learning to fly: realistic acro physics, keyboard and gamepad controls,
and a Flight School with instructor briefings, demo flights and hands-on practice.

Built with TypeScript, Three.js and Vite. Work in progress.

**Play it:** https://drone-simulator-tan.vercel.app (desktop Chrome, Edge or Firefox; keyboard or gamepad).

## Run it

Needs Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # flight model, input, lessons, every lesson flown by an autopilot
npm run build      # production build in dist/
```

## Controls

| | Keyboard | Gamepad (Mode 2) |
| --- | --- | --- |
| Throttle | W / S (holds where you leave it) | left stick up/down |
| Yaw | A / D | left stick left/right |
| Pitch / roll | arrow keys | right stick |
| Arm / disarm | Space (throttle must be low) | A |
| Respawn | R | B |
| Camera (FPV / chase) | C | Y |
| Flight School | L | |
| Debug panel | F3 | |

## What works so far

- **Flight physics** at a fixed 240 Hz: rate controller (P, I, D, feedforward), Quad-X mixer with airmode,
  motor lag, thrust with inflow loss, ground effect, drag. Betaflight "Actual" rates and throttle curve.
  Same result at any frame rate.
- **Collisions** with a world made of boxes, crash detection, ground states (upright, tipped, upside down)
  and a respawn prompt.
- **Input:** keyboard and gamepad through one stick layer, arming only with low throttle. Ready for real radios later.
- **FPV and chase cameras**, a HUD with speed and altitude.
- **Flight School:** 7 lessons in the first course. Each has instructor lines, a demo flight with live sticks
  on a radio overlay, and a practice with gates and landing pads, XP and a completion screen.
  Progress is saved in the browser.
- **Flight recording and playback** (P in free flight), used for lesson demos.

## Coming next

Lesson editor, a larger free-flight map, menus and settings, accounts and progress in Supabase,
motor sound, deployment on Vercel.

## Project docs

- [PLAN.md](PLAN.md): stages and their "done when" checks
- [DECISIONS.md](DECISIONS.md): what was decided and why
- [CLAUDE.md](CLAUDE.md): project rules
