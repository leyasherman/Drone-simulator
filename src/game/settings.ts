import { z } from 'zod';
import type { KeyValueStore } from './progress';

/** Player settings, saved in the browser. Every field has a default, so old or partial data still loads. */
const STORAGE_KEY = 'fpv.settings.v1';

export const settingsSchema = z.object({
  keyboardFeel: z.enum(['normal', 'gentle']).default('normal'),
  gamepadThrottle: z.enum(['centerZero', 'fullRange']).default('centerZero'),
  rates: z.enum(['cinematic', 'freestyle', 'racing']).default('freestyle'),
  fov: z.number().min(60).max(130).default(100),
  uptilt: z.number().min(0).max(50).default(30),
  quality: z.enum(['high', 'low']).default('high'),
  introSeen: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(): Settings {
  return settingsSchema.parse({});
}

export function loadSettings(store: KeyValueStore): Settings {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw) {
      // Drop fields that fail validation one by one instead of losing everything
      const data = JSON.parse(raw) as Record<string, unknown>;
      const out = defaultSettings();
      for (const key of Object.keys(out) as (keyof Settings)[]) {
        const field = settingsSchema.shape[key].safeParse(data[key]);
        if (field.success) (out as Record<string, unknown>)[key] = field.data;
      }
      return out;
    }
  } catch {
    // Corrupt JSON: defaults
  }
  return defaultSettings();
}

export function saveSettings(store: KeyValueStore, s: Settings): void {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: settings last for this visit only
  }
}
