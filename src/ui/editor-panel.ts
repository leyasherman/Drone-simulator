import './editor-panel.css';
import type { Quaternion, Vector3 } from 'three';
import {
  clipIdFor,
  exportDraft,
  gateAhead,
  importDraft,
  move,
  newDraft,
  padBelow,
  slugify,
  spawnHere,
  uniqueId,
  validate,
  type Draft,
  type DraftStore,
} from '../game/editor/draft';
import { ICONS, POSES } from '../game/lesson-schema';
import { clipDuration, clipFromJson, type ClipJson } from '../sim/recording';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface EditorHandlers {
  /** Where the drone is now (gates and pads are placed from it). */
  pose(): { position: Vector3; orientation: Quaternion };
  /** Start recording a demo: respawn at the lesson's spawn and record the flight. */
  startRecording(spawn: Draft['lesson']['spawn']): void;
  /** Stop and return the recorded clip. */
  stopRecording(): ClipJson | null;
  /** Play the draft as a lesson. */
  test(draft: Draft): void;
  /** The draft changed (objectives moved, etc.). */
  changed(draft: Draft): void;
  exit(): void;
  /** Publish to every player (authors only). Resolves to null on success or a message. */
  publish?(draft: Draft): Promise<string | null>;
}

/** Writes value at a dotted path like "lesson.steps.0.lines.1.text". */
function setPath(root: object, path: string, value: unknown): void {
  const keys = path.split('.');
  let o = root as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys.at(-1)!] = value;
}

/** Side panel for building a lesson while flying. Drafts are kept in the browser. */
export class EditorPanel {
  private readonly root = document.createElement('aside');
  private draft: Draft;
  /** Id under which the current draft is saved (changes when the lesson id is edited). */
  private savedId: string;
  private recordingStep: string | null = null;
  private notice = '';
  /** Shows the Publish button (the signed-in player is an author). */
  private canPublish = false;
  private publishing = false;

