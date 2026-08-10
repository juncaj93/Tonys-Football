import { readFileSync } from 'node:fs';

import { endpointKey, type SleeperEndpoint } from '@/lib/sleeper/endpoints';
import { fixtureFilePath, FIXTURE_ROOT } from '@/lib/sleeper/fixtures';
import { type SleeperSource } from '@/lib/sleeper/transport';

/**
 * A completed draft for a season that has not drafted yet.
 *
 * ## Why this exists at all
 *
 * The preseason issue cannot be demonstrated before the league drafts, and the
 * league drafts in late August. `MANDATE §8` is explicit that a feature is not
 * demo-ready if showing its states needs hand-edited SQL — so the draft board,
 * the editor and the printed issue all need a completed 2026 draft to exist in a
 * demo database, months before one exists in the world.
 *
 * ## It is a real draft, re-seated
 *
 * Not invented picks. The **recorded 2025 draft** — 160 real picks, sixteen real
 * rounds, real player names with the apostrophes and full stops that make a
 * validator's life difficult — with its roster ids re-pointed at this season's
 * seats.
 *
 * That matters for three separate reasons:
 *
 * - the page is photographed with names like `Amon-Ra St. Brown`, which is the
 *   case that breaks a row at 360 and the case the name scanner gets wrong;
 * - the shape is a real snake draft, so `1.01` next to a slot that could not
 *   have made that pick is impossible by construction rather than by care;
 * - it goes through the **real decoder and the real persister**, because it is
 *   served as a Sleeper payload rather than written into the database.
 *
 * ## It can never reach production
 *
 * Only `applyDemoState` calls this, and `assertDemoWritesAllowed` refuses to run
 * at all in production (`lib/demo/guard.ts`). The stored draft is marked with a
 * `demo:` draft id, so a database holding one says so in the row rather than in
 * a comment.
 */

/** The recorded 2025 draft — the one this borrows. */
const SOURCE_DRAFT_ID = '1240008879308288000';

/** What the fixture draft is called once stored. Prefixed, so it is never mistaken for real. */
export const DEMO_DRAFT_ID = 'demo:2026-draft-review';

interface RawPick {
  readonly draft_slot?: number;
  readonly round?: number;
  readonly pick_no?: number;
  readonly player_id?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * A Sleeper source that serves one completed draft and nothing else.
 *
 * `seats` is draft slot → roster id, in slot order: the caller decides which of
 * this season's seats picked where, because roster ids are seasonal and this
 * module has no business querying for them.
 *
 * Every other endpoint answers `empty`, which is what a source that knows about
 * one thing should say about everything else — and it means a caller that
 * reached for a matchup by mistake gets nothing rather than a stale 2025 week.
 */
export function demoDraftSource(seats: readonly number[]): SleeperSource {
  const picks = borrowedPicks(seats);
  const fetchedAt = new Date('2026-08-24T01:31:50.133Z');

  return {
    label: 'demo-draft',
    fetch: (endpoint: SleeperEndpoint) => {
      if (endpoint.kind === 'drafts') {
        return Promise.resolve({
          kind: 'ok' as const,
          endpoint,
          status: 200,
          payload: [
            {
              draft_id: DEMO_DRAFT_ID,
              league_id: endpoint.leagueId,
              status: 'complete',
              type: 'snake',
              season: '2026',
              /*
               * The last pick's moment, which is the draft's real end and the
               * only date the paper prints about it. Fixed, because a demo that
               * moved with the clock would photograph differently every run.
               */
              last_picked: fetchedAt.getTime(),
              start_time: fetchedAt.getTime() - 2 * 60 * 60 * 1000,
              settings: { rounds: 16, teams: seats.length },
            },
          ],
          fetchedAt,
        });
      }

      if (endpoint.kind === 'draft_picks' && endpoint.draftId === DEMO_DRAFT_ID) {
        return Promise.resolve({
          kind: 'ok' as const,
          endpoint,
          status: 200,
          payload: picks,
          fetchedAt,
        });
      }

      return Promise.resolve({ kind: 'empty' as const, endpoint, status: 404, fetchedAt });
    },
  };
}

/**
 * The recorded 2025 picks, re-seated onto this season's rosters.
 *
 * The slot each pick was made from is kept exactly as recorded — that is what
 * makes the board a real snake rather than an approximation of one — and only
 * the roster it belongs to is re-pointed. A slot with no seat behind it (a
 * league that has shrunk) drops its picks rather than guessing.
 */
function borrowedPicks(seats: readonly number[]): readonly Record<string, unknown>[] {
  const file = fixtureFilePath(
    FIXTURE_ROOT,
    endpointKey({ kind: 'draft_picks', draftId: SOURCE_DRAFT_ID }),
  );

  const raw = JSON.parse(readFileSync(file, 'utf8')) as readonly RawPick[];

  const out: Record<string, unknown>[] = [];
  for (const pick of raw) {
    const slot = pick.draft_slot;
    if (slot === undefined || slot < 1 || slot > seats.length) continue;

    out.push({
      draft_id: DEMO_DRAFT_ID,
      draft_slot: slot,
      round: pick.round,
      pick_no: pick.pick_no,
      roster_id: seats[slot - 1],
      player_id: pick.player_id,
      metadata: pick.metadata,
      is_keeper: null,
    });
  }

  return out;
}
