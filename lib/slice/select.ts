import {
  LEAD_FLOOR,
  STORY_FLOOR,
  type StoryCandidate,
  type StoryKind,
} from '@/lib/stats/stories';

/**
 * Which stories run, and why the rest did not.
 *
 * Derivation is `lib/stats/stories.ts`; this is the desk. Keeping them apart is
 * what makes a suppression *reportable* — the candidate existed, it was ranked,
 * and something specific beat it. A pipeline that simply never produced the story
 * cannot tell you that.
 *
 * ## The commissioner's brief, as rules
 *
 * > *Avoid weak filler. A weak-news week should publish fewer stories rather than
 * > exaggerate ordinary events.*
 *
 * Two floors do that arithmetically rather than by intention:
 *
 * - **`LEAD_FLOOR`** — nothing below it may lead. A week with no candidate above
 *   it is a **quiet edition**: the scoreboard, and Tony saying it was quiet. That
 *   is a real editorial state and the paper is allowed to have one.
 * - **`STORY_FLOOR`** — nothing below it prints at all.
 *
 * Neither can be reached by a story shouting louder, because significance is
 * assigned upstream by the fact layer and this module only ever *lowers* it.
 *
 * ## Four suppressions, and each one is a real editorial mistake it prevents
 *
 * - **`same-game`** — two stories about one game is one story told twice. The
 *   championship *was* the blowout; printing both reports one result as two.
 * - **`same-kind`** — a page of three blowouts has no lead. One of each shape.
 * - **`manager-repeat`** — 2024 ran four "Matt Lee handles…" headlines in eight
 *   weeks off the old renderer. A manager already carrying this edition has to
 *   clear a higher bar to carry it again.
 * - **`below-floor`** / **`edition-full`** — the ordinary two.
 *
 * ## Novelty runs across issues, not only inside one
 *
 * 2025 weeks five, six and seven all led with a winning streak, because each week
 * was judged alone and a streak that is worth reporting once is worth the same
 * number the week after. A reader gets three identical front pages.
 *
 * So selection takes the kinds that led the **previous two issues** and discounts
 * them **in the ordering only**.
 *
 * That last part is the whole rule, and getting it wrong once was instructive.
 * The first version subtracted the discount before the floors, and 2024 week ten
 * — a fifty-one-point win — printed *"A quiet week at the shop"* above a board
 * showing it, because `blowout` had led week nine. A front page that contradicts
 * its own scoreboard is a worse failure than a repeated headline, and it is the
 * kind a reader notices immediately.
 *
 * **Novelty reorders; it never silences.** The floors are judged on a story's own
 * significance, so a real blowout always runs — it just runs second when the
 * paper ran one last week.
 *
 * ## And above `MATERIAL`, variety has no vote at all
 *
 * A record, a title, or an `obliterated` margin is not a matter of tone. It leads
 * whatever ran last week and whoever else is in the issue. See `MATERIAL`.
 *
 * ## Greedy over a fixed order, deliberately
 *
 * Candidates arrive sorted by significance. The walk is single-pass and the
 * penalty is applied as it goes, so the outcome depends only on the input order —
 * which is itself deterministic. A re-ranking pass after each penalty would be
 * marginally "better" and would make the result depend on iteration order in a
 * way nobody could reproduce by hand from the evidence lines.
 */

export type SuppressionReason =
  | 'same-game'
  | 'same-kind'
  | 'manager-repeat'
  | 'below-floor'
  | 'below-lead-floor'
  | 'edition-full';

export interface Suppressed {
  readonly id: string;
  readonly kind: StoryKind;
  readonly reason: SuppressionReason;
  /** A sentence a commissioner can act on. Never rendered to a manager. */
  readonly detail: string;
}

/** A story the novelty rule pushed down the running order. */
export interface Demoted {
  readonly id: string;
  readonly kind: StoryKind;
  readonly penalty: number;
  readonly detail: string;
}

export interface Selection {
  /** The story that leads, or null on a quiet week. */
  readonly lead: StoryCandidate | null;
  /** Everything else that ran, in order. */
  readonly rest: readonly StoryCandidate[];
  readonly suppressed: readonly Suppressed[];
  /** What novelty moved, and by how much. Reportable, never rendered. */
  readonly demoted: readonly Demoted[];
  /** No candidate cleared `LEAD_FLOOR`. The scoreboard still prints. */
  readonly quiet: boolean;
}

/** How many stories one issue may carry. A paper, not a database dump. */
export const MAX_STORIES = 3;

/**
 * What a repeat subject costs.
 *
 * Large enough that an ordinary second story about the same manager loses to a
 * different manager's ordinary story, small enough that a genuine record still
 * runs. A 950 record minus one repeat is 830 and still leads; a 470 elimination
 * minus one repeat is 350 and drops behind a fresh 400 low score. That is the
 * intended trade, stated so it can be argued with.
 */
export const REPEAT_PENALTY = 120;

/**
 * Above this, variety stops having a vote.
 *
 * **Commissioner ruling, 2026-07-31:** *"Do not allow novelty, variety, or
 * manager balancing to suppress a materially significant verified event."*
 *
 * Every rule in this module exists to stop the paper repeating itself, and every
 * one of them is a heuristic about *tone*. A record, a title, or a margin the
 * classifier called `obliterated` is not a matter of tone — it is the news, and a
 * paper that dropped it because the same manager already appeared, or because a
 * blowout led last week, would be wrong in the way that loses a reader's trust
 * rather than merely boring them.
 *
 * So above this line: no repeat penalty, no novelty discount, no `same-kind`
 * drop. `same-game` still applies, because two stories about one game is one
 * story told twice and that is not a variety rule — it is arithmetic.
 *
 * The value sits below `championship` (900), both records (940 / 950) and an
 * `obliterated` blowout (780+), and above everything a heuristic should be
 * allowed to move: a `crushed` blowout (600+), a nail-biter (600–700), a high
 * score (480–580), a streak, a table move.
 */
