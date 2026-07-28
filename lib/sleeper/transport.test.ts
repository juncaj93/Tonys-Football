import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';

import { createLiveSource } from './transport';

/**
 * Transport behaviour under a provider with no SLA (`16 §15`).
 *
 * Every test injects `fetch` and `sleep`, so nothing here touches the network
 * or spends real time on a backoff.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A source with instant backoff, so retry tests run at full speed. */
function sourceWith(fetchImpl: typeof fetch, options: { maxAttempts?: number } = {}) {
  return createLiveSource({
    fetchImpl,
    sleep: () => Promise.resolve(),
    ...(options.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
  });
}

afterEach(() => {
  clearClock();
});

describe('createLiveSource', () => {
  it('returns a decoded payload on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ league_id: '123' }));
    const result = await sourceWith(fetchImpl as unknown as typeof fetch).fetch({
      kind: 'league',
      leagueId: '123',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.payload).toEqual({ league_id: '123' });
    expect(result.status).toBe(200);
  });

  it('requests the right URL for each endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const source = sourceWith(fetchImpl as unknown as typeof fetch);

    await source.fetch({ kind: 'matchups', leagueId: '99', week: 7 });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.sleeper.app/v1/league/99/matchups/7');
  });

  it('stamps results from the application clock, not wall time', async () => {
    setFixedClock('2026-01-02T03:04:05.000Z');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));

    const result = await sourceWith(fetchImpl as unknown as typeof fetch).fetch({ kind: 'state' });

    expect(result.fetchedAt.toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });

  describe('empty results', () => {
    // Sleeper says "nothing happened that week" in three different ways, and
    // none of them is a failure. A quiet week must not look like an outage.
    it('treats 404 as empty', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
      const result = await sourceWith(fetchImpl as unknown as typeof fetch).fetch({
        kind: 'transactions',
        leagueId: '1',
        week: 14,
      });

      expect(result.kind).toBe('empty');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('treats a null body as empty', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null));
      const result = await sourceWith(fetchImpl as unknown as typeof fetch).fetch({
        kind: 'matchups',
        leagueId: '1',
        week: 18,
      });

      expect(result.kind).toBe('empty');
    });

    it('treats an empty array as empty', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
      const result = await sourceWith(fetchImpl as unknown as typeof fetch).fetch({
        kind: 'transactions',
        leagueId: '1',
        week: 3,
      });

      expect(result.kind).toBe('empty');
    });
  });

  describe('retries', () => {
    it('retries a 500 and succeeds', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 500 }))
        .mockResolvedValueOnce(jsonResponse({ recovered: true }));

      const result = await sourceWith(fetchImpl as unknown as typeof fetch).fetch({
        kind: 'state',
      });

      expect(result.kind).toBe('ok');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('retries a 429', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 429 }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      await sourceWith(fetchImpl as unknown as typeof fetch).fetch({ kind: 'state' });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('retries a network failure', async () => {
      const fetchImpl = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const result = await sourceWith(fetchImpl as unknown as typeof fetch).fetch({
        kind: 'state',
      });

      expect(result.kind).toBe('ok');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    // Retrying a 400 three times just makes the same bug slower.
    it('does NOT retry a 4xx other than 429', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 400 }));

      const result = await sourceWith(fetchImpl as unknown as typeof fetch).fetch({
        kind: 'state',
      });

      expect(result.kind).toBe('error');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('gives up after maxAttempts and reports, rather than throwing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }));

      const result = await sourceWith(fetchImpl as unknown as typeof fetch, {
        maxAttempts: 3,
      }).fetch({ kind: 'league', leagueId: '42' });

      expect(result.kind).toBe('error');
      if (result.kind !== 'error') throw new Error('unreachable');
      expect(result.attempts).toBe(3);
      expect(result.status).toBe(503);
      expect(result.message).toContain('/league/42');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('backs off for longer on each retry', async () => {
      const delays: number[] = [];
      const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 500 }));

      await createLiveSource({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxAttempts: 3,
        backoffBaseMs: 100,
        sleep: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
      }).fetch({ kind: 'state' });

      // Two backoffs between three attempts, doubling; the trailing entry is
      // the courtesy gap between requests.
      expect(delays.slice(0, 2)).toEqual([100, 200]);
    });
  });

  describe('failure modes', () => {
    it('reports a timeout without throwing', async () => {
      const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });

      const result = await createLiveSource({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 5,
        maxAttempts: 1,
        sleep: () => Promise.resolve(),
      }).fetch({ kind: 'state' });

      expect(result.kind).toBe('error');
      if (result.kind !== 'error') throw new Error('unreachable');
      expect(result.message).toContain('timed out');
    });

    it('reports a malformed body without throwing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 200 }));

      const result = await sourceWith(fetchImpl as unknown as typeof fetch, {
        maxAttempts: 1,
      }).fetch({ kind: 'state' });

      expect(result.kind).toBe('error');
      if (result.kind !== 'error') throw new Error('unreachable');
      expect(result.message).toContain('not valid JSON');
    });
  });

  it('serializes requests rather than bursting them', async () => {
    let inFlight = 0;
    let peak = 0;

    const fetchImpl = vi.fn().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return jsonResponse({ ok: true });
    });

    const source = sourceWith(fetchImpl as unknown as typeof fetch);
    await Promise.all([
      source.fetch({ kind: 'matchups', leagueId: '1', week: 1 }),
      source.fetch({ kind: 'matchups', leagueId: '1', week: 2 }),
      source.fetch({ kind: 'matchups', leagueId: '1', week: 3 }),
    ]);

    expect(peak).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
