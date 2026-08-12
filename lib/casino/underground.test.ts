import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EARNED_TOKEN_REASONS,
  UNEARNED_TOKEN_REASONS,
  countsAsEarned,
  type LiveTokenReason,
} from '@/lib/counter/tokens';
import { FEATURE_KEYS, featureFlags } from '@/lib/flags';

import { COVERED_LINES, UNDERGROUND, UNDERGROUND_OBJECTS, undergroundObject } from './objects';
import { SYMBOLS } from './slots-model';
import { SHIPPED_TABLE, reelSpan, resolve, symbolFor, tableVersion } from './table';

/**
 * The Underground as a room, and the rules that hold whether or not it is open.
 *
 * Nothing here needs a database. The geometry, the resolver, the flags and R12's
 * allowlist are all decidable from source, and the ones that are decidable from
 * source should never be left to a screenshot.
 */

describe('the room', () => {
  it('holds four objects and no fifth', () => {
    expect(UNDERGROUND_OBJECTS.map((o) => o.id).sort()).toEqual([
      'blackjack',
      'desk',
      'return',
      'slots',
    ]);
  });

  /**
   * 44 CSS px on the narrowest supported phone.
   *
   * 360px across a 320-unit room is 1.125 px per unit, so the floor is 39.1
   * units. `MANDATE §6` and WCAG 2.5.8; the same check every other room in this
   * product carries, and the reason none of them has a target you have to aim at.
   */
  it('gives every object a thumb-sized target at 360px', () => {
    const unitsPerPx = UNDERGROUND.width / 360;
    const floor = 44 * unitsPerPx;
    for (const object of UNDERGROUND_OBJECTS) {
      const [, , width, height] = object.rect;
      expect(width, `${object.id} width`).toBeGreaterThanOrEqual(floor);
      expect(height, `${object.id} height`).toBeGreaterThanOrEqual(floor);
    }
  });

  it('never lets two objects overlap', () => {
    for (const a of UNDERGROUND_OBJECTS) {
      for (const b of UNDERGROUND_OBJECTS) {
        if (a.id === b.id) continue;
        const [ax, ay, aw, ah] = a.rect;
        const [bx, by, bw, bh] = b.rect;
        const apart = ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });

  it('keeps every object inside the room', () => {
    for (const object of UNDERGROUND_OBJECTS) {
      const [x, y, w, h] = object.rect;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(UNDERGROUND.width);
      expect(y + h).toBeLessThanOrEqual(UNDERGROUND.height);
    }
  });

  it('gives exactly one way out, and it is a door', () => {
    const doors = UNDERGROUND_OBJECTS.filter((o) => o.kind === 'door');
    expect(doors).toHaveLength(1);
    expect(doors[0]?.href).toBe('/back-hall');
  });

  /**
   * `18 §6`: **no countdown timers on locked doors.** A machine that opens "in
   * three days" manufactures urgency; a machine that is simply covered does not.
   * Both covered lines say *what* rather than *when*, and neither carries a digit.
   */
  it('never puts a countdown or a date on a covered machine', () => {
    for (const [id, line] of Object.entries(COVERED_LINES)) {
      expect(line, id).not.toMatch(/\d/);
      expect(line.toLowerCase(), id).not.toMatch(/soon|shortly|coming|next week|days?/);
    }
  });

  it('does not give the two machines the same line', () => {
    expect(COVERED_LINES['slots']).not.toBe(COVERED_LINES['blackjack']);
  });

  it('throws on an object that does not exist rather than returning undefined', () => {
    expect(() => undergroundObject('roulette')).toThrow(/no underground object/);
  });
});

describe('the doors stay shut', () => {
  /**
   * The production state, asserted rather than assumed.
   *
   * R11: both games ready before the Underground opens, and blackjack is W2.
   * This is the one assertion that would go red if somebody flipped the flag to
   * see what happened and forgot to flip it back.
   */
  it('ships with the Underground and both machines shut', () => {
    const flags = featureFlags({});
    expect(flags.underground).toBe(false);
    expect(flags.slotMachine).toBe(false);
    expect(flags.blackjackTable).toBe(false);
  });

  it('refuses to open anything in production, whatever the query says', () => {
    const production = { VERCEL_ENV: 'production', DEMO_FIXTURES: '1' };
    const flags = featureFlags(production, 'underground,slotMachine');
    expect(flags.underground).toBe(false);
    expect(flags.slotMachine).toBe(false);
  });

  it('still never opens roulette, by any route', () => {
    expect(FEATURE_KEYS).toContain('roulette');
    expect(featureFlags({ DEMO_FIXTURES: '1' }, 'roulette').roulette).toBe(false);
  });
});

describe('the resolver', () => {
  it('covers the whole roll space and nothing outside it', () => {
    const span = reelSpan(SHIPPED_TABLE);
    expect(span).toBe(100);

    const seen = new Set<string>();
    for (let roll = 0; roll < span; roll += 1) seen.add(symbolFor(roll, SHIPPED_TABLE));
    expect([...seen].sort()).toEqual([...SYMBOLS].sort());

    expect(() => symbolFor(span, SHIPPED_TABLE)).toThrow(RangeError);
    expect(() => symbolFor(-1, SHIPPED_TABLE)).toThrow(RangeError);
  });

  it('gives each symbol exactly its strip weight in rolls', () => {
    const counts = new Map<string, number>();
    for (let roll = 0; roll < reelSpan(SHIPPED_TABLE); roll += 1) {
      const symbol = symbolFor(roll, SHIPPED_TABLE);
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
    for (const symbol of SYMBOLS) {
      expect(counts.get(symbol), symbol).toBe(SHIPPED_TABLE.strip[symbol]);
    }
  });

  it('pays three of a kind, exactly two, and nothing else', () => {
    expect(resolve(['tony', 'tony', 'tony']).multiplier).toBe(20);
    expect(resolve(['tony', 'tony', 'crust']).multiplier).toBe(SHIPPED_TABLE.pair.tony);
    expect(resolve(['tony', 'crust', 'tony']).multiplier).toBe(SHIPPED_TABLE.pair.tony);
    expect(resolve(['crust', 'tony', 'tony']).multiplier).toBe(SHIPPED_TABLE.pair.tony);
    expect(resolve(['crust', 'pepperoni', 'mushroom']).multiplier).toBe(0);
    expect(resolve(['crust', 'pepperoni', 'mushroom']).line).toBe('nothing');
  });

  /**
   * The content hash is what makes a stored version mean something. Two
   * environments seeding the same numbers must agree, and any change to the
   * numbers must produce a different version — otherwise a re-tune would
   * retroactively reinterpret every spin already recorded.
   */
  it('hashes the configuration, and moves when any number moves', () => {
    const base = tableVersion(SHIPPED_TABLE);
    expect(base).toBe(tableVersion(SHIPPED_TABLE));
    expect(base).toHaveLength(16);

    expect(
      tableVersion({ ...SHIPPED_TABLE, triple: { ...SHIPPED_TABLE.triple, tony: 19 } }),
    ).not.toBe(base);
    expect(tableVersion({ ...SHIPPED_TABLE, wagers: [5, 10] })).not.toBe(base);
    expect(tableVersion({ ...SHIPPED_TABLE, capTokens: 800 })).not.toBe(base);
  });
});

describe('the token-leader award (R12)', () => {
  /**
   * The allowlist must be exhaustive over the reasons that exist.
   *
   * This is the assertion that makes the allowlist safe rather than merely
   * present: a new `LiveTokenReason` added without a decision fails here instead
   * of silently counting for nothing — or, worse, being added to the allowlist by
   * reflex. Every reason is either earned or explicitly not, and the *why* lives
   * beside it in `UNEARNED_TOKEN_REASONS`.
   */
  it('classifies every reason the product can write', () => {
    const reasons: readonly LiveTokenReason[] = [
      'SEASON_START',
      'BOX_PURCHASE',
      'COMMISSIONER_ADJUSTMENT',
      'SEASON_AWARD',
      'STAKE_PLACED',
      'STAKE_PAYOUT',
      'MATCHUP_WIN',
      'WEEKLY_HIGH_SCORE',
      'DUPLICATE_SALVAGE',
      'CASINO_WAGER',
      'CASINO_PAYOUT',
    ];

    for (const reason of reasons) {
      const earned = (EARNED_TOKEN_REASONS as readonly string[]).includes(reason);
      const unearned = reason in UNEARNED_TOKEN_REASONS;
      expect(earned !== unearned, `${reason} is neither classified nor excluded`).toBe(true);
    }
  });

  /** R12, stated as the assertion it is. */
  it('never counts a casino payout toward tokens earned', () => {
    expect(countsAsEarned('CASINO_PAYOUT')).toBe(false);
    expect(countsAsEarned('CASINO_WAGER')).toBe(false);
    expect(UNEARNED_TOKEN_REASONS['CASINO_PAYOUT']).toMatch(/R12/);
  });

  /**
   * R12 also says not to redefine non-casino sources without necessity. These
   * are the four that pay a manager for playing football or collecting, and they
   * meant "earned" before the casino existed.
   */
  it('leaves every existing earning source counting exactly as it did', () => {
    expect(countsAsEarned('MATCHUP_WIN')).toBe(true);
    expect(countsAsEarned('WEEKLY_HIGH_SCORE')).toBe(true);
    expect(countsAsEarned('STAKE_PAYOUT')).toBe(true);
    expect(countsAsEarned('DUPLICATE_SALVAGE')).toBe(true);
    expect(countsAsEarned('SEASON_START')).toBe(true);
  });

  it('never counts a spend', () => {
    expect(countsAsEarned('BOX_PURCHASE')).toBe(false);
    expect(countsAsEarned('STAKE_PLACED')).toBe(false);
  });
});

describe('the casino server actions guard themselves', () => {
  /**
   * A server action is a **public endpoint**.
   *
   * It is reachable by anybody who can guess its id, whether or not a page
   * renders a button that calls it — so a shut machine that only hid its UI
   * would still take wagers. Every exported action in both casino files must
   * check `underground` **and** its own game's flag before it touches anything.
   *
   * Asserted by parsing the source rather than by calling the action, because
   * calling it needs a session and a database and this needs to fail on a
   * refactor, not on an environment.
   */
  it.each([
    ['app/actions/casino.ts', 'slotMachine'],
    ['app/actions/blackjack.ts', 'blackjackTable'],
  ])('%s refuses when the flags are shut', (file, gameFlag) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');

    // Every exported action, by name.
    const actions = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThan(0);

    // The guard, once per action. A file-level count is enough: the guard is a
    // single expression and there is no other reason for it to appear.
    const guards = [...source.matchAll(/!flags\.underground \|\| !flags\.\w+/g)];
    expect(guards.length, `${file} guards ${String(guards.length)} of ${String(actions.length)} actions`).toBe(
      actions.length,
    );
    expect(source).toContain(`!flags.${gameFlag}`);
  });
});