export const MATERIAL = 750;

/**
 * What leading a recent issue costs, most recent first.
 *
 * Last week is discounted hardest. Two weeks back is a reminder rather than a
 * repetition, so it costs less. Three weeks back costs nothing — at that distance
 * a reader has forgotten, and a paper that refused to ever run two blowouts in a
 * month would be suppressing the actual news.
 */
export const STALE_PENALTY: readonly number[] = [150, 70];

export interface SelectionOptions {
  /**
   * What led the previous issues, most recent first.
   *
   * Passed in rather than looked up, so this module stays pure and a demo edition
   * with no history behaves like week one rather than like a database error.
   */
  readonly recentLeadKinds?: readonly StoryKind[];
}

export function selectStories(
  candidates: readonly StoryCandidate[],
  options: SelectionOptions = {},
): Selection {
  const recent = options.recentLeadKinds ?? [];
  const stalePenalty = (kind: StoryKind): number => {
    const index = recent.indexOf(kind);
    return index === -1 ? 0 : (STALE_PENALTY[index] ?? 0);
  };

  /*
   * Ranked by significance **less the novelty discount**, and by nothing else.
   * The discount lives here and only here; every floor below reads the raw
   * significance.
   */
  const rank = (candidate: StoryCandidate): number =>
    candidate.significance -
    (candidate.significance >= MATERIAL ? 0 : stalePenalty(candidate.kind));

  const ordered = [...candidates].sort(
    (x, y) => rank(y) - rank(x) || x.id.localeCompare(y.id),
  );

  const demoted: Demoted[] = candidates
    .filter(
      (candidate) =>
        stalePenalty(candidate.kind) > 0 && candidate.significance < MATERIAL,
    )
    .map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      penalty: stalePenalty(candidate.kind),
      detail:
        `${candidate.kind} led ${String(recent.indexOf(candidate.kind) + 1)} issue(s) ago, ` +
        `so it is ranked ${String(stalePenalty(candidate.kind))} lower this week`,
    }));

  const chosen: StoryCandidate[] = [];
  const suppressed: Suppressed[] = [];
  const usedGames = new Set<string>();
  const usedKinds = new Set<StoryKind>();
  const subjectCount = new Map<string, number>();

  const drop = (
    candidate: StoryCandidate,
    reason: SuppressionReason,
    detail: string,
  ): void => {
    suppressed.push({ id: candidate.id, kind: candidate.kind, reason, detail });
  };

  for (const candidate of ordered) {
    if (candidate.significance < STORY_FLOOR) {
      drop(
        candidate,
        'below-floor',
        `significance ${String(candidate.significance)} is under the ${String(STORY_FLOOR)} floor`,
      );
      continue;
    }

    if (chosen.length >= MAX_STORIES) {
      drop(candidate, 'edition-full', `the issue already carries ${String(MAX_STORIES)} stories`);
      continue;
    }

    if (candidate.gameKey !== null && usedGames.has(candidate.gameKey)) {
      drop(
        candidate,
        'same-game',
        `${candidate.gameKey} already ran as a stronger story; one result is one story`,
      );
      continue;
    }

    /*
     * The materiality escape hatch, checked once and used three times below.
     *
     * `same-game` is deliberately *not* gated on it: that rule is above this
     * line, because one result is one story whatever it was worth.
     */
    const material = candidate.significance >= MATERIAL;

    if (!material && usedKinds.has(candidate.kind)) {
      drop(candidate, 'same-kind', `the issue already carries a ${candidate.kind} story`);
      continue;
    }

    /*
     * The diversity penalty.
     *
     * Counted on the *lead subject* — `subjects[0]` — rather than on everybody
     * named. A manager who happens to be the losing side of two stories has not
     * carried the edition, and penalising that would suppress the second story
     * for the wrong person.
     */
    const subject = candidate.subjects[0];
    const already = subject === undefined ? 0 : (subjectCount.get(subject) ?? 0);
    const adjusted = candidate.significance - already * REPEAT_PENALTY;

    if (!material && already > 0 && adjusted < STORY_FLOOR) {
      drop(
        candidate,
        'manager-repeat',
        `already the subject of ${String(already)} story in this issue; ` +
          `${String(candidate.significance)} less ${String(already * REPEAT_PENALTY)} falls under the floor`,
      );
      continue;
    }

    const leading = chosen.length === 0;
    if (leading && adjusted < LEAD_FLOOR) {
      drop(
        candidate,
        'below-lead-floor',
        `nothing this week reached ${String(LEAD_FLOOR)}; the issue runs quiet rather than ` +
          'promoting an ordinary result to a headline',
      );
      continue;
    }

    chosen.push(candidate);
    if (candidate.gameKey !== null) usedGames.add(candidate.gameKey);
    usedKinds.add(candidate.kind);
    if (subject !== undefined) subjectCount.set(subject, already + 1);
  }

  const [lead, ...rest] = chosen;

  return {
    lead: lead ?? null,
    rest,
    suppressed,
    demoted,
    quiet: lead === undefined,
  };
}
