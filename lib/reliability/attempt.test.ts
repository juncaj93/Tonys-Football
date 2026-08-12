import { describe, expect, it } from 'vitest';

import { attempt, UNREACHABLE_LINE } from './attempt';

/**
 * The two things this helper must get right, and one it must not get wrong.
 *
 * The failure it exists for is a rejected promise; the failure it could *cause*
 * is swallowing Next's redirect, which is the recovery path for an expired or
 * revoked session. Both are pinned here, because the second one would be silent:
 * a manager whose session had gone would see *"that didn't reach Tony"* on a
 * screen that could never work again, and no gate would go red.
 */
describe('attempt', () => {
  it('passes a successful answer through untouched', async () => {
    const outcome = await attempt(() => Promise.resolve({ ok: false, reason: 'insufficient' }));

    expect(outcome.ok).toBe(true);
    // A server that answered "no" is a success at this layer: it was reached.
    expect(outcome.ok && outcome.value).toEqual({ ok: false, reason: 'insufficient' });
  });

  it('turns a dropped request into an answer instead of a throw', async () => {
    const outcome = await attempt(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(outcome).toEqual({ ok: false, unreachable: true });
  });

  it('turns a server exception into an answer instead of a throw', async () => {
    // What Next hands a client when a server action 500s.
    const outcome = await attempt(() =>
      Promise.reject(new Error('An unexpected response was received from the server.')),
    );

    expect(outcome).toEqual({ ok: false, unreachable: true });
  });

  /**
   * `requireUser()` redirects an expired session to the door by throwing. If that
   * were caught here, the sign-in prompt would be replaced by an error line on a
   * page that will never work again.
   */
  it('re-throws a redirect so an expired session still reaches the door', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/door;307;',
    });

    await expect(attempt(() => Promise.reject(redirect))).rejects.toBe(redirect);
  });

  it('re-throws a not-found so an admin probe still 404s', async () => {
    const missing = Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
    const fallback = Object.assign(new Error('fallback'), {
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });

    await expect(attempt(() => Promise.reject(missing))).rejects.toBe(missing);
    await expect(attempt(() => Promise.reject(fallback))).rejects.toBe(fallback);
  });

  /**
   * A production server error carries a `digest` too — a hex hash. Treating mere
   * presence as control flow would re-throw exactly the case this module exists
   * to absorb, so the prefixes are what is matched.
   */
  it('does not mistake a production error digest for control flow', async () => {
    const boom = Object.assign(new Error('boom'), { digest: '1891557172' });

    await expect(attempt(() => Promise.reject(boom))).resolves.toEqual({
      ok: false,
      unreachable: true,
    });
  });

  it('is not confused by a thrown non-object', async () => {
    await expect(attempt(() => Promise.reject('nope'))).resolves.toEqual({
      ok: false,
      unreachable: true,
    });
  });

  /** The sentence names the gesture that fixes it. */
  it('offers one line, and it says what to do', () => {
    expect(UNREACHABLE_LINE).toMatch(/try it again/i);
  });
});
