import { describe, expect, it } from 'vitest';
import { stickDots } from '../src/ui/radio-overlay';

describe('stickDots (Mode 2)', () => {
  it('throttle moves the left dot from bottom to top; pitch back moves the right dot down', () => {
    const low = stickDots({ throttle: 0, roll: 0, pitch: 0, yaw: 0 });
    const high = stickDots({ throttle: 1, roll: 0, pitch: 0, yaw: 0 });
    expect(high.ly).toBeLessThan(low.ly);
    const back = stickDots({ throttle: 0.5, roll: 0, pitch: 1, yaw: 0 });
    const centre = stickDots({ throttle: 0.5, roll: 0, pitch: 0, yaw: 0 });
    expect(back.ry).toBeGreaterThan(centre.ry);
  });
  it('roll right and yaw right move dots right', () => {
    const c = stickDots({ throttle: 0.5, roll: 0, pitch: 0, yaw: 0 });
    const r = stickDots({ throttle: 0.5, roll: 1, pitch: 0, yaw: 1 });
    expect(r.rx).toBeGreaterThan(c.rx);
    expect(r.lx).toBeGreaterThan(c.lx);
  });
});
