import { randomBytes } from 'node:crypto';

import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * The 6-digit PIN.
 *
 * `16 §11` raised this from four digits to six: 10,000 combinations against ten
 * publicly-known account names is trivially brute-forced, and the accounts are
 * listed on the door by design.
 *
 * Six digits is still a low-entropy credential — a million combinations is not
 * a password. It is protected by three things together, and none of them is
 * sufficient alone: argon2id makes each guess expensive, the rate limiter in
 * `rate-limit.ts` makes guessing slow, and a private league makes the target
 * uninteresting. The first two are the ones we control.
 *
 * ## Why hash-wasm rather than a native argon2 binding
 *
 * `@node-rs/argon2` is faster. It is also a platform-specific binary that has
 * to resolve correctly in four places — local dev, vitest, GitHub Actions, and
 * Vercel's build and runtime — and a binding that fails to load on the host
 * fails at *deploy* time, which on this project means a round trip through the
 * commissioner's browser to find out. hash-wasm is the same algorithm compiled
 * to WebAssembly: identical behaviour everywhere, no install step, no platform
 * matrix. It costs about 120ms per verification, for ten people logging in
 * roughly once a week.
 */

/** OWASP's second recommended argon2id configuration: 19 MiB, t=2, p=1. */
const PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19_456,
  hashLength: 32,
} as const;

const SALT_BYTES = 16;

export const PIN_LENGTH = 6;

export type PinRejection =
  | 'wrong_length'
  | 'not_digits'
  | 'all_same_digit'
  | 'sequential';

export interface PinValidation {
  readonly ok: boolean;
  readonly reason?: PinRejection;
  /** Shown to the manager. In-world, specific, never scolding (`05 §8.4`). */
  readonly message?: string;
}

/**
 * Reject the handful of PINs that are not really secrets.
 *
 * Deliberately a very short list. Every rule here is friction on the first
 * screen a manager ever sees, so it has to earn its place: `000000` and
 * `123456` are the first two guesses anybody makes, and everything else is
 * left alone. No "must contain a symbol" theatre on a numeric PIN.
 */
export function validatePin(pin: string): PinValidation {
  if (pin.length !== PIN_LENGTH) {
    return {
      ok: false,
      reason: 'wrong_length',
      message: `Tony needs all ${String(PIN_LENGTH)} digits.`,
    };
  }

  if (!/^[0-9]{6}$/.test(pin)) {
    return { ok: false, reason: 'not_digits', message: 'Numbers only.' };
  }

  if (/^(\d)\1{5}$/.test(pin)) {
    return {
      ok: false,
      reason: 'all_same_digit',
      message: 'Six of the same digit. Tony would guess that one first.',
    };
  }

  if (isSequential(pin)) {
    return {
      ok: false,
      reason: 'sequential',
      message: 'Straight run. Pick something less obvious.',
    };
  }

  return { ok: true };
}

function isSequential(pin: string): boolean {
  const digits = [...pin].map(Number) as number[];
  const step = (digits[1] ?? 0) - (digits[0] ?? 0);
  if (step !== 1 && step !== -1) return false;
  return digits.every((digit, index) => index === 0 || digit - (digits[index - 1] ?? 0) === step);
}

/** Hash a PIN for storage. Returns the argon2 encoded string, salt included. */
export async function hashPin(pin: string): Promise<string> {
  return argon2id({
    password: pin,
    salt: randomBytes(SALT_BYTES),
    ...PARAMS,
    outputType: 'encoded',
  });
}

/**
 * Check a PIN against a stored hash.
 *
 * Never throws on a malformed stored hash — a corrupted row is a failed login,
 * not a 500 that tells the caller the row is corrupted.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: pin, hash: storedHash });
  } catch {
    return false;
  }
}
