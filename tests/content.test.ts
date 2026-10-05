import { describe, expect, it } from 'vitest';
import { allLessons, getClip, getLesson } from '../src/game/content';

describe('bundled content', () => {
  it('loads every lesson and the clips they use', () => {
    expect(allLessons().length).toBeGreaterThan(0);
    const l = getLesson('first-takeoff')!;
    for (const s of l.steps) if (s.demo) expect(getClip(s.demo.clip)).toBeDefined();
  });
});
