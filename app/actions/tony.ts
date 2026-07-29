'use server';

import { requireUser } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { anotherLineFor } from '@/lib/content/greeting';
import { getDb } from '@/lib/db';
import { seasonClock } from '@/lib/parlor/season';
import { loadTags } from '@/lib/tags/repository';

/**
 * Tapping Tony.
 *
 * He is a **Toy**, in the ruling's sense: he responds, he does not lead
 * anywhere, and he carries no persistent highlight. Tapping him draws another
 * curated line that is true of the person tapping.
 *
 * ## It does not spend the day's greeting
 *
 * The Counter Greeting is drawn once per day and logged, which is what stops a
 * manager reloading the parlor and hearing a different Tony each time. Poking
 * him must not eat into that: this selection ignores the usage log and writes
 * nothing to it. The line is still true — it comes from the same eligibility
 * pipeline over the same verified tags — it simply does not count as the day's
 * greeting.
 *
 * The cooldown is on the client, in `components/scene/tony-toy.tsx`. It is a
 * pacing decision rather than a security one; the worst a determined tapper can
 * do is read lines that are all true about them.
 */
export async function anotherLineAction(): Promise<{ text: string | null }> {
  const { user } = await requireUser();
  const db = getDb();

  const [tags, managers] = await Promise.all([loadTags(db), listDoorManagers(db)]);

  const text = await anotherLineFor(db, {
    userId: user.id,
    displayName: user.displayName,
    tags: tags.get(user.id) ?? new Set<string>(),
    leagueTags: managers.map((manager) => tags.get(manager.id) ?? new Set<string>()),
    daysUntilKickoff: seasonClock().daysUntilKickoff,
  });

  return { text };
}
