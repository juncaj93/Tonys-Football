/**
 * Sleeper endpoint descriptors.
 *
 * Endpoints are structured values, not URL strings. Two things depend on that:
 *
 *   - a fixture file path derives deterministically from the descriptor, so a
 *     recorded fixture and a live request cannot drift apart by a typo;
 *   - the transport can log, retry, and report on an endpoint without parsing
 *     a URL back into its parts.
 *
 * `16 §12` and `10 §13` both require replay from stored payloads. That only
 * works if "which call is this" is a value the whole stack agrees on.
 */

export const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

/**
 * The regular season plus playoffs. Sleeper's `leg` reaches 17 in this
 * league's completed seasons, and weeks beyond the final one return an empty
 * array rather than an error, so recording the full range is safe.
 */
export const MAX_WEEK = 18;

export type SleeperEndpoint =
  | { readonly kind: 'league'; readonly leagueId: string }
  | { readonly kind: 'users'; readonly leagueId: string }
  | { readonly kind: 'rosters'; readonly leagueId: string }
  | { readonly kind: 'winners_bracket'; readonly leagueId: string }
  | { readonly kind: 'losers_bracket'; readonly leagueId: string }
  | { readonly kind: 'matchups'; readonly leagueId: string; readonly week: number }
  | { readonly kind: 'transactions'; readonly leagueId: string; readonly week: number }
  /**
   * Every draft the league has held, newest first.
   *
   * A list rather than `/draft/{league.draft_id}`, and the difference matters:
   * the league payload names *one* draft id, and a league that redrafts, holds a
   * rookie draft or restarts a botched one has more than one. Reading the list
   * means the adapter never has to decide which single id was the real one — it
   * takes the completed one, and says so when there is none.
   */
  | { readonly kind: 'drafts'; readonly leagueId: string }
  /**
   * One draft's picks.
   *
   * The only endpoint in this file keyed by something other than a league id,
   * because Sleeper hangs picks off the **draft** rather than off the league.
   * That is why it is absent from {@link seasonEndpoints}: the draft id is not
   * knowable until `drafts` has been read, so the recorder discovers it in a
   * second pass. See `scripts/record-fixtures.ts`.
   */
  | { readonly kind: 'draft_picks'; readonly draftId: string }
  | { readonly kind: 'state' };

/** The path segment appended to {@link SLEEPER_API_BASE}. */
export function endpointPath(endpoint: SleeperEndpoint): string {
  switch (endpoint.kind) {
    case 'league':
      return `/league/${endpoint.leagueId}`;
    case 'users':
      return `/league/${endpoint.leagueId}/users`;
    case 'rosters':
      return `/league/${endpoint.leagueId}/rosters`;
    case 'winners_bracket':
      return `/league/${endpoint.leagueId}/winners_bracket`;
    case 'losers_bracket':
      return `/league/${endpoint.leagueId}/losers_bracket`;
    case 'matchups':
      return `/league/${endpoint.leagueId}/matchups/${String(endpoint.week)}`;
    case 'transactions':
      return `/league/${endpoint.leagueId}/transactions/${String(endpoint.week)}`;
    case 'drafts':
      return `/league/${endpoint.leagueId}/drafts`;
    case 'draft_picks':
      return `/draft/${endpoint.draftId}/picks`;
    case 'state':
      return '/state/nfl';
  }
}

/**
 * The fixture file path for an endpoint, relative to the fixture root and
 * without an extension.
 *
 * Weeks are zero-padded so a directory listing sorts in week order rather than
 * lexicographically (`10` before `2`).
 */
export function endpointKey(endpoint: SleeperEndpoint): string {
  const week = (n: number): string => String(n).padStart(2, '0');

  switch (endpoint.kind) {
    case 'league':
      return `league/${endpoint.leagueId}/league`;
    case 'users':
      return `league/${endpoint.leagueId}/users`;
    case 'rosters':
      return `league/${endpoint.leagueId}/rosters`;
    case 'winners_bracket':
      return `league/${endpoint.leagueId}/winners_bracket`;
    case 'losers_bracket':
      return `league/${endpoint.leagueId}/losers_bracket`;
    case 'matchups':
      return `league/${endpoint.leagueId}/matchups/${week(endpoint.week)}`;
    case 'transactions':
      return `league/${endpoint.leagueId}/transactions/${week(endpoint.week)}`;
    case 'drafts':
      return `league/${endpoint.leagueId}/drafts`;
    case 'draft_picks':
      return `draft/${endpoint.draftId}/picks`;
    case 'state':
      return 'state/nfl';
  }
}

/** Human-readable label for logs and error messages. */
export function describeEndpoint(endpoint: SleeperEndpoint): string {
  return endpointPath(endpoint);
}

/** Every endpoint needed to import one season. */
export function seasonEndpoints(leagueId: string): readonly SleeperEndpoint[] {
  const endpoints: SleeperEndpoint[] = [
    { kind: 'league', leagueId },
    { kind: 'users', leagueId },
    { kind: 'rosters', leagueId },
    { kind: 'winners_bracket', leagueId },
    { kind: 'losers_bracket', leagueId },
    /*
     * The draft list, but not its picks.
     *
     * `draft_picks` needs an id this function cannot know, so the caller reads
     * what came back here and asks for the picks itself. Leaving the picks out
     * is the honest shape: this function returns *"every endpoint reachable from
     * a league id"*, and the picks are not one of them.
     */
    { kind: 'drafts', leagueId },
  ];

  for (let week = 1; week <= MAX_WEEK; week++) {
    endpoints.push({ kind: 'matchups', leagueId, week });
    endpoints.push({ kind: 'transactions', leagueId, week });
  }

  return endpoints;
}
