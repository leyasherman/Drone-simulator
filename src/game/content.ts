import { clipFromJson, type Clip } from '../sim/recording';
import { parseLesson, type Lesson } from './lesson-schema';

/**
 * Lessons and demo clips bundled from content/. Validated once on load, so a broken file fails loudly.
 * Stage 12 moves lessons into Supabase; this stays as the offline seed.
 */
const lessonFiles = import.meta.glob<unknown>('/content/lessons/*.json', { eager: true, import: 'default' });
const clipFiles = import.meta.glob<unknown>('/content/clips/*.json', { eager: true, import: 'default' });

const idFromPath = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length);

const lessons = new Map<string, Lesson>();
for (const [path, data] of Object.entries(lessonFiles)) {
  const lesson = parseLesson(data);
  if (lesson.id !== idFromPath(path)) throw new Error(`${path}: id "${lesson.id}" must match the file name`);
  lessons.set(lesson.id, lesson);
}

const clips = new Map<string, Clip>();
for (const [path, data] of Object.entries(clipFiles)) clips.set(idFromPath(path), clipFromJson(data));

// Every demo a lesson refers to must exist
for (const l of lessons.values()) {
  for (const s of l.steps) {
    if (s.demo && !clips.has(s.demo.clip)) throw new Error(`lesson ${l.id}: missing clip "${s.demo.clip}"`);
  }
}

export function getLesson(id: string): Lesson | undefined {
  return lessons.get(id);
}

export function allLessons(): Lesson[] {
  return [...lessons.values()];
}

export function getClip(id: string): Clip | undefined {
  return clips.get(id);
}
