import { clipFromJson, type Clip } from '../sim/recording';
import coursesFile from '../../content/courses.json';
import { coursesSchema, parseLesson, type Course, type Lesson } from './lesson-schema';

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

const courses: Course[] = coursesSchema.parse(coursesFile);
for (const c of courses) {
  for (const id of c.lessons) if (!lessons.has(id)) throw new Error(`course ${c.id}: missing lesson "${id}"`);
}

export function allCourses(): Course[] {
  return courses;
}

/** The lesson after this one in its course, if any. */
export function nextLessonId(id: string): string | undefined {
  for (const c of courses) {
    const i = c.lessons.indexOf(id);
    if (i >= 0) return c.lessons[i + 1];
  }
  return undefined;
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

// ---- Lessons published from the editor (loaded from the database at runtime) ----

const bundledLessonIds = new Set(lessons.keys());
const bundledClipIds = new Set(clips.keys());
const remoteClipIds = new Set<string>();
export const COMMUNITY_COURSE_ID = 'community';

/** True for lessons that ship with the game (they cannot be replaced from the database). */
export function isBundled(lessonId: string): boolean {
  return bundledLessonIds.has(lessonId);
}

/**
 * Replaces the set of database lessons. They are listed in a "Community" course after the built-in ones.
 * Ids that clash with built-in lessons or clips are skipped.
 */
export function registerRemoteLessons(list: readonly Lesson[], remoteClips: Record<string, unknown>): void {
  for (const id of [...lessons.keys()]) if (!bundledLessonIds.has(id)) lessons.delete(id);
  for (const id of remoteClipIds) clips.delete(id);
  remoteClipIds.clear();
  for (const [id, data] of Object.entries(remoteClips)) {
    if (bundledClipIds.has(id)) continue;
    clips.set(id, clipFromJson(data));
    remoteClipIds.add(id);
  }
  const ids: string[] = [];
  for (const l of list) {
    if (bundledLessonIds.has(l.id)) continue;
    lessons.set(l.id, l);
    ids.push(l.id);
  }
  const i = courses.findIndex((c) => c.id === COMMUNITY_COURSE_ID);
  if (i >= 0) courses.splice(i, 1);
  if (ids.length) courses.push({ id: COMMUNITY_COURSE_ID, title: 'Community', lessons: ids });
}
