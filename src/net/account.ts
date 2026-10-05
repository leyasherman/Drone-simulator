import type { SupabaseClient } from '@supabase/supabase-js';

/** What the account screen shows. */
export interface AccountState {
  signedIn: boolean;
  anonymous: boolean;
  email: string | null;
  nickname: string;
  xp: number;
}

export const NICKNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
export const MIN_PASSWORD = 6;

/** Plain-language messages for the errors players can hit. */
export function friendlyAuthError(code: string | undefined, message = ''): string {
  switch (code) {
    case 'invalid_credentials':
      return 'Wrong email or password.';
    case 'email_exists':
    case 'user_already_exists':
      return 'There is already an account with this email. Sign in instead.';
    case 'weak_password':
      return `Use a password of at least ${MIN_PASSWORD} characters.`;
    case 'validation_failed':
    case 'email_address_invalid':
      return 'That email address does not look right.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many tries. Wait a minute and try again.';
    case 'bad_nickname':
      return 'Nicknames are 3-20 letters, digits, _ or -.';
    default:
      return message.includes('bad_nickname')
        ? 'Nicknames are 3-20 letters, digits, _ or -.'
        : 'Something went wrong. Check your connection and try again.';
  }
}

/** Checks the form before asking the server. Returns an error message, or null when fine. */
export function checkCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'That email address does not look right.';
  if (password.length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters.`;
  return null;
}

type Result = { ok: true } | { ok: false; error: string };

/**
 * Account actions on top of Supabase Auth. Anonymous players can turn their account into a permanent one
 * (same user id, so progress stays), sign in to an existing one, or sign out.
 */
export class Account {
  state: AccountState = { signedIn: false, anonymous: true, email: null, nickname: '', xp: 0 };

  constructor(private readonly client: SupabaseClient) {}

  async refresh(): Promise<AccountState> {
    const { data } = await this.client.auth.getUser();
    const user = data.user;
    if (!user) {
      this.state = { signedIn: false, anonymous: true, email: null, nickname: '', xp: 0 };
      return this.state;
    }
    const profile = await this.client.from('profiles').select('nickname, xp').maybeSingle();
    this.state = {
      signedIn: true,
      anonymous: user.is_anonymous ?? !user.email,
      email: user.email ?? null,
      nickname: (profile.data?.nickname as string | undefined) ?? '',
      xp: (profile.data?.xp as number | undefined) ?? 0,
    };
    return this.state;
  }

  /** Turns the current anonymous account into a permanent one. Progress stays (same user). */
  async createAccount(email: string, password: string): Promise<Result> {
    const bad = checkCredentials(email, password);
    if (bad) return { ok: false, error: bad };
    const { error } = await this.client.auth.updateUser({ email: email.trim(), password });
    if (error) return { ok: false, error: friendlyAuthError(error.code, error.message) };
    await this.refresh();
    return { ok: true };
  }

  /** Signs in to an existing account (the anonymous session on this device is left behind). */
  async signIn(email: string, password: string): Promise<Result> {
    const bad = checkCredentials(email, password);
    if (bad) return { ok: false, error: bad };
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: friendlyAuthError(error.code, error.message) };
    await this.refresh();
    return { ok: true };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
    await this.refresh();
  }

  async setNickname(nickname: string): Promise<Result> {
    const nick = nickname.trim();
    if (!NICKNAME_RE.test(nick)) return { ok: false, error: friendlyAuthError('bad_nickname') };
    const { error } = await this.client.rpc('set_nickname', { p_nickname: nick });
    if (error) return { ok: false, error: friendlyAuthError(error.code, error.message) };
    this.state.nickname = nick;
    return { ok: true };
  }
}
