import { describe, expect, it } from 'vitest';
import { checkCredentials, friendlyAuthError, NICKNAME_RE } from '../src/net/account';
import { isTypingTarget } from '../src/input/keyboard';

describe('account form checks', () => {
  it('rejects a bad email and a short password before calling the server', () => {
    expect(checkCredentials('not-an-email', 'longenough')).toMatch(/email/);
    expect(checkCredentials('a@b.co', '123')).toMatch(/6 characters/);
    expect(checkCredentials(' pilot@example.com ', '123456')).toBeNull();
  });

  it('turns Supabase error codes into plain messages', () => {
    expect(friendlyAuthError('invalid_credentials')).toBe('Wrong email or password.');
    expect(friendlyAuthError('email_exists')).toMatch(/already an account/);
    expect(friendlyAuthError('weak_password')).toMatch(/6 characters/);
    expect(friendlyAuthError(undefined, 'bad_nickname')).toMatch(/3-20/);
    expect(friendlyAuthError('something_new')).toMatch(/went wrong/);
  });

  it('nicknames: 3-20 letters, digits, _ or -', () => {
    expect(NICKNAME_RE.test('Leya_FPV')).toBe(true);
    expect(NICKNAME_RE.test('ab')).toBe(false);
    expect(NICKNAME_RE.test('has space')).toBe(false);
    expect(NICKNAME_RE.test('x'.repeat(21))).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('is true for form fields, false otherwise', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'CANVAS', isContentEditable: false } as unknown as EventTarget)).toBe(
      false,
    );
    expect(isTypingTarget(null)).toBe(false);
  });
});
