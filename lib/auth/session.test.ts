import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cookieAttributes, SESSION_TTL_SECONDS } from './cookie';
import { deviceLabel, hashToken, mintSession, tokenHashFromCookie } from './session';

const SECRET = 'test-secret-not-a-real-one';

describe('session tokens', () => {
  beforeEach(() => {
    process.env['SESSION_SECRET'] = SECRET;
  });

  afterEach(() => {
    delete process.env['SESSION_SECRET'];
  });

  it('round-trips a freshly minted cookie', () => {
    const { cookieValue, tokenHash } = mintSession();
    expect(tokenHashFromCookie(cookieValue)).toBe(tokenHash);
  });

  it('never puts the stored hash in the cookie', () => {
    // The database holds sha256(token); the cookie holds the token. A leaked
    // backup must not be replayable as a login.
    const { cookieValue, tokenHash } = mintSession();
    expect(cookieValue).not.toContain(tokenHash);
  });

  it('mints a different token every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => mintSession().cookieValue));
    expect(seen.size).toBe(50);
  });

  it('rejects a tampered token', () => {
    const { cookieValue } = mintSession();
    const separator = cookieValue.lastIndexOf('.');
    const forged = `${'a'.repeat(separator)}${cookieValue.slice(separator)}`;
    expect(tokenHashFromCookie(forged)).toBeNull();
  });

  it('rejects a token with no signature at all', () => {
    const { cookieValue } = mintSession();
    const token = cookieValue.slice(0, cookieValue.lastIndexOf('.'));
    expect(tokenHashFromCookie(token)).toBeNull();
    expect(tokenHashFromCookie(`${token}.`)).toBeNull();
  });

  it('rejects nonsense without touching the database', () => {
    expect(tokenHashFromCookie(undefined)).toBeNull();
    expect(tokenHashFromCookie('')).toBeNull();
    expect(tokenHashFromCookie('.....')).toBeNull();
  });

  /**
   * `SESSION_SECRET` differs per environment (`docs/DEPLOYMENT.md`). Preview
   * URLs are public on Hobby, so a cookie minted there must be worthless
   * against production.
   */
  it('rejects a cookie signed with a different environment’s secret', () => {
    const { cookieValue } = mintSession();
    process.env['SESSION_SECRET'] = 'a-different-environment';
    expect(tokenHashFromCookie(cookieValue)).toBeNull();
  });

  it('refuses to run without a secret rather than signing with nothing', () => {
    delete process.env['SESSION_SECRET'];
    expect(() => mintSession()).toThrow(/SESSION_SECRET/);
  });

  it('hashes a token stably', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('the cookie', () => {
  it('is host-only, HTTP-only, lax, and lasts 90 days', () => {
    const attributes = cookieAttributes();

    expect(attributes.httpOnly).toBe(true);
    expect(attributes.sameSite).toBe('lax');
    expect(attributes.path).toBe('/');
    expect(attributes.maxAge).toBe(SESSION_TTL_SECONDS);
    expect(SESSION_TTL_SECONDS).toBe(90 * 24 * 60 * 60);

    // No `domain` key at all. Host-only by omission is what keeps attaching a
    // subdomain later a DNS change rather than a code change (`17 §10`).
    expect('domain' in attributes).toBe(false);
  });
});

describe('device labels', () => {
  it('recognises the phone the league actually uses', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
          '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone · Safari');
  });

  it('does not let Chrome or Edge masquerade as Safari', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like ' +
          'Gecko) Chrome/140.0.0.0 Safari/537.36',
      ),
    ).toBe('Mac · Chrome');

    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      ),
    ).toBe('Windows · Edge');
  });

  it('falls back rather than storing the raw header', () => {
    expect(deviceLabel(null)).toBe('Unknown device');
    expect(deviceLabel('')).toBe('Unknown device');
    expect(deviceLabel('curl/8.5.0')).toBe('Unknown device');
  });
});
