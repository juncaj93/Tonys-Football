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
  ];

  for (let week = 1; week <= MAX_WEEK; week++) {
    endpoints.push({ kind: 'matchups', leagueId, week });
    endpoints.push({ kind: 'transactions', leagueId, week });
  }

  return endpoints;
}
