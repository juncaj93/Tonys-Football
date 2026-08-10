import { describe, expect, it } from 'vitest';

import { decodeDraftPicks, decodeDrafts } from './codec';
import { importDraft } from './draft';
import { endpointKey, endpointPath, seasonEndpoints } from './endpoints';
import { createFixtureSource } from './fixtures';
import { type SleeperSource } from './transport';

/**
 * The draft adapter, against the recorded payloads.
 *
 * ## Why the recorded ones and not a hand-written shape
 *
 * The 2025 draft is on disk — 160 real picks — and the two things this decoder
 * has to get right are both properties of *real* data rather than of a shape
 * somebody typed:
 *
 *   - a **defense** arrives as `first_name: "Denver", last_name: "Broncos"` with
 *     `player_id: "DEN"`, which is a person-shaped record for a thing that is not
 *     a person;
 *   - a **name** is not two clean words. `Ja'Marr Chase`, `Amon-Ra St. Brown`,
 *     `A.J. Brown` and `Jaxon Smith-Njigba` are all in there, and every one of
 *     them is a case the Slice's name scanner gets wrong if it is handed only
 *     the whole string.
 *
 * A hand-written fixture would have had two clean words in it and would have
 * proved nothing about either.
 */

const LEAGUE_2025 = '1240008879295713280';
const LEAGUE_2026 = '1385016656425668608';

/** A source that fails every request, for the outage path. */
const DEAD: SleeperSource = {
  label: 'dead',
  fetch: () => Promise.reject(new Error('socket hang up')),
};

describe('the draft endpoints', () => {
  it('addresses the draft list by league and the picks by draft', () => {
    expect(endpointPath({ kind: 'drafts', leagueId: 'L' })).toBe('/league/L/drafts');
    expect(endpointPath({ kind: 'draft_picks', draftId: 'D' })).toBe('/draft/D/picks');
  });

  it('keys them to distinct fixture paths', () => {
    expect(endpointKey({ kind: 'drafts', leagueId: 'L' })).toBe('league/L/drafts');
    expect(endpointKey({ kind: 'draft_picks', draftId: 'D' })).toBe('draft/D/picks');
  });

  it('lists the draft with a season and the picks without one', () => {
    /*
     * The picks need an id no league payload carries, so they cannot be part of
     * *"every endpoint reachable from a league id"*. The recorder discovers them
     * in a second pass, and this pins the asymmetry rather than leaving it to be
     * rediscovered.
     */
    const kinds = seasonEndpoints('L').map((endpoint) => endpoint.kind);
    expect(kinds).toContain('drafts');
    expect(kinds).not.toContain('draft_picks');
  });
});

describe('decoding a draft', () => {
  it('reads the recorded 2025 draft', async () => {
    const source = createFixtureSource();
    const result = await source.fetch({ kind: 'drafts', leagueId: LEAGUE_2025 });
    if (result.kind !== 'ok') throw new Error('the 2025 draft fixture is missing');

    const { value } = decodeDrafts(result.payload);
    expect(value).toHaveLength(1);
    expect(value[0]?.status).toBe('complete');
    expect(value[0]?.type).toBe('snake');
    expect(value[0]?.rounds).toBe(16);
    expect(value[0]?.lastPickedMs).not.toBeNull();
  });

  it('reads every pick, and the player inside it', async () => {
    const source = createFixtureSource();
    const drafts = await source.fetch({ kind: 'drafts', leagueId: LEAGUE_2025 });
    if (drafts.kind !== 'ok') throw new Error('the 2025 draft fixture is missing');
    const draftId = decodeDrafts(drafts.payload).value[0]!.draftId;

    const picks = await source.fetch({ kind: 'draft_picks', draftId });
    if (picks.kind !== 'ok') throw new Error('the 2025 picks fixture is missing');

    const { value } = decodeDraftPicks(picks.payload);
    expect(value).toHaveLength(160);
    expect(value[0]?.pickNo).toBe(1);
    expect(value[0]?.playerName).toBe("Ja'Marr Chase");
    expect(value[0]?.position).toBe('WR');

    /* A defense is a team, and the same first/last join produces its name. */
    const defense = value.find((pick) => pick.position === 'DEF');
    expect(defense?.playerName).toMatch(/^[A-Z]/);
    expect(defense?.playerName.split(' ').length).toBeGreaterThan(1);

    /* No kickers. The league has none, and the CHECK in `0018` says so too. */
    expect(value.some((pick) => pick.position === 'K')).toBe(false);

    /* Every pick names somebody. A pick the paper cannot name is dropped. */
    for (const pick of value) expect(pick.playerName.length).toBeGreaterThan(0);
  });

  it('drops a pick with no player rather than inventing one', () => {
    const { value, warnings } = decodeDraftPicks([
      { draft_id: 'D', pick_no: 1, round: 1, metadata: {} },
      {
        draft_id: 'D',
        pick_no: 2,
        round: 1,
        metadata: { first_name: 'Real', last_name: 'Person', position: 'WR' },
      },
    ]);

    expect(value).toHaveLength(1);
    expect(value[0]?.playerName).toBe('Real Person');
    expect(warnings.join(' ')).toContain('names no player');
  });

  it('reads a kept player as kept', () => {
    const { value } = decodeDraftPicks([
      {
        draft_id: 'D',
        pick_no: 1,
        round: 1,
        is_keeper: true,
        metadata: { first_name: 'Kept', last_name: 'Player' },
      },
    ]);
    expect(value[0]?.isKeeper).toBe(true);
  });
});

describe('importing a draft', () => {
  it('returns the completed draft and its picks', async () => {
    const result = await importDraft(createFixtureSource(), LEAGUE_2025);

    expect(result.refusal).toBeNull();
    expect(result.status).toBe('complete');
    expect(result.draft?.picks).toHaveLength(160);
  });

  it('refuses a league that has not finished drafting, and says which state it is in', async () => {
    /*
     * The 2026 recording is the real thing: the league had not drafted when the
     * fixtures were taken, so Sleeper reports `pre_draft` and the picks endpoint
     * is empty. That is the ordinary state in August and the one the draft board
     * has to be able to explain.
     */
    const result = await importDraft(createFixtureSource(), LEAGUE_2026);

    expect(result.draft).toBeNull();
    expect(result.refusal).toBe('not-complete');
    expect(result.status).toBe('pre_draft');
  });

  it('never fetches picks for a draft that has not finished', async () => {
    const asked: string[] = [];
    const fixtures = createFixtureSource();
    const watched: SleeperSource = {
      label: 'watched',
      fetch: (endpoint) => {
        asked.push(endpoint.kind);
        return fixtures.fetch(endpoint);
      },
    };

    await importDraft(watched, LEAGUE_2026);
    expect(asked).toEqual(['drafts']);
  });

  it('turns an outage into a refusal rather than a throw', async () => {
    /*
     * A Tuesday morning outage must not cost the league everything else the job
     * does. `runTuesday` records a refusal and carries on; a thrown error would
     * land in `failed`, turn the cron into a 500, and take the paper with it.
     */
    const result = await importDraft(DEAD, LEAGUE_2025);
    expect(result.refusal).toBe('unreachable');
    expect(result.warnings.join(' ')).toContain('socket hang up');
  });
});
