/**
 * Sleeper transport.
 *
 * Everything above this file talks to a {@link SleeperSource} and never to the
 * network. There are two implementations — live HTTP here, and recorded
 * fixtures in `fixtures.ts` — and the layers above cannot tell them apart.
 * That symmetry is what makes the replay harness required by `16 §13 P1` and
 * `10 §13` possible, and it is why the whole test suite runs offline.
 *
 * Three behaviours are deliberate:
 *
 *   - **404 is not an error.** Sleeper returns 404 (and sometimes `null`) for
 *     "no transactions that week", which is an ordinary fact about a quiet
 *     week, not a failure. It decodes to `empty`. Treating it as an error
 *     would make every quiet week look like an outage.
 *
 *   - **Nothing throws.** Every call returns a result value. `16 §15` lists
 *     "Sleeper API undocumented, no SLA" as a standing risk, and `15 §5`
 *     requires that provider failures preserve prior valid data. Code that
 *     must decide whether to keep existing rows cannot be doing so from a
 *     catch block.
 *
 *   - **Retries are bounded and only for faults that retrying can fix.**
 *     5xx, 429, and network errors retry with backoff. 4xx does not — a 400 is
 *     a bug in our request and retrying it three times just makes it slower.
 */
import { now } from '@/lib/clock';

import { describeEndpoint, endpointPath, SLEEPER_API_BASE, type SleeperEndpoint } from './endpoints';

export type SleeperFetchResult =
  | {
      readonly kind: 'ok';
      readonly endpoint: SleeperEndpoint;
      readonly payload: unknown;
      readonly status: number;
      readonly fetchedAt: Date;
    }
  | {
      readonly kind: 'empty';
      readonly endpoint: SleeperEndpoint;
      readonly status: number;
      readonly fetchedAt: Date;
    }
  | {
      readonly kind: 'error';
      readonly endpoint: SleeperEndpoint;
      /** Null when the request never produced a response. */
      readonly status: number | null;
      readonly message: string;
      readonly attempts: number;
      readonly fetchedAt: Date;
    };

/**
 * A source of Sleeper payloads.
 *
 * Implemented by {@link createLiveSource} and by `createFixtureSource`.
 */
export interface SleeperSource {
  /** Identifies the source in logs and failure messages. */
  readonly label: string;
  fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult>;
}

export interface LiveSourceOptions {
  readonly baseUrl?: string;
  /** Total attempts, including the first. */
  readonly maxAttempts?: number;
  /** Per-attempt timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** First backoff delay; doubles each retry. */
  readonly backoffBaseMs?: number;
  /** Injectable for tests, so a retry test does not actually wait. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests. */
  readonly fetchImpl?: typeof fetch;
}

const DEFAULTS = {
  maxAttempts: 3,
  timeoutMs: 10_000,
  backoffBaseMs: 250,
} as const;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Retrying a 4xx cannot fix it; retrying 429, 5xx, or a dropped socket can. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Sleeper publishes no rate limit but is informally understood to tolerate
 * roughly 1000 calls per minute. A full two-season recording is under 80
 * calls, so a small fixed gap between requests keeps us far below any
 * plausible ceiling without meaningfully slowing the recorder.
 */
const REQUEST_GAP_MS = 60;

export function createLiveSource(options: LiveSourceOptions = {}): SleeperSource {
  const baseUrl = options.baseUrl ?? SLEEPER_API_BASE;
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const backoffBaseMs = options.backoffBaseMs ?? DEFAULTS.backoffBaseMs;
  const sleep = options.sleep ?? defaultSleep;
  const fetchImpl = options.fetchImpl ?? fetch;

  // Requests are serialized through this chain: one call in flight at a time,
  // with a courtesy gap. Ten managers and two cron jobs never need more, and
  // it removes any chance of a burst looking like abuse.
  let queue: Promise<unknown> = Promise.resolve();

  async function attempt(
    endpoint: SleeperEndpoint,
  ): Promise<{ status: number; payload: unknown } | { status: number | null; error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(`${baseUrl}${endpointPath(endpoint)}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        return { status: response.status, error: `HTTP ${String(response.status)}` };
      }

      const text = await response.text();
      if (text.trim() === '') {
        // An empty body is Sleeper's other way of saying "nothing here".
        return { status: response.status, payload: null };
      }

      try {
        return { status: response.status, payload: JSON.parse(text) as unknown };
      } catch {
        return { status: response.status, error: 'response body was not valid JSON' };
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${String(timeoutMs)}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      return { status: null, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
    let lastStatus: number | null = null;
    let lastMessage = 'no attempt was made';

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      const outcome = await attempt(endpoint);

      if (!('error' in outcome)) {
        // Sleeper answers a nonexistent week with `null` or `[]` rather than
        // an error, so both mean the same thing: nothing happened.
        const isEmpty =
          outcome.payload === null ||
          (Array.isArray(outcome.payload) && outcome.payload.length === 0);

        return isEmpty
          ? { kind: 'empty', endpoint, status: outcome.status, fetchedAt: now() }
          : {
              kind: 'ok',
              endpoint,
              payload: outcome.payload,
              status: outcome.status,
              fetchedAt: now(),
            };
      }

      lastStatus = outcome.status;
      lastMessage = outcome.error;

      // A 404 is a definitive "there is nothing here", not a fault.
      if (outcome.status === 404) {
        return { kind: 'empty', endpoint, status: 404, fetchedAt: now() };
      }

      const retryable = outcome.status === null || isRetryableStatus(outcome.status);
      if (!retryable || attemptNumber === maxAttempts) break;

      await sleep(backoffBaseMs * 2 ** (attemptNumber - 1));
    }

    return {
      kind: 'error',
      endpoint,
      status: lastStatus,
      message: `${describeEndpoint(endpoint)} failed: ${lastMessage}`,
      attempts: maxAttempts,
      fetchedAt: now(),
    };
  }

  return {
    label: `live(${baseUrl})`,
    fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
      const next = queue.then(async () => {
        const result = await run(endpoint);
        await sleep(REQUEST_GAP_MS);
        return result;
      });
      // Keep the chain alive even if one call rejects unexpectedly.
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
