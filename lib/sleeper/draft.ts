/**
 * The draft, read from Sleeper.
 *
 * ## Why this is a separate module from `chain.ts`
 *
 * `chain.ts` imports a *season* — who was in it, what they scored, how it
 * finished — and every one of those facts is settled by January. A draft is the
 * opposite shape: it is read once, in the days after draft night, by a surface
 * that has to answer *"is it finished yet"* rather than *"what happened"*. Two
 * requests, no weeks, no brackets, no reconciliation.
 *
 * Folding it into `importSeason` would have made every historical import two
 * requests longer for a fact none of the historical surfaces read, and it would
 * have put *"has the draft finished"* inside a function whose other twenty
 * answers are all about a season that is over.
 *
 * ## Nothing here decides anything about football
 *
 * It reads what Sleeper states and stops. Which manager drafted well is Tony's
 * opinion and arrives from the commissioner (`docs/PRESEASON_SLICE_BOUNDARY.md`);
 * which player was a reach is nobody's, because this product has no ADP, no
 * projection and no consensus source, and inventing one would be the exact
 * fabrication `16 §12` forbids.
 */
import { now } from '@/lib/clock';

import { decodeDraftPicks, decodeDrafts } from './codec';
import { endpointKey, type SleeperEndpoint } from './endpoints';
import { type SleeperFetchResult, type SleeperSource } from './transport';
import { SleeperDecodeError, type SleeperDraft, type SleeperDraftPick } from './types';

/**
 * Fetch, turning a **rejection** into a refusal.
 *
 * `SleeperSource.fetch` is documented to answer with a result rather than to
 * throw, and `createLiveSource` honours that — but a source is injectable, and
 * the Tuesday job's own test supplies one that rejects outright. A network
 * failure on a Tuesday morning is a refusal the job records and carries on
 * from; letting it propagate would put it in `failed`, which is the field that
 * turns the cron into a 500 and costs the league the rest of the chain.
 *
 * `importSeason` already makes exactly this promise for the weekly sync. This is
 * the same promise for the draft.
 */
async function read(
  source: SleeperSource,
  endpoint: SleeperEndpoint,
): Promise<SleeperFetchResult> {
  try {
    return await source.fetch(endpoint);
  } catch (error: unknown) {
    return {
      kind: 'error',
      endpoint,
      status: null,
      message: error instanceof Error ? error.message : String(error),
      attempts: 1,
      fetchedAt: now(),
    };
  }
}

/** Why there is no completed draft to read. */
export type DraftRefusal =
  /** The league has held no draft at all. */
  | 'no-draft'
  /** A draft exists and is not finished. `status` says which state it is in. */
  | 'not-complete'
  /** The draft is complete and Sleeper returned no picks for it. */
  | 'no-picks'
  /** Sleeper could not be read. */
  | 'unreachable';

export interface ImportedDraft {
  readonly draft: SleeperDraft;
  readonly picks: readonly SleeperDraftPick[];
  /** When the payload was fetched — real time live, recording time from a fixture. */
  readonly capturedAt: Date | null;
}

export interface DraftImportResult {
  /** Null unless a **completed** draft with picks was read. */
  readonly draft: ImportedDraft | null;
  readonly refusal: DraftRefusal | null;
  /**
   * The status of the newest draft, whatever it is.
   *
   * Set even when the import refuses, because *"Sleeper says the draft is still
   * running"* and *"Sleeper has never heard of a draft"* are different things to
   * tell a commissioner staring at an empty draft board.
   */
  readonly status: string | null;
  readonly warnings: readonly string[];
}

/**
 * Read the league's completed draft, or say why there is not one.
 *
 * Two requests: the draft list, then that draft's picks. The picks are fetched
 * **only** when the draft is complete — a half-finished board is not a draft the
 * paper can review, and storing one would leave the product unable to tell a
 * board that stopped at pick 90 from one that ended there.
 */
export async function importDraft(
  source: SleeperSource,
  leagueId: string,
): Promise<DraftImportResult> {
  const warnings: string[] = [];

  const listKey = endpointKey({ kind: 'drafts', leagueId });
  const listed = await read(source, { kind: 'drafts', leagueId });

  if (listed.kind === 'error') {
    return { draft: null, refusal: 'unreachable', status: null, warnings: [listed.message] };
  }
  if (listed.kind === 'empty') {
    return { draft: null, refusal: 'no-draft', status: null, warnings };
  }

  let drafts: readonly SleeperDraft[];
  try {
    const decoded = decodeDrafts(listed.payload, listKey);
    drafts = decoded.value;
    warnings.push(...decoded.warnings);
  } catch (error: unknown) {
    return {
      draft: null,
      refusal: 'unreachable',
      status: null,
      warnings: [error instanceof SleeperDecodeError ? error.message : String(error)],
    };
  }

  if (drafts.length === 0) {
    return { draft: null, refusal: 'no-draft', status: null, warnings };
  }

  /*
   * The completed one, preferred over the newest one.
   *
   * A league that restarts a botched draft leaves two rows behind, and the
   * newest is the one that finished — but a league in the middle of its second
   * attempt has a `drafting` row newer than a `complete` one that nobody wants
   * reviewed. Preferring `complete` is right in both cases, and `decodeDrafts`
   * has already sorted newest-first so the first match is the newest completed
   * draft.
   */
  const complete = drafts.find((candidate) => candidate.status === 'complete');
  const newest = drafts[0]!;

  if (complete === undefined) {
    return { draft: null, refusal: 'not-complete', status: newest.status, warnings };
  }

  const picksKey = endpointKey({ kind: 'draft_picks', draftId: complete.draftId });
  const fetched = await read(source, { kind: 'draft_picks', draftId: complete.draftId });

  if (fetched.kind === 'error') {
    return {
      draft: null,
      refusal: 'unreachable',
      status: complete.status,
      warnings: [...warnings, fetched.message],
    };
  }
  if (fetched.kind === 'empty') {
    return { draft: null, refusal: 'no-picks', status: complete.status, warnings };
  }

  let picks: readonly SleeperDraftPick[];
  try {
    const decoded = decodeDraftPicks(fetched.payload, picksKey);
    picks = decoded.value;
    warnings.push(...decoded.warnings);
  } catch (error: unknown) {
    return {
      draft: null,
      refusal: 'unreachable',
      status: complete.status,
      warnings: [
        ...warnings,
        error instanceof SleeperDecodeError ? error.message : String(error),
      ],
    };
  }

  if (picks.length === 0) {
    /*
     * Complete, and empty. Not a state Sleeper produces in practice, and
     * refusing it rather than storing a draft with no picks is what keeps
     * *"the draft is in"* from becoming true about a board nobody can read.
     */
    return { draft: null, refusal: 'no-picks', status: complete.status, warnings };
  }

  return {
    draft: { draft: complete, picks, capturedAt: fetched.fetchedAt },
    refusal: null,
    status: complete.status,
    warnings,
  };
}
