import './lesson-list.css';
import type { Course, Lesson } from '../game/lesson-schema';
import type { Progress } from '../game/progress';
import { lessonIconSvg } from './lesson-icons';

export interface LessonListHandlers {
  start(lessonId: string): void;
  close(): void;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Flight school screen: course tabs, lesson cards, and a panel for the selected lesson. */
export class LessonList {
  private readonly root = document.createElement('div');
  private courseId: string;
  private selected: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly courses: readonly Course[],
    private readonly lessons: (id: string) => Lesson | undefined,
    private readonly progress: Progress,
    on: LessonListHandlers,
  ) {
    this.root.className = 'lesson-list';
    this.root.hidden = true;
    this.courseId = courses[0]!.id;
    parent.append(this.root);

    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const tab = el.closest<HTMLElement>('[data-course]');
      const card = el.closest<HTMLElement>('[data-lesson]');
      if (tab) {
        this.courseId = tab.dataset.course!;
        this.selected = null;
        this.render();
      } else if (el.closest('[data-start]') && this.selected) {
        on.start(this.selected);
      } else if (el.closest('[data-close]')) {
        on.close();
      } else if (card) {
        this.selected = card.dataset.lesson!;
        this.render();
      }
    });
    this.root.addEventListener('dblclick', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-lesson]');
      if (card) on.start(card.dataset.lesson!);
    });
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.code === 'Escape') on.close();
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.selected) on.start(this.selected);
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Opens the list, selecting `lessonId` (or the first lesson not done yet). */
  open(lessonId?: string): void {
    if (lessonId) {
      const c = this.courses.find((c) => c.lessons.includes(lessonId));
      if (c) this.courseId = c.id;
    }
    this.selected = lessonId ?? null;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const course = this.courses.find((c) => c.id === this.courseId)!;
    const ids = course.lessons;
    // Default selection: the first lesson not done yet
    if (!this.selected || !ids.includes(this.selected)) {
      this.selected = ids.find((id) => !this.progress.isDone(id)) ?? ids[0] ?? null;
    }
    const tabs = this.courses
      .map((c) => {
        const done = this.progress.countDone(c.lessons);
        return `<button class="ll-tab ${c.id === this.courseId ? 'on' : ''}" data-course="${c.id}">
          <span>${esc(c.title)}</span><b>${done} / ${c.lessons.length}</b></button>`;
      })
      .join('');

    const cards = ids
      .map((id, i) => {
        const l = this.lessons(id)!;
        const done = this.progress.isDone(id);
        return `<button class="ll-card ${id === this.selected ? 'on' : ''} ${done ? 'done' : ''}" data-lesson="${id}">
          <div class="ll-num">${pad2(i + 1)}</div>
          ${done ? '<div class="ll-tick">✓</div>' : ''}
          ${lessonIconSvg(l.icon)}
          <div class="ll-title">${esc(l.title)}</div>
          <div class="ll-status"><i><u style="width:${done ? 100 : 0}%"></u></i><span>${done ? 'Completed' : 'To fly'}</span></div>
        </button>`;
      })
      .join('');

    const sel = this.selected ? this.lessons(this.selected) : undefined;
    const panel = sel
      ? `<div class="ll-panel">
          <div class="ll-panel-top">
            <div class="ll-panel-num">${pad2(ids.indexOf(sel.id) + 1)}</div>
            <div class="ll-panel-icon">${lessonIconSvg(sel.icon)}</div>
          </div>
          <h2>${esc(sel.title)}</h2>
          <p>${esc(sel.summary)}</p>
          <button class="ll-start" data-start>${this.progress.isDone(sel.id) ? 'Fly again' : 'Start lesson'} →</button>
        </div>`
      : `<div class="ll-panel empty"><h2>Coming soon</h2><p>New lessons for this course are on the way.</p></div>`;

    this.root.innerHTML = `
      <header class="ll-head">
        <div class="ll-brand">Flight school</div>
        <div class="ll-xp"><span>Total</span><b>${this.progress.totalXp} XP</b></div>
        <button class="ll-close" data-close>Free flight ✕</button>
      </header>
      <nav class="ll-tabs">${tabs}</nav>
      <section class="ll-body">${panel}<div class="ll-grid">${cards}</div></section>`;
  }
}
