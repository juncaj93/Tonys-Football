/**
 * The content selector.
 *
 * One eligibility pipeline for every kind of content (`16 §10`), pure and
 * therefore testable without a database:
 *
 *   active → surface → people relevant → event tags → variables resolvable →
 *   per-user cooldown → seasonal cap → weight → select → (caller logs)
 *
 * Two rules from the plan shape the design.
 *
 * **"No content" is always a valid outcome.** A meaningful quiet probability on
 * every surface is what makes the lines land. So this returns null rather than
 * reaching for something weaker, and every caller must render that.
 *
 * **A line whose variables cannot all be resolved is skipped, never rendered
 * with a gap** (`05 §2.3`). "Morning, {name}." is worse than silence.
 *
 * ## The draw is the caller's, and it is never `Math.random`
 *
 * Selection runs inside a server render, so an unseeded draw is a sentence that
 * can differ between the HTML the server sent and what the browser builds from
 * the same payload. `lib/content/draw.ts` explains what replaced it; the shape
 * of the rule here is that `random` is **required**, so a new surface has to say
 * what its draw is derived from rather than inheriting a hazard by omission.
 *
 * ## Distinctiveness before weight
 *
 * The plan orders eligibility, then weight. This adds one step between them:
 * among eligible lines, **the line true of the fewest people wins.**
 *
 * That is what `17 §3`'s acceptance criterion needs. If the champion and the
 * manager who led the league in points can both draw the same generic offseason
 * line, two managers standing side by side see the same greeting and the
 * feature has failed, however correct the weighting was. The untagged lines
 * exist as a floor, not as competition — `content/counter-greetings.md` says so
 * directly: fall back to them "when nothing is eligible".
 *
 * Counting required *tags* is the obvious proxy and it is wrong. A20 —
 * "two seasons on that wall, neither of them yours" — carries two tags and is
 * true of eight of the ten managers, while A9 — "seventeen seventy-six thrown
 * at you last season" — carries one and is true of exactly one person. Ranked
 * by tag count, the generic line beats the specific one and five managers see
 * the same greeting. Ranked by audience, each gets the most pointed true thing
 * Tony can say about them.
 *
 * The caller supplies the audience because it is the caller that knows who is
 * in the room. Weight still decides within a bucket, which is where it belongs.
 */

export interface SelectableEntry {
  readonly id: string;
  readonly key: string;
  readonly requiredTags: readonly string[];
  readonly excludedTags: readonly string[];
  readonly templateText: string;
  readonly weight: number;
  readonly cooldownDays: number;
  readonly maxUsesPerSeason: number | null;
  readonly sensitivity: 'ordinary' | 'restricted';
}

export interface UsageRecord {
  readonly entryId: string;
  readonly usedAt: Date;
}

export interface SelectionInput<T extends SelectableEntry> {
  readonly candidates: readonly T[];
  readonly tags: ReadonlySet<string>;
  /**
   * Variable values. A key that is missing or null is unresolvable, and every
   * line using it is skipped.
   */
  readonly variables: Readonly<Record<string, string | null | undefined>>;
  /** This viewer's uses of these entries, any order. */
  readonly usage: readonly UsageRecord[];
  /** Uses of each entry this season, by anyone. Absent means uncapped. */
  readonly seasonUses?: ReadonlyMap<string, number>;
  /** True when restricted content is permitted on this surface (`16 §10`). */
  readonly allowRestricted?: boolean;
  /**
   * How many people in the league a line is true of. Lower wins.
   *
   * Omitted, distinctiveness falls back to the number of required tags, which
   * is a rough proxy — fine for a surface where every line is equally general,
   * misleading wherever a broad condition happens to be written as two tags.
   */
  readonly audienceSize?: (entry: T) => number;
  readonly now: Date;
  /**
   * The draw. **Required, and never `Math.random`.**
   *
   * This used to default to `Math.random`, which put an unrecorded source of
   * randomness inside a server render: two renders of the same request could
   * choose two different sentences, and React reads a sentence that changed
   * between the server's HTML and the client's as a hydration mismatch.
   *
   * There is no default now, deliberately. A surface that draws content has to
   * name what its draw is derived from — `seededDraw(userId, surface, day)` for
   * anything rendered with the page, `rollBelow` for anything that is an event —
   * and a new caller cannot inherit the old hazard by leaving the field out.
   */
  readonly random: () => number;
}

export interface Selection<T extends SelectableEntry> {
  readonly entry: T;
  /** Variables substituted. What the manager actually reads. */
  readonly text: string;
}

const VARIABLE = /\{([a-z_]+)\}/g;

export function renderTemplate(
  template: string,
  variables: Readonly<Record<string, string | null | undefined>>,
): string | null {
  let resolvable = true;

  const rendered = template.replace(VARIABLE, (_match, name: string) => {
    const value = variables[name];
    if (value === null || value === undefined || value === '') {
      resolvable = false;
      return '';
    }
    return value;
  });

  return resolvable ? rendered : null;
}

export function selectContent<T extends SelectableEntry>(
  input: SelectionInput<T>,
): Selection<T> | null {
  const random = input.random;
  const allowRestricted = input.allowRestricted ?? false;

  const lastUsedByEntry = new Map<string, number>();
  for (const use of input.usage) {
    const previous = lastUsedByEntry.get(use.entryId) ?? 0;
    lastUsedByEntry.set(use.entryId, Math.max(previous, use.usedAt.getTime()));
  }

  const eligible: { entry: T; text: string }[] = [];

  for (const entry of input.candidates) {
    if (entry.sensitivity === 'restricted' && !allowRestricted) continue;

    if (!entry.requiredTags.every((tag) => input.tags.has(tag))) continue;
    if (entry.excludedTags.some((tag) => input.tags.has(tag))) continue;

    const text = renderTemplate(entry.templateText, input.variables);
    if (text === null) continue;

    const lastUsed = lastUsedByEntry.get(entry.id);
    if (lastUsed !== undefined && entry.cooldownDays > 0) {
      const readyAt = lastUsed + entry.cooldownDays * 24 * 60 * 60 * 1000;
      if (input.now.getTime() < readyAt) continue;
    }

    if (entry.maxUsesPerSeason !== null) {
      const used = input.seasonUses?.get(entry.id) ?? 0;
      if (used >= entry.maxUsesPerSeason) continue;
    }

    eligible.push({ entry, text });
  }

  if (eligible.length === 0) return null;

  const audience =
    input.audienceSize ?? ((entry: T) => -entry.requiredTags.length);

  const smallest = Math.min(...eligible.map((option) => audience(option.entry)));
  const bucket = eligible.filter((option) => audience(option.entry) === smallest);

  return weightedPick(bucket, random);
}

function weightedPick<T extends SelectableEntry>(
  options: readonly { entry: T; text: string }[],
  random: () => number,
): Selection<T> | null {
  const total = options.reduce((sum, option) => sum + Math.max(0, option.entry.weight), 0);

  // Every candidate weighted zero: treat the bucket as empty rather than
  // silently handing out a line somebody deliberately turned off.
  if (total <= 0) return null;

  let roll = random() * total;

  for (const option of options) {
    roll -= Math.max(0, option.entry.weight);
    if (roll < 0) return option;
  }

  return options.at(-1) ?? null;
}
