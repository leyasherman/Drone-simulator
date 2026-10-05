import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import firstTakeoff from '../content/lessons/first-takeoff.json';
import {
  DraftStore,
  exportDraft,
  gateAhead,
  headingDeg,
  importDraft,
  move,
  newDraft,
  padBelow,
  slugify,
  spawnHere,
  uniqueId,
  validate,
} from '../src/game/editor/draft';
import type { KeyValueStore } from '../src/game/progress';
import { crossedGate, makeGate } from '../src/sim/gates';

const yawQ = (deg: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180);

function store(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('editor helpers', () => {
  it('slugify and uniqueId', () => {
    expect(slugify('Up & Over!')).toBe('up-over');
    expect(slugify('   ')).toBe('my-lesson');
    expect(uniqueId('gate', ['gate-1', 'gate-2'])).toBe('gate-3');
  });

  it('heading matches the spawn yaw convention', () => {
    expect(headingDeg(yawQ(0))).toBeCloseTo(0);
    expect(headingDeg(yawQ(90))).toBeCloseTo(90);
    expect(headingDeg(yawQ(-135))).toBeCloseTo(-135);
  });

  it.each([0, 90, -45, 180])('a gate placed ahead (heading %i°) is passed by flying forward', (yaw) => {
    const d = newDraft();
    const pos = new Vector3(5, 2, -3);
    const g = gateAhead(d.lesson, pos, yawQ(yaw));
    if (g.kind !== 'gate') throw new Error('gate expected');
    const gate = makeGate(g.position, g.rotation, g.size);
    const rad = (yaw * Math.PI) / 180;
    const fwd = new Vector3(-Math.sin(rad), 0, -Math.cos(rad));
    // Fly from the drone's spot, forward through the gate
    const before = pos.clone();
    const after = pos.clone().addScaledVector(fwd, 6);
    expect(crossedGate(gate, before, after)).toBe(true);
    // Flying the other way does not count
    expect(crossedGate(gate, after, before)).toBe(false);
  });

  it('a gate is never placed into the ground', () => {
    const d = newDraft();
    const g = gateAhead(d.lesson, new Vector3(0, 0.05, 0), yawQ(0));
    expect(g.position[1]).toBeGreaterThanOrEqual(1.5);
  });

  it('pads go on the ground; spawn takes position and heading', () => {
    const d = newDraft();
    expect(padBelow(d.lesson, new Vector3(1.23, 4, -7.86)).position).toEqual([1.2, 0, -7.9]);
    expect(spawnHere(new Vector3(3, 2, 4), yawQ(30))).toEqual({ position: [3, 0, 4], yaw: 30 });
  });

  it('move swaps neighbours and ignores out-of-range moves', () => {
    const l = ['a', 'b', 'c'];
    move(l, 0, 1);
    expect(l).toEqual(['b', 'a', 'c']);
    move(l, 0, -1);
    expect(l).toEqual(['b', 'a', 'c']);
  });
});

describe('validate', () => {
  it('a new draft needs an objective', () => {
    const v = validate(newDraft());
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/at least one gate/);
  });

  it('a draft with a gate is a valid lesson', () => {
    const d = newDraft();
    d.lesson.practice.objectives.push(gateAhead(d.lesson, new Vector3(2.5, 2, 2.5), yawQ(0)));
    expect(validate(d)).toMatchObject({ ok: true, errors: [] });
  });

  it('reports a demo that was not recorded, and schema errors with their path', () => {
    const d = newDraft();
    d.lesson.practice.objectives.push(padBelow(d.lesson, new Vector3(0, 0, 0)));
    d.lesson.steps[0]!.demo = { clip: 'not-recorded', camera: 'fpv' };
    d.lesson.title = '';
    const v = validate(d);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' | ')).toMatch(/title/);
    expect(v.errors.join(' | ')).toMatch(/not recorded/);
  });
});

describe('export and import', () => {
  it('round-trips a draft with its clips', () => {
    const d = newDraft();
    d.lesson.practice.objectives.push(padBelow(d.lesson, new Vector3(0, 0, 0)));
    d.clips['my-lesson-step-1'] = { format: 1, rate: 60, frames: [Array(16).fill(0)] };
    const back = importDraft(exportDraft(d));
    expect(back.lesson).toEqual(d.lesson);
    expect(back.clips).toEqual(d.clips);
  });

  it('also opens a plain lesson file from content/lessons', () => {
    expect(importDraft(JSON.stringify(firstTakeoff)).lesson.id).toBe('first-takeoff');
  });

  it('gives a readable error for a bad file', () => {
    expect(() => importDraft('nope')).toThrow(/not JSON/);
    expect(() => importDraft('{"hello":1}')).toThrow(/Not a lesson file/);
  });
});

describe('DraftStore', () => {
  it('saves, lists newest first, renames and removes', () => {
    const s = new DraftStore(store());
    const a = newDraft();
    s.save(a, new Date('2026-01-01'));
    const b = newDraft();
    b.lesson.id = 'second';
    s.save(b, new Date('2026-02-01'));
    expect(s.list().map((d) => d.lesson.id)).toEqual(['second', 'my-lesson']);
    b.lesson.id = 'renamed';
    s.rename('second', b);
    expect(
      s
        .list()
        .map((d) => d.lesson.id)
        .sort(),
    ).toEqual(['my-lesson', 'renamed']);
    s.remove('my-lesson');
    expect(s.list().length).toBe(1);
  });
});
