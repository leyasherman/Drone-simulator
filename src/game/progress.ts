import { z } from 'zod';

/**
 * Local lesson progress, kept in the browser. Stage 12 moves it to Supabase (server-checked XP);
 * this stays as the offline copy. Storage is injectable so tests do not need a browser.
 */
const STORAGE_KEY = 'fpv.progress.v1';

const progressSchema = z.object({
  completed: z.record(z.string(), z.object({ bestXp: z.number(), completedAt: z.string() })).default({}),
  totalXp: z.number().default(0),
});
export type ProgressData = z.infer<typeof progressSchema>;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Storage that forgets everything (when localStorage is blocked, e.g. private mode). */
export const MEMORY_STORE: KeyValueStore = (() => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
})();

export function browserStore(): KeyValueStore {
  try {
    const s = globalThis.localStorage;
    s.setItem('fpv.probe', '1');
    return s;
  } catch {
    return MEMORY_STORE;
  }
}

export class Progress {
  private data: ProgressData;

  constructor(private readonly store: KeyValueStore = browserStore()) {
    this.data = Progress.read(store);
  }

  private static read(store: KeyValueStore): ProgressData {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) return progressSchema.parse(JSON.parse(raw));
    } catch {
      // Corrupt or old data: start fresh rather than crash
    }
    return progressSchema.parse({});
  }

  isDone(lessonId: string): boolean {
    return lessonId in this.data.completed;
  }

  get totalXp(): number {
    return this.data.totalXp;
  }

  /** Records a finished lesson. XP adds up every time, like a visit in the original. */
  complete(lessonId: string, xp: number, now = new Date()): void {
    const prev = this.data.completed[lessonId];
    this.data.completed[lessonId] = {
      bestXp: Math.max(prev?.bestXp ?? 0, xp),
      completedAt: now.toISOString(),
    };
    this.data.totalXp += xp;
    this.save();
  }

  /** How many of these lessons are done. */
  countDone(lessonIds: readonly string[]): number {
    return lessonIds.filter((id) => this.isDone(id)).length;
  }

  private save(): void {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: keep the in-memory copy
    }
  }
}
