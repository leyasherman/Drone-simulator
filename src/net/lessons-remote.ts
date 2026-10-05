import type { SupabaseClient } from '@supabase/supabase-js';
import type { Draft } from '../game/editor/draft';
import { lessonSchema, type Lesson } from '../game/lesson-schema';
import { clipJsonSchema, type ClipJson } from '../sim/recording';

/** Lessons from the database: published ones, plus your own unpublished ones. */
export interface RemoteLessons {
  lessons: { lesson: Lesson; published: boolean; mine: boolean }[];
  clips: Record<string, ClipJson>;
}

/** Loads lessons and their clips. Rows that fail validation are skipped (logged), never shown. */
export async function fetchRemoteLessons(
  client: SupabaseClient,
  userId: string | null,
): Promise<RemoteLessons> {
  const out: RemoteLessons = { lessons: [], clips: {} };
  const rows = await client.from('lessons').select('id, data, published, author_id').order('created_at');
  if (rows.error) {
    console.warn('Loading lessons failed:', rows.error.message);
    return out;
  }
  for (const r of rows.data ?? []) {
    const parsed = lessonSchema.safeParse(r.data);
    if (!parsed.success) {
      console.warn(`Skipping lesson ${r.id as string}: it does not match the lesson schema`);
      continue;
    }
    out.lessons.push({
      lesson: parsed.data,
      published: r.published as boolean,
      mine: r.author_id === userId,
    });
  }
  if (out.lessons.length) {
    const clips = await client
      .from('lesson_clips')
      .select('id, data')
      .in(
        'lesson_id',
        out.lessons.map((l) => l.lesson.id),
      );
    for (const c of clips.data ?? []) {
      const parsed = clipJsonSchema.safeParse(c.data);
      if (parsed.success) out.clips[c.id as string] = parsed.data;
    }
  }
  return out;
}

/** True when the signed-in player may publish lessons (a row in authors, and not a guest). */
export async function isAuthor(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_author');
  return !error && data === true;
}

/**
 * Publishes a draft: the lesson row (published) and its demo clips. Clips the lesson no longer uses are removed.
 * Returns null on success, or a message.
 */
export async function publishDraft(client: SupabaseClient, d: Draft, userId: string): Promise<string | null> {
  const lesson = await client.from('lessons').upsert({
    id: d.lesson.id,
    author_id: userId,
    data: d.lesson,
    published: true,
    updated_at: new Date().toISOString(),
  });
  if (lesson.error) {
    return lesson.error.code === '42501'
      ? 'Only authors can publish lessons.'
      : lesson.error.code === '23505' || lesson.error.message.includes('row-level security')
        ? 'This lesson id is taken by another author. Change the id.'
        : `Publishing failed: ${lesson.error.message}`;
  }
  const used = Object.entries(d.clips).filter(([id]) => d.lesson.steps.some((s) => s.demo?.clip === id));
  const old = await client.from('lesson_clips').delete().eq('lesson_id', d.lesson.id);
  if (old.error) return `Publishing clips failed: ${old.error.message}`;
  if (used.length) {
    const clips = await client.from('lesson_clips').insert(
      used.map(([id, data]) => ({
        id,
        lesson_id: d.lesson.id,
        data: clipJsonSchema.parse(data),
        updated_at: new Date().toISOString(),
      })),
    );
    if (clips.error) return `Publishing clips failed: ${clips.error.message}`;
  }
  return null;
}

/** Hides a published lesson from players (it stays in the database as yours). */
export async function unpublish(client: SupabaseClient, id: string): Promise<string | null> {
  const { error } = await client.from('lessons').update({ published: false }).eq('id', id);
  return error ? error.message : null;
}
