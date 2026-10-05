import { describe, expect, it } from 'vitest';
import firstTakeoff from '../content/lessons/first-takeoff.json';
import { allCourses, getClip, getLesson, isBundled, registerRemoteLessons } from '../src/game/content';
import { parseLesson } from '../src/game/lesson-schema';

const remote = (id: string) => parseLesson({ ...firstTakeoff, id, title: `Remote ${id}` });
const clip = { format: 1, rate: 60, frames: [Array(16).fill(0)] };

describe('lessons from the database', () => {
  it('appear in a Community course and can be replaced', () => {
    registerRemoteLessons([remote('remote-one')], { 'remote-one-clip': clip });
    expect(getLesson('remote-one')?.title).toBe('Remote remote-one');
    expect(getClip('remote-one-clip')).toBeDefined();
    expect(allCourses().at(-1)).toMatchObject({ id: 'community', lessons: ['remote-one'] });

    registerRemoteLessons([remote('remote-two')], {});
    expect(getLesson('remote-one')).toBeUndefined();
    expect(getClip('remote-one-clip')).toBeUndefined();
    expect(allCourses().filter((c) => c.id === 'community')).toHaveLength(1);
  });

  it('never replace built-in lessons', () => {
    registerRemoteLessons([{ ...remote('first-takeoff'), title: 'Hijacked' }], {});
    expect(getLesson('first-takeoff')?.title).toBe('Lift Off');
    expect(isBundled('first-takeoff')).toBe(true);
    expect(allCourses().some((c) => c.id === 'community')).toBe(false);
  });
});