  constructor(
    parent: HTMLElement,
    private readonly drafts: DraftStore,
    private readonly on: EditorHandlers,
  ) {
    this.root.className = 'ed-panel';
    this.root.hidden = true;
    parent.append(this.root);
    this.draft = drafts.list()[0] ?? newDraft();
    this.savedId = this.draft.lesson.id;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.onInput(e.target as HTMLInputElement, false));
    this.root.addEventListener('change', (e) => this.onInput(e.target as HTMLInputElement, true));
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
    if (v) {
      this.render();
      this.on.changed(this.draft);
    }
  }

  setAuthor(isAuthor: boolean): void {
    this.canPublish = isAuthor;
    if (this.visible) this.render();
  }

  private async publish(): Promise<void> {
    const v = validate(this.draft);
    if (!v.ok) {
      this.notice = 'Fix the problems listed below first.';
      this.render();
      return;
    }
    if (!this.on.publish) return;
    this.save();
    this.publishing = true;
    this.notice = 'Publishing…';
    this.render();
    const err = await this.on.publish(this.draft);
    this.publishing = false;
    this.notice = err ?? 'Published. Every player now sees it under Flight School → Community.';
    this.render();
  }

  get current(): Draft {
    return this.draft;
  }

  get recording(): boolean {
    return this.recordingStep !== null;
  }

  private save(): void {
    if (this.savedId !== this.draft.lesson.id) {
      this.drafts.rename(this.savedId, this.draft);
      this.savedId = this.draft.lesson.id;
    } else if (!this.drafts.save(this.draft)) {
      this.notice = 'The browser storage is full: export the lesson to keep it.';
    }
    this.on.changed(this.draft);
  }

  private onInput(el: HTMLInputElement, committed: boolean): void {
    const path = el.dataset.bind;
    if (!path) return;
    let value: unknown = el.value;
    if (el.dataset.num !== undefined) {
      const n = Number.parseFloat(el.value);
      if (!Number.isFinite(n)) return;
      value = n;
    }
    setPath(this.draft, path, value);
    if (path === 'lesson.title' && el.dataset.autoid !== undefined) {
      // Keep the id in step with the title until the author edits the id
      this.draft.lesson.id = slugify(el.value);
      const idField = this.root.querySelector<HTMLInputElement>('[data-bind="lesson.id"]');
      if (idField) idField.value = this.draft.lesson.id;
    }
    if (committed) {
      this.save();
      this.renderStatus();
    }
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act!;
    const i = Number(el.dataset.i ?? -1);
    const j = Number(el.dataset.j ?? -1);
    const l = this.draft.lesson;
    const steps = l.steps;
    const objs = l.practice.objectives;
    const pose = () => this.on.pose();
    this.notice = '';

    switch (act) {
      case 'exit':
        if (this.recordingStep) this.stopRecording();
        this.on.exit();
        return;
      case 'new':
        this.draft = newDraft();
        this.draft.lesson.id = uniqueId(
          'my-lesson',
          this.drafts.list().map((d) => d.lesson.id),
        );
        this.savedId = this.draft.lesson.id;
        break;
      case 'open': {
        const id = (this.root.querySelector('[data-pick]') as HTMLSelectElement).value;
        const d = this.drafts.list().find((x) => x.lesson.id === id);
        if (d) {
          this.draft = d;
          this.savedId = d.lesson.id;
        }
        this.render();
        this.on.changed(this.draft);
        return;
      }
      case 'delete':
        this.drafts.remove(this.savedId);
        this.draft = this.drafts.list()[0] ?? newDraft();
        this.savedId = this.draft.lesson.id;
        break;
      case 'export':
        this.download();
        return;
      case 'import':
        (this.root.querySelector('[data-file]') as HTMLInputElement).click();
        return;
      case 'publish':
        void this.publish();
        return;
      case 'test': {
        const v = validate(this.draft);
        if (!v.ok) {
          this.notice = 'Fix the problems listed below first.';
          break;
        }
        this.save();
        this.on.test(this.draft);
        return;
      }
      case 'spawn':
        l.spawn = spawnHere(pose().position, pose().orientation);
        break;
      case 'add-step':
        steps.push({
          id: uniqueId(
            'step',
            steps.map((s) => s.id),
          ),
          lines: [{ text: 'New line.', pose: 'point' }],
        });
        break;
      case 'step-up':
      case 'step-down':
        move(steps, i, act === 'step-up' ? -1 : 1);
        break;
      case 'step-del':
        if (steps.length > 1) steps.splice(i, 1);
        else this.notice = 'A lesson needs at least one step.';
        break;
      case 'add-line':
        steps[i]!.lines.push({ text: 'New line.', pose: 'wave' });
        break;
      case 'line-del':
        if (steps[i]!.lines.length > 1) steps[i]!.lines.splice(j, 1);
        break;
      case 'rec':
        this.startRecording(steps[i]!.id);
        break;
      case 'stop':
        this.stopRecording();
        break;
      case 'demo-del':
        delete steps[i]!.demo;
        break;
      case 'gate':
        objs.push(gateAhead(l, pose().position, pose().orientation));
        break;
      case 'pad':
        objs.push(padBelow(l, pose().position));
        break;
      case 'obj-up':
      case 'obj-down':
        move(objs, i, act === 'obj-up' ? -1 : 1);
        break;
      case 'obj-del':
        objs.splice(i, 1);
        break;
      case 'obj-here': {
        // Re-place this objective from the drone's current spot
        const o = objs[i]!;
        const fresh =
          o.kind === 'gate'
            ? gateAhead(l, pose().position, pose().orientation, 3, o.size)
            : padBelow(l, pose().position, o.radius);
        objs[i] = { ...fresh, id: o.id } as typeof o;
        break;
      }
      default:
        return;
    }
    this.save();
    this.render();
  }

  private startRecording(stepId: string): void {
    this.recordingStep = stepId;
    this.on.startRecording(this.draft.lesson.spawn);
    this.notice = 'Recording: fly the demo now, then press Stop.';
  }

  private stopRecording(): void {
    const stepId = this.recordingStep;
    this.recordingStep = null;
    const clip = this.on.stopRecording();
    const step = this.draft.lesson.steps.find((s) => s.id === stepId);
    if (!clip || !step || clip.frames.length < 10) {
      this.notice = 'Nothing was recorded.';
      return;
    }
    const id = clipIdFor(this.draft.lesson.id, step.id);
    this.draft.clips[id] = clip;
    step.demo = { clip: id, camera: step.demo?.camera ?? 'chase' };
    // Drop clips no step uses any more
    const used = new Set(this.draft.lesson.steps.map((s) => s.demo?.clip).filter(Boolean));
    for (const k of Object.keys(this.draft.clips)) if (!used.has(k)) delete this.draft.clips[k];
    this.notice = `Demo recorded: ${clipDuration(clipFromJson(clip)).toFixed(1)} s.`;
  }

  /** Imports a file chosen with the hidden file input. */
  private async importFile(file: File): Promise<void> {
    try {
      const d = importDraft(await file.text());
      this.draft = d;
      this.savedId = d.lesson.id;
      this.notice = `Imported "${d.lesson.title}".`;
      this.save();
    } catch (e) {
      this.notice = (e as Error).message;
    }
    this.render();
  }

  private download(): void {
    const blob = new Blob([exportDraft(this.draft)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.draft.lesson.id}.lesson.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private renderStatus(): void {
    const box = this.root.querySelector('[data-status]');
    if (!box) return;
    const v = validate(this.draft);
    box.className = `ed-status ${v.ok ? 'ok' : 'bad'}`;
    box.innerHTML = v.ok
      ? 'Ready to test.'
      : `<b>${v.errors.length} to fix:</b><ul>${v.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
  }

  private render(): void {
    const d = this.draft;
    const l = d.lesson;
    const rec = this.recordingStep;
    const num = (path: string, value: number, step = 0.1) =>
      `<input type="number" step="${step}" data-num data-bind="${path}" value="${value}" />`;
    const options = (list: readonly string[], cur: string) =>
      list.map((v) => `<option ${v === cur ? 'selected' : ''}>${v}</option>`).join('');

    const steps = l.steps
      .map((s, i) => {
        const clip = s.demo ? d.clips[s.demo.clip] : undefined;
        const demo = clip
          ? `Demo: ${clipDuration(clipFromJson(clip)).toFixed(1)} s ·
             <select data-bind="lesson.steps.${i}.demo.camera">${options(['chase', 'fpv'], s.demo!.camera)}</select>
             <button data-act="demo-del" data-i="${i}">Remove</button>`
          : 'No demo yet.';
        return `<div class="ed-card">
          <div class="ed-row"><b>Step ${i + 1}</b>
            <span class="ed-tools"><button data-act="step-up" data-i="${i}">↑</button><button data-act="step-down" data-i="${i}">↓</button><button data-act="step-del" data-i="${i}">✕</button></span></div>
          ${s.lines
            .map(
              (line, j) => `<div class="ed-line">
                <textarea rows="2" data-bind="lesson.steps.${i}.lines.${j}.text" maxlength="200">${esc(line.text)}</textarea>
                <div class="ed-row"><select data-bind="lesson.steps.${i}.lines.${j}.pose">${options(POSES, line.pose)}</select>
                <button data-act="line-del" data-i="${i}" data-j="${j}">Remove line</button></div></div>`,
            )
            .join('')}
          <button data-act="add-line" data-i="${i}">+ Line</button>
          <div class="ed-demo">${demo}
            ${
              rec === s.id
                ? `<button class="ed-rec on" data-act="stop">■ Stop recording</button>`
                : `<button class="ed-rec" data-act="rec" data-i="${i}" ${rec ? 'disabled' : ''}>● Record demo</button>`
            }</div>
        </div>`;
      })
      .join('');

    const objs = l.practice.objectives
      .map((o, i) => {
        const base = `lesson.practice.objectives.${i}`;
        const fields =
          o.kind === 'gate'
            ? `<label>x ${num(`${base}.position.0`, o.position[0])}</label><label>y ${num(`${base}.position.1`, o.position[1])}</label>
               <label>z ${num(`${base}.position.2`, o.position[2])}</label><label>turn ${num(`${base}.rotation.1`, o.rotation[1], 5)}</label>
               <label>tilt ${num(`${base}.rotation.0`, o.rotation[0], 5)}</label>
               <label>w ${num(`${base}.size.0`, o.size[0])}</label><label>h ${num(`${base}.size.1`, o.size[1])}</label>`
            : `<label>x ${num(`${base}.position.0`, o.position[0])}</label><label>z ${num(`${base}.position.2`, o.position[2])}</label>
               <label>radius ${num(`${base}.radius`, o.radius)}</label>`;
        return `<div class="ed-card ed-obj">
          <div class="ed-row"><b>${i + 1}. ${o.kind === 'gate' ? 'Gate' : 'Landing pad'}</b> <span class="ed-id">${o.id}</span>
            <span class="ed-tools"><button data-act="obj-here" data-i="${i}" title="Move to the drone">⌖</button><button data-act="obj-up" data-i="${i}">↑</button><button data-act="obj-down" data-i="${i}">↓</button><button data-act="obj-del" data-i="${i}">✕</button></span></div>
          <div class="ed-grid">${fields}</div></div>`;
      })
      .join('');

    const drafts = this.drafts.list();
    this.root.innerHTML = `
      <header class="ed-head">
        <h1>Lesson editor</h1>
        <button data-act="exit">✕</button>
      </header>
      <div class="ed-files">
        <select data-pick>${drafts.map((x) => `<option value="${esc(x.lesson.id)}" ${x.lesson.id === this.savedId ? 'selected' : ''}>${esc(x.lesson.title)}</option>`).join('') || '<option>(unsaved)</option>'}</select>
        <button data-act="open">Open</button><button data-act="new">New</button>
        <button data-act="import">Import</button><button data-act="export">Export</button><button data-act="delete">Delete</button>
        <input type="file" accept=".json,application/json" data-file hidden />
      </div>
      ${this.notice ? `<div class="ed-notice">${esc(this.notice)}</div>` : ''}
      <p class="ed-tip">Fly to a spot, then use the buttons to place things there. WASD / arrows fly; typing in a field does not.</p>

      <section><h2>Lesson</h2>
        <label>Title<input data-bind="lesson.title" data-autoid value="${esc(l.title)}" maxlength="60" /></label>
        <label>Id<input data-bind="lesson.id" value="${esc(l.id)}" maxlength="64" /></label>
        <label>Summary<input data-bind="lesson.summary" value="${esc(l.summary)}" maxlength="140" /></label>
        <label>Icon<select data-bind="lesson.icon">${options(ICONS, l.icon)}</select></label>
        <div class="ed-row">Spawn: ${l.spawn.position.join(', ')} · ${l.spawn.yaw}°
          <button data-act="spawn">Set spawn here</button></div>
      </section>

      <section><h2>Briefing steps</h2>${steps}<button data-act="add-step">+ Step</button></section>

      <section><h2>Practice</h2>
        <label>Instruction<textarea rows="2" data-bind="lesson.practice.instruction" maxlength="200">${esc(l.practice.instruction)}</textarea></label>
        ${objs}
        <div class="ed-row"><button data-act="gate">+ Gate ahead of the drone</button><button data-act="pad">+ Pad under the drone</button></div>
      </section>

      <div data-status></div>
      <footer class="ed-foot">
        <button class="mn-btn primary" data-act="test"><span class="mn-label">▶ Test lesson</span></button>
        ${
          this.canPublish
            ? `<button class="mn-btn" data-act="publish" ${this.publishing ? 'disabled' : ''}>
                <span class="mn-label">⇪ Publish to players</span></button>`
            : '<p class="ed-tip">Publishing to all players is for authors (a signed-in account with the author role).</p>'
        }
      </footer>`;

    this.root.querySelector<HTMLInputElement>('[data-file]')!.addEventListener('change', (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) void this.importFile(f);
    });
    this.renderStatus();
  }
}
