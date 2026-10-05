import { describe, expect, it } from 'vitest';
import { formatAltitude, formatSpeed } from '../src/ui/hud-format';

describe('HUD formatting', () => {
  it('shows whole km/h and never -0', () => {
    expect(formatSpeed(23.4)).toBe('23');
    expect(formatSpeed(23.6)).toBe('24');
    expect(formatSpeed(-0.2)).toBe('0');
  });
  it('shows altitude with one decimal, clamped', () => {
    expect(formatAltitude(30.94)).toBe('30.9');
    expect(formatAltitude(-1)).toBe('0.0');
    expect(formatAltitude(123456)).toBe('9999.9');
  });
});
