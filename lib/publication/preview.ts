import { DemoRefused, assertDemoAllowed } from '@/lib/demo/guard';

import { type Readiness, type ReviewItem } from './item';

/**
 * The office queue, narrowed to one band, for review — `?queue=<band>`.
 *
 * ## Why a preview parameter rather than a demo seat
 *
 * The same reason `emptyDeskPreview` is one, and the reasoning is worth
 * restating because it is the reason a whole class of screenshot lies: **an
 * issue belongs to the league, not to a seat.** Every other demo state is
 * produced by driving the real chain on a reserved seat, which is stronger
 * evidence — but the queue is league-scoped and *additive*, and the visual
 * driver loops widths on the **outside**. So a state that meant "one paper is
 * waiting" would photograph one item at 390 and four at 360, three files under
 * one name, and pass.
 *
 * `MANDATE §8` sanctions preview-only query parameters for exactly this.
 *
 * ## It filters; it does not fabricate
 *
 * Every item on the screen under a preview is a **real item**, computed by the
 * shipping `commissionerQueue` from real drafts made by the real chain. The
 * parameter chooses which bands are included and changes nothing else — no item
 * is invented, no readiness is overridden, no verdict is faked. A preview that
 * could show a `ready` item that was not ready would be worse than no preview at
 * all, because the screenshot is the evidence.
 *
 * ## It writes nothing, and it cannot happen in production
 *
 * Same two guards as every other demo path, evaluated on the **server**:
 * production is refused outright, and everywhere else needs `DEMO_FIXTURES=1`.
 * Neither is a manager's to set, so a URL nobody can turn on is not a way to
 * hide a pending issue from the commissioner.
 */

/**
 * The bands each preview shows.
 *
 * `empty` is the absence of every band rather than a special case, so the
 * screen it produces is the screen a commissioner meets when nothing is waiting
 * — the same component, the same query, an empty list.
 */
const PREVIEWS: Readonly<Record<string, readonly Readiness[]>> = {
  empty: [],
  ready: ['ready'],
  blocked: ['blocked', 'incomplete'],
  printed: ['published'],
};

/**
 * Which bands to show, or null for the real unfiltered queue.
 *
 * Null on an absent parameter, an unknown value, or outside a demo environment —
 * three different reasons for one answer, and the answer is *"show the truth"*
 * in all three. A misspelt preview must not blank the commissioner's queue.
 */
export function queuePreview(
  raw: string | string[] | undefined,
  env: Record<string, string | undefined>,
): readonly Readiness[] | null {
  if (typeof raw !== 'string') return null;
  const bands = PREVIEWS[raw];
  if (bands === undefined) return null;

  try {
    assertDemoAllowed(env);
  } catch (error: unknown) {
    if (error instanceof DemoRefused) return null;
    throw error;
  }

  return bands;
}

/** Apply a preview to a list. The identity function when there is no preview. */
export function applyQueuePreview(
  items: readonly ReviewItem[],
  bands: readonly Readiness[] | null,
): readonly ReviewItem[] {
  if (bands === null) return items;
  return items.filter((item) => bands.includes(item.readiness));
}

/** The preview keys, for the coverage test that pins the demo states to them. */
export const QUEUE_PREVIEWS: readonly string[] = Object.keys(PREVIEWS);
