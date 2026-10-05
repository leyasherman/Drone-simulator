import { describe, expect, it } from 'vitest';
import { Progress, type KeyValueStore } from '../src/game/progress';
import { allCourses, nextLessonId } from '../src/game/content';

function store(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('Progress', () => {
  it('records completions and XP and survives a reload', () => {
    const s = store();
    const p = new Progress(s);
    expect(p.isDone('first-takeoff')).toBe(false);
    p.complete('first-takeoff', 40);
    p.complete('first-takeoff', 30);
    const again = new Progress(s);
    expect(again.isDone('first-takeoff')).toBe(true);
    expect(again.totalXp).toBe(70);
    expect(again.countDone(['first-takeoff', 'other'])).toBe(1);
  });

  it('starts fresh on corrupt data instead of crashing', () => {
    const s = store();
    s.setItem('fpv.progress.v1', '{not json');
    expect(new Progress(s).totalXp).toBe(0);
  });
});

describe('courses', () => {
  it('first course starts with lesson 1; the last lesson has no next', () => {
    const c = allCourses()[0]!;
    expect(c.lessons[0]).toBe('first-takeoff');
    expect(nextLessonId(c.lessons.at(-1)!)).toBeUndefined();
  });
});
