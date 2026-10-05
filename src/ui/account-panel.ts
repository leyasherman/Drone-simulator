import './account-panel.css';
import { MIN_PASSWORD, type Account } from '../net/account';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type View = 'overview' | 'create' | 'signin';

export interface AccountPanelHandlers {
  done(): void;
  /** After sign-in, sign-out or account creation: progress needs reloading. */
  sessionChanged(): Promise<void>;
  /** After a nickname change or any state change, for the menu chip. */
  updated(): void;
}

/** Account screen: nickname, create an account (keeps progress), sign in, sign out. */
export class AccountPanel {
  private readonly root = document.createElement('div');
  private view: View = 'overview';
  private busy = false;
  private message: { text: string; ok: boolean } | null = null;

  constructor(
    parent: HTMLElement,
    private readonly account: Account,
    private readonly on: AccountPanelHandlers,
  ) {
    this.root.className = 'mn-overlay ac-overlay';
    this.root.hidden = true;
    parent.append(this.root);
    this.root.addEventListener('click', (e) => void this.onClick(e));
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.onSubmit(e.target as HTMLFormElement);
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  async open(): Promise<void> {
    this.view = 'overview';
    this.message = null;
    this.visible = true;
    this.render();
    await this.account.refresh();
    this.render();
  }

  private say(text: string, ok: boolean): void {
    this.message = { text, ok };
  }

  private async run(task: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await task();
    } finally {
      this.busy = false;
      this.render();
      this.on.updated();
    }
  }

  private async onClick(e: Event): Promise<void> {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || this.busy) return;
    const act = el.dataset.act;
    if (act === 'done') this.on.done();
    if (act === 'create' || act === 'signin' || act === 'overview') {
      this.view = act;
      this.message = null;
      this.render();
    }
    if (act === 'signout') {
      await this.run(async () => {
        await this.account.signOut();
        await this.on.sessionChanged();
        await this.account.refresh();
        this.say('Signed out. You are flying as a guest now.', true);
      });
    }
  }

  private async onSubmit(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form);
    const kind = form.dataset.form;
    if (kind === 'nickname') {
      await this.run(async () => {
        const r = await this.account.setNickname(String(data.get('nickname') ?? ''));
        this.say(r.ok ? 'Nickname saved.' : r.error, r.ok);
      });
      return;
    }
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    await this.run(async () => {
      const r =
        kind === 'create'
          ? await this.account.createAccount(email, password)
          : await this.account.signIn(email, password);
      if (!r.ok) {
        this.say(r.error, false);
        return;
      }
      if (kind === 'signin') await this.on.sessionChanged();
      await this.account.refresh();
      this.view = 'overview';
      this.say(kind === 'create' ? 'Account created. Your progress is saved to it.' : 'Signed in.', true);
    });
  }

  private render(): void {
    // Keep what the player typed across re-renders (busy state, error messages)
    const draft = new Map<string, string>();
    for (const el of this.root.querySelectorAll<HTMLInputElement>('input[name]'))
      draft.set(el.name, el.value);
    this.renderHtml();
    for (const el of this.root.querySelectorAll<HTMLInputElement>('input[name]')) {
      const kept = draft.get(el.name);
      // After a failed attempt the password is cleared, as login forms usually do
      const failed = this.message !== null && !this.message.ok && !this.busy;
      if (kept === undefined) continue;
      if (el.name === 'password' && failed) continue;
      // The nickname field shows the saved nickname, except to let the player fix a rejected one
      if (el.name === 'nickname' && !failed) continue;
      el.value = kept;
    }
    const focus = this.root.querySelector<HTMLInputElement>(
      this.message && !this.message.ok ? 'input[name="password"]' : 'input:not([value])',
    );
    if (focus && !this.busy && document.activeElement?.tagName !== 'INPUT') focus.focus();
  }

  private renderHtml(): void {
    const s = this.account.state;
    const dis = this.busy ? 'disabled' : '';
    const msg = this.message
      ? `<div class="ac-msg ${this.message.ok ? 'ok' : 'err'}" role="status">${esc(this.message.text)}</div>`
      : '';

    const credentials = (kind: 'create' | 'signin') => `
      <form class="ac-form" data-form="${kind}">
        <label>Email<input name="email" type="email" autocomplete="email" required ${dis} /></label>
        <label>Password<input name="password" type="password" minlength="${MIN_PASSWORD}" required
          autocomplete="${kind === 'create' ? 'new-password' : 'current-password'}" ${dis} /></label>
        <button class="mn-btn primary" type="submit" ${dis}><span class="mn-label">${
          kind === 'create' ? 'Create account' : 'Sign in'
        }</span><i>↗</i></button>
      </form>
      <button class="ac-link" data-act="overview" ${dis}>← Back</button>`;

    let body: string;
    if (this.view === 'create') {
      body = `<h2>Create an account</h2>
        <p class="ac-note">Keep your progress and XP, and pick up on any device. Your current progress moves over.</p>
        ${credentials('create')}`;
    } else if (this.view === 'signin') {
      body = `<h2>Sign in</h2>
        <p class="ac-note">Sign in to an account you made before. Progress from this guest session is added to it.</p>
        ${credentials('signin')}`;
    } else {
      const who = !s.signedIn
        ? '<p class="ac-note">Offline: progress is kept in this browser only.</p>'
        : s.anonymous
          ? `<p class="ac-note">You are flying as a <b>guest</b>. Progress is saved, but only on this device.</p>`
          : `<p class="ac-note">Signed in as <b>${esc(s.email ?? '')}</b>. Progress is saved to your account.</p>`;
      const actions = !s.signedIn
        ? ''
        : s.anonymous
          ? `<div class="ac-actions">
              <button class="mn-btn primary" data-act="create" ${dis}><span class="mn-label">Create account</span>
                <span class="mn-hint">Keeps your progress</span><i>↗</i></button>
              <button class="mn-btn" data-act="signin" ${dis}><span class="mn-label">I have an account</span><i>↗</i></button>
            </div>`
          : `<div class="ac-actions"><button class="mn-btn" data-act="signout" ${dis}><span class="mn-label">Sign out</span><i>↗</i></button></div>`;
      body = `<h2>Pilot</h2>
        <div class="ac-stats"><div><span>XP</span><b>${s.xp}</b></div><div><span>Status</span><b>${
          !s.signedIn ? 'Offline' : s.anonymous ? 'Guest' : 'Member'
        }</b></div></div>
        ${
          s.signedIn
            ? `<form class="ac-form ac-nick" data-form="nickname">
                <label>Nickname<input name="nickname" value="${esc(s.nickname)}" minlength="3" maxlength="20"
                  pattern="[A-Za-z0-9_\\-]{3,20}" required ${dis} /></label>
                <button class="mn-btn" type="submit" ${dis}><span class="mn-label">Save</span></button>
              </form>`
            : ''
        }
        ${who}${actions}`;
    }

    this.root.innerHTML = `
      <div class="mn-card ac-card">
        <div class="ac-head"><h1>Account</h1><button class="ac-close" data-act="done" ${dis}>Done ✕</button></div>
        ${body}
        ${msg}
        ${this.busy ? '<div class="ac-busy">Working…</div>' : ''}
      </div>`;
  }
}
