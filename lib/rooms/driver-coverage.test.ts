import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROOM_OBJECTS, SLOTS } from './objects';
import { THEMES } from './themes';

/**
 * The visual driver photographs every basement state, checks each one is the
 * room it claims to be, and can reach nothing it has not declared.
 *
 * The reasoning is `lib/slice/driver-coverage.test.ts`'s and it is written a
 * fourth time rather than generalised, for the reason the second one gives: the
 * catalogs are read out of the driver by different patterns and a shared helper
 * would have to know all of them.
 *
 * **Never photographed is the quiet failure.** It fails no gate, appears in no
 * report, and the first person to notice is whoever eventually looks for a
 * screenshot nobody took. This repository has shipped that shape three times,
 * and a basement is unusually exposed to it: eight of the ten managers will have
 * an empty one, so the states that look *most* like nothing is wrong are the
 * states most worth looking at.
 */

const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

/** Every `room*` entry in the driver's `ALL_STATES` list. */
function driverRoomStates(): readonly string[] {
  const list = /const ALL_STATES: readonly StateName\[\] = \[([\s\S]*?)\n\];/.exec(DRIVER);
  if (list === null) throw new Error('could not find ALL_STATES in scripts/visual-qa.mts');
  return [...list[1]!.matchAll(/'(room(?:-[a-z]+)*)'/g)].map((match) => match[1]!);
}

describe('the visual driver and the basement agree', () => {
  it('photographs the eight states the room can be in', () => {
    /*
     * Each one means something different, and the list is short because a state
     * that differs only in which collectible landed where is a second file with
     * one meaning.
     */
    expect([...driverRoomStates()].sort()).toEqual([
      'room',
      'room-cold',
      'room-corridor',
      'room-empty',
      'room-furnished',
      'room-rec',
      'room-slot',
      'room-visited',
    ]);
  });

  it('declares a case for each of them', () => {
    // A state in `ALL_STATES` with no `case` photographs whatever page was
    // already open. `reach()` throws for that at runtime; this catches it before
    // a nine-minute workflow does.
    for (const state of driverRoomStates()) {
      expect(DRIVER, `no case for ${state}`).toContain(`case '${state}'`);
    }
  });

  it('gives every state an expectation, so none is merely reached', () => {
    const table = /const ROOM_STATES: [\s\S]*?\n> = \{([\s\S]*?)\n\};/.exec(DRIVER);
    expect(table, 'could not find ROOM_STATES in scripts/visual-qa.mts').not.toBeNull();

    const declared = new Set(
      [...table![1]!.matchAll(/^\s*'?(room(?:-[a-z]+)*)'?:/gm)].map((match) => match[1]!),
    );

    for (const state of driverRoomStates()) {
      expect(declared.has(state), `${state} is photographed but never checked`).toBe(true);
    }
  });

  it('photographs every theme, so none ships unseen', () => {
    /*
     * Three themes and three states that pin one each — `room`/`room-furnished`
     * pin the storeroom, `room-rec` the rec room, `room-cold` the cold store.
     * A fourth theme added without a state would be a room nobody has ever
     * looked at, which is the whole failure mode this file exists for.
     */
    const table = /const ROOM_STATES: [\s\S]*?\n> = \{([\s\S]*?)\n\};/.exec(DRIVER);
    const pinned = new Set(
      [...table![1]!.matchAll(/theme: '([a-z_]+)'/g)].map((match) => match[1]!),
    );

    for (const theme of THEMES) {
      expect(pinned.has(theme), `no state photographs the ${theme}`).toBe(true);
    }
  });

  it('asserts the whole object map rather than counting anchors', () => {
    /*
     * The gate has to name all eight, in both the owner's room and a visited
     * one. A count would pass an object quietly becoming a different object,
     * and a visited room that dropped one would be a different room wearing the
     * same geometry — which is the entire claim `/rooms/<manager>` makes.
     */
    for (const object of ROOM_OBJECTS) {
      expect(DRIVER, `checkRoom never names ${object.id}`).toContain(`'${object.id}'`);
    }
  });

  it('drives the four places through the product’s own controls', () => {
    /*
     * `furnishRoom` presses `placeInSlotAction`, `clearSlotAction` and
     * `setThemeAction`. That matters more than it looks: **every character Save
     * returned a 500 for two months behind three green gates**, because no gate
     * had ever invoked a server action. A screenshot of a room is not a test of
     * the room.
     */
    for (const slot of SLOTS) {
      expect(DRIVER, `the driver never touches ${slot}`).toContain(`'${slot}'`);
    }
    expect(DRIVER).toContain('furnishRoom');
  });

  it('checks a visited room offers nothing that writes', () => {
    // The authorization is the absence of an operation, and the way it would be
    // lost is a control appearing on that page — so it is read out of the
    // rendered DOM rather than inferred from an import.
    expect(DRIVER).toMatch(/would change somebody else's room/);
  });
});
