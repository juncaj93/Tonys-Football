import { derivePairings } from './chain';
import { decodeMatchups } from './codec';
import { endpointKey } from './endpoints';
import { type SleeperSource } from './transport';
import { SleeperDecodeError } from './types';

/**
 * Who plays whom, before anybody has played.
 *
 * ## Why this exists beside a sync that deliberately refuses the same payload
 *
 * `lib/sleeper/weekly.ts` drops a pairing that is 0–0 on both sides, at the
 * single write boundary, because Sleeper publishes the **whole season's
 * schedule the moment a league drafts** and storing that would finalize a week
 * nobody played (`docs/IN_SEASON_SYNC_BOUNDARY.md`). That guard is right and is
 * not weakened here.
 *
 * What it drops is the **result**. The *pairing* — Alex plays Nick in week one —
 * is real the moment the schedule exists, and it is the one thing a season
 * preview wants that the database cannot supply, precisely because of that
 * guard.
 *
 * So this reads the pairing and nothing else. It has no points on it, it writes
 * nothing, and the only place its output ever lands is inside a **rendered
 * edition** — a snapshot of what was true at press time, which is what every
 * other published sentence in this product is.
 *
 * ## It is never called from a render path
 *
 * A page that fetched Sleeper to draw itself would put an undocumented API with
 * no SLA in front of a manager's screen. The caller is the Tuesday job or the
 * commissioner's *"prepare the draft review"* button — both of them already
 * hold a source, both are allowed to take seconds, and both produce a snapshot
 * rather than a live view.
 */

/** One scheduled game. Roster ids: the seat, not the person (`16 §4`). */
export interface SchedulePairing {
  readonly matchupId: number;
  readonly rosterAId: number;
  readonly rosterBId: number;
}

/**
 * Read one week's fixtures.
 *
 * Returns an empty list rather than throwing on every failure mode there is — a
 * league that has not drafted, an unreachable API, a payload that will not
 * decode. A preview section is worth having and is not worth failing a Tuesday
 * for, and *"the schedule is not out yet"* is the ordinary state in August.
 */
export async function readSchedule(
  source: SleeperSource,
  input: { readonly leagueId: string; readonly week: number },
): Promise<readonly SchedulePairing[]> {
  const endpoint = { kind: 'matchups', leagueId: input.leagueId, week: input.week } as const;
  const result = await source.fetch(endpoint);
  if (result.kind !== 'ok') return [];

  try {
    const entries = decodeMatchups(result.payload, endpointKey(endpoint)).value;
    /*
     * `derivePairings` is the *same* function the historical import and the
     * weekly sync use to turn Sleeper's two opposing rows into one game. A
     * second implementation here would be a second thing to keep correct, and
     * the place it drifted would be the place the schedule disagreed with the
     * results that later replaced it.
     */
    return derivePairings(entries).pairings.map((pairing) => ({
      matchupId: pairing.matchupId,
      rosterAId: pairing.rosterAId,
      rosterBId: pairing.rosterBId,
    }));
  } catch (error: unknown) {
    if (error instanceof SleeperDecodeError) return [];
    throw error;
  }
}
