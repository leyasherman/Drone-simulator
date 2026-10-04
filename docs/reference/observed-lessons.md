# Observed: lessons on the reference sim

What the original does, from the user's screenshots (2026-10-04). This describes **mechanics** only.
We do not copy texts, icons, the mascot or names; we write our own.

## Lesson list screen
- Header: navigation (Play / Gear / Shop / Settings) and a profile card: name, level, XP bar `66 / 200 XP`, credits.
- Courses as tabs: "First Flight 1/7", "Banking 0/7" (course progress in the tab).
- Grid of lesson cards: number, simple diagram of the move, title, progress bar, status
  ("Completed" with a tick / "To fly"). The selected card is highlighted.
- Left panel for the selected lesson: big number, diagram, title, one-line task, "Start lesson" button.
- Course 1 in order: take off → fly forward → tilt angle → hold a line → hold height → change height → final run.
  Course 2 is about banking (roll).

## Inside a lesson
1. **Steps** (the first two lessons have 2 each). Top-left badge: "Flight school · Step N / M", title, "← Lessons" link.
2. Each step has **instructor lines**, one at a time, click to continue. Mascot on the left (changes pose),
   speech bubble at the bottom centre.
3. Meanwhile a **demo flight** plays (FPV view of a recorded instructor flight). The demo can repeat
   ("I'll do it again, watch the height").
4. A **radio outline** sits bottom right; its stick dots follow the demo's recorded sticks.
5. **Practice**: a bubble with the task (no click), HUD with speed (km/h) and altitude (m), a horizon marker,
   targets (gates, square or ring, can be tilted; landing pads). The target is highlighted in colour.
6. Each gate pops "+10 flight XP".
7. **Completion screen**: XP this visit (flight + bonus), progress to the next drone, credits, achievement toast,
   buttons: next lesson / try again / all lessons / main menu. A level bar at the top.

## Crashing during practice
- If the drone falls and cannot take off (upside down), a centre card says "Press [R] to respawn".
- The lesson is not reset: the task bubble and HUD stay; after R the practice continues from spawn.
- There is no fail screen.

## What this means for us
- A lesson is data: steps [lines + demo recording + camera] + practice [targets]. This maps straight onto the editor.
- A demo flight is a recording of poses and sticks played back with interpolation, so we need recorder/player early.
- Lesson 2 is hard on a keyboard. We need a gentler keyboard mode (smoothing, limited tilt or height assist),
  or beginners get stuck on lesson 2.

## Still unknown
- What happens when you miss a gate (probably nothing; just fly again).
- Whether sticks are locked in lessons ("left stick only" sounds like advice, not a lock).
- What the lesson editor looks like (probably admin-only). Waiting for the client's answer.
