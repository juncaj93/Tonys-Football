'use server';

import { requireUser } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { conversationFor } from '@/lib/content/conversation';
import { getDb } from '@/lib/db';
import { asideFactFrom } from '@/lib/parlor/aside';
import { momentTags } from '@/lib/parlor/moment';
import { seasonClock } from '@/lib/parlor/season';
import { latestPacket, mostRecentChampion } from '@/lib/slice/edition';
import { loadTags } from '@/lib/tags/repository';

/**
 * Returning to Tony.
 *
 * He is a **Toy**, in the ruling's sense: he responds, he does not lead
 * anywhere, and he carries no persistent highlight. Tapping him draws from a
 * conversation deck keyed to the manager, Eastern time, the football calendar,
 * and an approved Sleeper fact when one is available.
 *
 * ## It does not spend the day's greeting
 *
 * The Counter Greeting is drawn once per day and logged, which is what stops a
 * manager reloading the parlor and hearing a different Tony each time. Poking
 * him must not eat into that: this is a separate surface with its own history,
 * so a return visit moves the conversation forward without replacing the
 * greeting the manager arrived to.
 *
 * The cooldown is on the client, in `components/scene/tony-toy.tsx`. It is a
 * pacing decision. The server also remembers the last eight conversation
 * entries, which is the guarantee that a determined tapper cannot turn Tony
 * into a repeating soundboard.
 */
export async function anotherLineAction(): Promise<{ text: string | null }> {
  const { user } = await requireUser();
  const db = getDb();

  const [tags, managers, packet, champion, moment] = await Promise.all([
    loadTags(db),
    listDoorManagers(db),
    latestPacket(db),
    mostRecentChampion(db),
    momentTags(db, user.id),
  ]);
  const fact = asideFactFrom({
    userId: user.id,
    packet,
    momentTags: moment,
    champion,
  });

  const response = await conversationFor(db, {
    userId: user.id,
    displayName: user.displayName,
    teamName: managers.find((manager) => manager.id === user.id)?.teamName ?? null,
    tags: tags.get(user.id) ?? new Set<string>(),
    leagueTags: managers.map((manager) => tags.get(manager.id) ?? new Set<string>()),
    daysUntilKickoff: seasonClock().daysUntilKickoff,
    fact,
    packet,
  });

  return { text: response?.text ?? null };
}
