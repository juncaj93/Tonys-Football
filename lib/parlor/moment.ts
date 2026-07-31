import { and, count, eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { collectibles, lootBoxes } from '@/lib/db/schema';

/**
 * What is true of a manager **right now**, as dialogue tags.
 *
 * `lib/tags/derive.ts` answers "what is true of this person across seasons" —
 * champion, most points, never made the playoffs. Those are *standing* facts and
 * they change roughly once a year. This answers a different question: what is
 * true at the counter this second, which changes the moment they tap something.
 *
 * ## Why a moment tag outranks every standing line, without a priority field
 *
 * `selectContent` picks the line with the **smallest audience** — the fewest
 * managers who could hear it — because that is what makes Tony's line pointed
 * rather than generic (`lib/content/select.ts`). The homepage computes that
 * audience over `leagueTags`, which is derived history and therefore contains no
 * moment tags at all.
 *
 * So a line requiring `first_welcome_box` has an audience of **zero others**:
 * nobody else in the room could be handed their first box at this instant, and
 * that is not an artefact, it is the literal truth. It wins on the existing rule
 * rather than needing a new one, and `moment.test.ts` pins that it beats a
 * champion line so the behaviour cannot drift.
 *
 * ## Server state only
 *
 * The commissioner's ruling is explicit: *"do not infer purchase eligibility only
 * from a displayed client balance."* Every tag here is a count from the
 * database, read on the server on the request that renders the greeting. The
 * client is never asked whether it thinks it has a box.
 *
 * ## The negative states are the absence of a tag
 *
 * There is deliberately no `no_welcome_box` or `already_opened`. A manager who
 * has opened their box simply stops holding `first_welcome_box`, the welcome
 * line stops being eligible, and the standing lines take over — which is the
 * engine working, not a special case. Naming absences as tags would double the
 * vocabulary and create pairs that can contradict each other.
 */

/**
 * Their first box, still shut.
 *
 * Both halves matter. An unopened box alone is also true of somebody on their
 * fifth; owning nothing alone is also true of somebody who has spent everything.
 * Together they are exactly one situation — **they have never opened anything and
 * there is something waiting** — which is the only moment "first one's on the
 * house" is a true sentence.
 */
export const FIRST_WELCOME_BOX = 'first_welcome_box';

/**
 * A box waiting, for somebody who has opened one before.
 *
 * The returning manager. Tony does not re-explain the gift; he points at the
 * counter.
 */
export const BOX_WAITING = 'box_waiting';

/** Every moment tag, so a test can assert the content file uses only these. */
export const MOMENT_TAGS: readonly string[] = [FIRST_WELCOME_BOX, BOX_WAITING];

/**
 * The moment tags this manager holds.
 *
 * Two counts, in parallel, on the request that renders the room. Cheap enough to
 * do every load and correct enough to be worth doing every load — a tag cached
 * from a previous render would have Tony offering a box that has just been
 * opened.
 */
export async function momentTags(db: Queryable, userId: string): Promise<Set<string>> {
  const [boxes, owned] = await Promise.all([
    db
      .select({ n: count() })
      .from(lootBoxes)
      .where(and(eq(lootBoxes.userId, userId), eq(lootBoxes.state, 'UNOPENED'))),
    db.select({ n: count() }).from(collectibles).where(eq(collectibles.userId, userId)),
  ]);

  const unopened = Number(boxes[0]?.n ?? 0);
  const collected = Number(owned[0]?.n ?? 0);

  const tags = new Set<string>();
  if (unopened > 0) tags.add(collected === 0 ? FIRST_WELCOME_BOX : BOX_WAITING);
  return tags;
}
