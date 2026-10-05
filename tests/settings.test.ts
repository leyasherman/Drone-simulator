import { describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, saveSettings } from '../src/game/settings';
import type { KeyValueStore } from '../src/game/progress';

function store(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('settings', () => {
  it('defaults: normal keyboard, freestyle rates, FOV 100, uptilt 30, intro not seen', () => {
    expect(defaultSettings()).toMatchObject({
      keyboardFeel: 'normal',
      rates: 'freestyle',
      fov: 100,
      uptilt: 30,
      introSeen: false,
    });
  });

  it('saves and loads', () => {
    const s = store();
    saveSettings(s, { ...defaultSettings(), fov: 110, rates: 'racing', introSeen: true });
    expect(loadSettings(s)).toMatchObject({ fov: 110, rates: 'racing', introSeen: true });
  });

  it('keeps the good fields when some are invalid', () => {
    const s = store();
    s.setItem('fpv.settings.v1', JSON.stringify({ fov: 500, rates: 'racing', quality: 'ultra' }));
    const loaded = loadSettings(s);
    expect(loaded.fov).toBe(100);
    expect(loaded.rates).toBe('racing');
    expect(loaded.quality).toBe('high');
  });

  it('survives corrupt JSON', () => {
    const s = store();
    s.setItem('fpv.settings.v1', '{oops');
    expect(loadSettings(s)).toEqual(defaultSettings());
  });
});
