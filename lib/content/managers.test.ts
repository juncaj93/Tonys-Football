import { describe, expect, it } from 'vitest';

import { RosterParseError, parseManagerNames, readManagerNames } from './managers';

/**
 * The names Tony uses.
 *
 * This is the one place the product says a real person's name out loud, so the
 * failure modes are not cosmetic: greeting somebody by a username they abandoned
 * in 2019, or by somebody else's name, is worse than saying nothing at all.
 */

const FILE = `
# Managers

## The current ten

| Sleeper ID | Sleeper username | Name |
|---|---|---|
| 450049619838103552 | BigJuncer | Alex |
| 993992889480904704 | MattyB2317 | Matty B |

## Former occupants

| Sleeper ID | Sleeper username |
|---|---|
| 690209715904417792 | Anthonyberardo |
`;

describe('the roster file', () => {
  it('reads the names and the accounts they belong to', () => {
    expect(parseManagerNames(FILE)).toEqual([
      { sleeperUserId: '450049619838103552', sleeperUsername: 'BigJuncer', name: 'Alex' },
      { sleeperUserId: '993992889480904704', sleeperUsername: 'MattyB2317', name: 'Matty B' },
    ]);
  });

  /**
   * The former occupants held rosters in 2024 and 2025 and are named nowhere.
   * Reading their table would rename three people to their own usernames and
   * report it as a change on every deploy.
   */
  it('stops at the former occupants', () => {
    expect(parseManagerNames(FILE).map((entry) => entry.sleeperUsername)).not.toContain(
      'Anthonyberardo',
    );
  });

  it('recognises the header row rather than counting past it', () => {
    // A reordered file must not swallow the first manager.
    const reordered = FILE.replace('| Sleeper ID | Sleeper username | Name |', '| Sleeper ID | Sleeper username | Name |');
    expect(parseManagerNames(reordered)).toHaveLength(2);
  });

  it('refuses two managers with the same name', () => {
    const clash = FILE.replace('| Matty B |', '| Alex |');
    expect(() => parseManagerNames(clash)).toThrow(/both called "Alex"/);
  });

  it('refuses one Sleeper account listed twice', () => {
    const twice = FILE.replace('993992889480904704', '450049619838103552');
    expect(() => parseManagerNames(twice)).toThrow(/listed twice/);
  });

  it('refuses an empty name, with the line number', () => {
    const blank = FILE.replace('| Matty B |', '|  |');
    expect(() => parseManagerNames(blank)).toThrow(RosterParseError);
    expect(() => parseManagerNames(blank)).toThrow(/managers\.md:9/);
  });

  it('refuses something that is not a Sleeper ID', () => {
    const bad = FILE.replace('993992889480904704', 'mattyb');
    expect(() => parseManagerNames(bad)).toThrow(/not a Sleeper ID/);
  });

  it('refuses a file with no roster in it', () => {
    expect(() => parseManagerNames('# Managers\n\nnothing here\n')).toThrow(/is missing/);
  });

  describe('the real file', () => {
    const roster = readManagerNames();

    it('names all ten of the current managers', () => {
      expect(roster).toHaveLength(10);
    });

    it('gives each of them a name that is not their username', () => {
      for (const entry of roster) {
        expect(entry.name.toLowerCase(), entry.sleeperUsername).not.toBe(
          entry.sleeperUsername.toLowerCase(),
        );
      }
    });

    it('keeps the commissioner where the environment expects him', () => {
      // `COMMISSIONER_SLEEPER_USER_ID` in production. Renaming him must not
      // detach him from admin, which is granted by Sleeper ID rather than name.
      const commissioner = roster.find((entry) => entry.sleeperUserId === '450049619838103552');
      expect(commissioner?.name).toBe('Alex');
    });
  });
});
