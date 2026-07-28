/**
 * Curated roster metadata.
 *
 * Sleeper's roster `metadata` object mixes two very different things: text the
 * managers wrote themselves, and each manager's personal notification
 * settings. Commissioner direction, 2026-07-28 — keep the first, discard the
 * second.
 *
 * The keeping is the point. There are **115 manager-written player nicknames**
 * across the recorded seasons — "Mr. Felony Man", "Joe's biggest regret",
 * "New starting RB for sale". That is league-authored comedy about real
 * players, written by the people it will later be shown to, and it is exactly
 * the curated (never generated) material the content engine in `16 §10` runs
 * on. It costs a jsonb column to preserve now and cannot be recovered later —
 * Sleeper overwrites a nickname when the manager changes it.
 *
 * The discarding is equally deliberate. `allow_pn_*`, `restrict_pn_*`, and
 * `allow_sms` are personal notification and contact preferences. They are not
 * league content, we have no feature that reads them, and holding contact
 * preferences we do not need is a cost with no benefit.
 *
 * Nothing here is authoritative. Sleeper's `record` and `streak` strings are
 * kept as provenance only — `16 §10` requires reputation be recomputed weekly
 * from verified events, so these are a cross-check, never an input.
 */

/** Sleeper writes player nicknames as `p_nick_<playerId>`. */
const NICKNAME_PREFIX = 'p_nick_';

/** Personal settings, never league content. */
function isPersonalSetting(key: string): boolean {
  return key.startsWith('allow_pn') || key.startsWith('restrict_pn') || key.startsWith('allow_');
}

export interface RosterMetadata {
  /** Player ID → the nickname this manager gave them. */
  readonly playerNicknames: Readonly<Record<string, string>>;
  /** Sleeper's per-week result string, e.g. `"WLLWLLLWWWWWWW"`. Provenance only. */
  readonly record: string | null;
  /** Sleeper's streak string, e.g. `"7W"`. Provenance only. */
  readonly streak: string | null;
}

export const EMPTY_ROSTER_METADATA: RosterMetadata = {
  playerNicknames: {},
  record: null,
  streak: null,
};

/**
 * Reduce a raw Sleeper roster `metadata` object to what is worth keeping.
 *
 * Tolerant like the rest of the adapter: an unfamiliar key is ignored rather
 * than failing the import.
 */
export function curateRosterMetadata(raw: unknown): RosterMetadata {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return EMPTY_ROSTER_METADATA;
  }

  const source = raw as Record<string, unknown>;
  const playerNicknames: Record<string, string> = {};
  let record: string | null = null;
  let streak: string | null = null;

  for (const [key, value] of Object.entries(source)) {
    if (isPersonalSetting(key)) continue;
    if (typeof value !== 'string' || value.trim() === '') continue;

    if (key.startsWith(NICKNAME_PREFIX)) {
      const playerId = key.slice(NICKNAME_PREFIX.length);
      if (playerId !== '') playerNicknames[playerId] = value;
      continue;
    }

    if (key === 'record') record = value;
    else if (key === 'streak') streak = value;
  }

  return { playerNicknames, record, streak };
}

/** Whether anything was worth keeping. Used to skip writing empty objects. */
export function hasRosterMetadata(metadata: RosterMetadata): boolean {
  return (
    Object.keys(metadata.playerNicknames).length > 0 ||
    metadata.record !== null ||
    metadata.streak !== null
  );
}
