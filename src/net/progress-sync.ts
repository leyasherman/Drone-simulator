import type { SupabaseClient } from '@supabase/supabase-js';
import type { Progress, ProgressData } from '../game/progress';
import { LESSON_BONUS_XP } from '../game/lesson-runner';

/** What the game needs from a progress server. Supabase in the game, a fake in tests. */
export interface ProgressBackend {
  /** The signed-in player's progress, or null if it cannot be loaded. */
  load(): Promise<ProgressData | null>;
  /** Records a finished lesson; the server decides the award. Null on failure. */
  complete(lessonId: string, flightXp: number): Promise<{ awarded: number; totalXp: number } | null>;
}

export function supabaseBackend(client: SupabaseClient): ProgressBackend {
  return {
    async load() {
      const [profile, rows] = await Promise.all([
        client.from('profiles').select('xp').maybeSingle(),
        client.from('lesson_completions').select('lesson_id, best_xp, last_completed_at'),
      ]);
      if (profile.error || rows.error) {
        console.warn('Progress load failed:', profile.error?.message ?? rows.error?.message);
        return null;
      }
      const completed: ProgressData['completed'] = {};
      for (const r of rows.data ?? []) {
        completed[r.lesson_id as string] = {
          bestXp: r.best_xp as number,
          completedAt: r.last_completed_at as string,
        };
      }
      return { completed, totalXp: (profile.data?.xp as number | undefined) ?? 0 };
    },
    async complete(lessonId, flightXp) {
      const { data, error } = await client.rpc('complete_lesson', {
        p_lesson_id: lessonId,
        p_flight_xp: flightXp,
      });
      if (error) {
        console.warn('complete_lesson failed:', error.message);
        return null;
      }
      const row = (Array.isArray(data) ? data[0] : data) as { awarded: number; total_xp: number } | undefined;
      return row ? { awarded: row.awarded, totalXp: row.total_xp } : null;
    },
  };
}

/** Lessons finished locally that the server does not know about yet. */
export function missingOnServer(local: ProgressData, remote: ProgressData): string[] {
  return Object.keys(local.completed).filter((id) => !(id in remote.completed));
}

/**
 * Keeps local progress and the server in step. Local is updated at once (no waiting in the UI);
 * the server's answer then corrects the total.
 */
export class ProgressSync {
  online = false;

  constructor(
    private readonly progress: Progress,
    private readonly backend: ProgressBackend,
  ) {}

  /**
   * After sign-in: upload lessons finished before the backend existed (once), then take the server's state.
   */
  async start(): Promise<void> {
    const remote = await this.backend.load();
    if (!remote) return;
    const local = this.progress.snapshot();
    const toUpload = missingOnServer(local, remote);
    for (const id of toUpload) {
      const best = local.completed[id]!.bestXp;
      await this.backend.complete(id, Math.max(0, best - LESSON_BONUS_XP));
    }
    const fresh = toUpload.length ? await this.backend.load() : remote;
    if (fresh) {
      this.progress.replace(fresh);
      this.online = true;
    }
  }

  /** Call when a lesson is finished. */
  async complete(lessonId: string, flightXp: number, shownXp: number): Promise<void> {
    this.progress.complete(lessonId, shownXp);
    if (!this.online) return;
    const r = await this.backend.complete(lessonId, flightXp);
    if (r) this.progress.setTotalXp(r.totalXp);
  }
}
