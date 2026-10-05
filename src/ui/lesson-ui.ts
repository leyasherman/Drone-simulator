import './lesson-ui.css';
import type { LessonResult } from '../game/lesson-runner';
import { mascotSvg, type Pose } from './mascot';

export interface LessonUiHandlers {
  /** Click / Enter during the briefing. */
  advance(): void;
  /** "Skip to practice" in the briefing. */
  skip(): void;
  exit(): void;
  tryAgain(): void;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Lesson screens over the 3D view: step badge, instructor with speech bubble, XP pops, completion card. */
export class LessonUi {
  private readonly root = document.createElement('div');
  private readonly badge = document.createElement('div');
  private readonly instructor = document.createElement('div');
  private readonly mascot = document.createElement('div');
  private readonly bubble = document.createElement('div');
  private readonly pops = document.createElement('div');
  private readonly complete = document.createElement('div');
  private pose: Pose | null = null;
  private briefing = false;

  constructor(parent: HTMLElement, on: LessonUiHandlers) {
    this.root.className = 'lesson-ui';
    this.root.hidden = true;
    this.badge.className = 'lesson-badge';
    this.instructor.className = 'lesson-instructor';
    this.mascot.className = 'lesson-mascot';
    this.bubble.className = 'lesson-bubble';
    this.pops.className = 'lesson-pops';
    this.complete.className = 'lesson-complete';
    this.complete.hidden = true;
    this.instructor.append(this.mascot, this.bubble);
    this.root.append(this.badge, this.instructor, this.pops, this.complete);
    parent.append(this.root);

    this.badge.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-exit]')) on.exit();
      if ((e.target as HTMLElement).closest('[data-skip]')) on.skip();
    });
    this.bubble.addEventListener('click', () => this.briefing && on.advance());
    window.addEventListener('keydown', (e) => {
      if (!this.root.hidden && this.briefing && (e.code === 'Enter' || e.code === 'NumpadEnter'))
        on.advance();
    });
    this.complete.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'again') on.tryAgain();
      if (action === 'exit') on.exit();
    });
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  private setBadge(step: string, title: string, canSkip: boolean): void {
    this.badge.innerHTML = `
      <div class="lb-step">${esc(step)}</div>
      <div class="lb-title">${esc(title)}</div>
      <div class="lb-links">
        ${canSkip ? '<button data-skip>Skip to practice</button>' : ''}
        <button data-exit>← Exit</button>
      </div>`;
  }

  private setPose(pose: Pose): void {
    if (pose === this.pose) return;
    this.pose = pose;
    this.mascot.innerHTML = mascotSvg(pose);
  }

  showBriefing(o: { stepIndex: number; stepCount: number; title: string; text: string; pose: Pose }): void {
    this.briefing = true;
    this.complete.hidden = true;
    this.instructor.hidden = false;
    this.setBadge(`Flight school · Step ${o.stepIndex + 1} / ${o.stepCount}`, o.title, true);
    this.setPose(o.pose);
    this.bubble.classList.add('clickable');
    this.bubble.innerHTML = `<p>${esc(o.text)}</p><div class="lb-continue"><span>Click</span> or Enter to continue →</div>`;
  }

  showPractice(o: { title: string; instruction: string }): void {
    this.briefing = false;
    this.complete.hidden = true;
    this.instructor.hidden = false;
    this.setBadge('Flight school · Practice', o.title, false);
    this.setPose('point');
    this.bubble.classList.remove('clickable');
    this.bubble.innerHTML = `<p>${esc(o.instruction)}</p>`;
  }

  /** Floating "+N flight XP" chip. */
  xpPop(amount: number): void {
    const chip = document.createElement('div');
    chip.className = 'lesson-pop';
    chip.textContent = `+${amount} flight XP`;
    this.pops.append(chip);
    setTimeout(() => chip.remove(), 1600);
  }

  showComplete(o: { title: string; result: LessonResult }): void {
    this.briefing = false;
    this.instructor.hidden = true;
    this.badge.innerHTML = '';
    const r = o.result;
    this.complete.innerHTML = `
      <div class="lc-chip">Lesson complete</div>
      <h1>${esc(o.title)}</h1>
      <div class="lc-xp">
        <div class="lc-xp-main">+${r.totalXp} XP</div>
        <div class="lc-xp-split">${r.flightXp} flight · ${r.bonusXp} bonus</div>
      </div>
      <div class="lc-actions">
        <button data-action="again" class="lc-btn"><span>01</span>Try again<i>↗</i></button>
        <button data-action="exit" class="lc-btn primary"><span>02</span>Free flight<i>↗</i></button>
      </div>`;
    this.complete.hidden = false;
  }
}
