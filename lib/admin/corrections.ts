import { eq, inArray } from 'drizzle-orm';

import { listDoorManagers, resetPin } from '@/lib/auth/service';
import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { adminAuditLogs, characterConfigurations } from '@/lib/db/schema';

/**
 * The commissioner's correction tools — one manager at a time.
 *
 * ## What this is for
 *
 * Launch week is when the two mistakes below actually happen, and neither of
 * them is a bug in the product: a manager taps the wrong name on the door and
 * sets a PIN against a league-mate's identity, or somebody wants their first
 * run at the mirror back after Tony's guess got saved by accident. Both need a
 * person with the keys, and until now the office could only clear a PIN.
 *
 * ## Why the corrections are per-manager and there is no bulk reset
 *
 * A bulk "reset the launch" is one tap that touches ten people, and the tap
 * itself carries no evidence of which of the ten actually needed it. Every
 * correction here names a subject, and the audit row names that subject too —
 * so `admin_audit_logs` answers *"what was done to this manager, and by whom"*
 * rather than *"a reset happened."* A league-wide reset is a different decision
 * with different consequences and it is deliberately not built.
 *
 * ## What a correction may touch, and what it may not
 *
 * These are **identity** corrections. Nothing here moves a token balance, opens
 * or grants a loot box, touches a collectible, empties a room, or changes what
 * the league reads. That is not a coincidence of the current implementation: a
 * correction that quietly deleted somebody's collection would be a destructive
 * operation wearing the clothes of an administrative one, and the commissioner
 * pressing it could not have known. Anything with an economy consequence needs
 * its own decision, its own screen and its own reasoning.
 *
 * ## Every correction is one transaction with its audit row inside it
 *
 * The same discipline `resetPin` already uses (`09 §8.3`, `09 §18`): the record
 * is written in the same transaction as the change it describes, so a
 * correction cannot happen unrecorded and a recorded correction cannot have
 * half-happened.
 */

/** The two corrections. Adding a third is a decision, not a parameter. */
export type CorrectionKind = 'release-name' | 'reset-character';

export const CORRECTION_KINDS: readonly CorrectionKind[] = ['release-name', 'reset-character'];

export function isCorrectionKind(value: unknown): value is CorrectionKind {
  return typeof value === 'string' && (CORRECTION_KINDS as readonly string[]).includes(value);
}

/**
 * A manager a correction can be applied to, with the two facts that decide
 * which corrections are offered.
 */
export interface CorrectionSubject {
  readonly id: string;
  readonly displayName: string;
  readonly teamName: string | null;
  /** Has a PIN on file — somebody is holding this key. */
  readonly claimed: boolean;
  /** Has saved a character at least once, so the mirror no longer says Tony guessed. */
  readonly characterChosen: boolean;
}

export type CorrectionRefusal =
  /**
   * The id names nobody the door offers. A retired manager and an id off the
   * end of a stale page both land here, and the answer is the same: this screen
   * corrects the people who can sign in.
   */
  | 'not-in-league'
  /** Releasing a name nobody is holding. There is nothing to put back. */
  | 'not-claimed'
  /**
   * Releasing your own name. It would revoke the session doing the releasing
   * and leave nobody able to reach the office — the same rule `resetPinAction`
   * has held since the key board shipped.
   */
  | 'self';

export type CorrectionResult =
  | {
      readonly ok: true;
      readonly kind: CorrectionKind;
      readonly subject: CorrectionSubject;
      /**
       * Did anything actually move?
       *
       * False is an ordinary outcome, not a failure: resetting the character of
       * a manager who never saved one is a correction that finds the world
       * already correct. The audit row is written either way, because the
       * commissioner did press the button and *"I pressed it and nothing was
       * there"* is exactly the thing a trail should be able to say.
       */
      readonly changed: boolean;
    }
  | { readonly ok: false; readonly refusal: CorrectionRefusal };

/** One sentence per refusal, in the office's plain voice. */
export const CORRECTION_REFUSALS: Readonly<Record<CorrectionRefusal, string>> = {
  'not-in-league': 'That name is not on the door, so there is nothing here to correct.',
  'not-claimed': 'That name is already back on the hook. Nobody is holding it.',
  self: 'You cannot release your own name from here — it would sign you out mid-action.',
};

/**
 * Who can be corrected, and what state each of them is in.
 *
 * `listDoorManagers` rather than a query of its own: the population that can
 * claim a name wrongly is exactly the population the door offers, and a second
 * definition of "the league" here would be a second place for the retired-manager
 * rule to be got wrong.
 */
export async function listCorrectionSubjects(
  db: Database,
): Promise<readonly CorrectionSubject[]> {
  const managers = await listDoorManagers(db);
  if (managers.length === 0) return [];

  const configured = await db
    .select({ userId: characterConfigurations.userId })
    .from(characterConfigurations)
    .where(
      inArray(
        characterConfigurations.userId,
        managers.map((manager) => manager.id),
      ),
    );
  const chosen = new Set(configured.map((row) => row.userId));

  return managers.map((manager) => ({
    id: manager.id,
    displayName: manager.displayName,
    teamName: manager.teamName,
    claimed: manager.claimed,
    characterChosen: chosen.has(manager.id),
  }));
}

/** One subject by id, with the same two facts. Null if the door does not offer them. */
export async function correctionSubject(
  db: Database,
  userId: string,
): Promise<CorrectionSubject | null> {
  const subjects = await listCorrectionSubjects(db);
  return subjects.find((subject) => subject.id === userId) ?? null;
}

/**
 * Put a wrongly-claimed name back on the door.
 *
 * The mechanism is a PIN reset and that is deliberate rather than lazy: *"the
 * key comes off this person and goes back on the hook"* is the same operation
 * whether the reason was a forgotten PIN or the wrong name tapped, and building
 * a second copy of it would have been two paths that could drift about session
 * revocation. What differs is the **decision**, so what differs is the reason
 * recorded against it — `resetPin` writes `identity_release` here and
 * `pin_reset` for the key board.
 *
 * It never exposes or chooses a PIN. The right manager claims the name from the
 * door exactly as they would have the first time.
 *
 * **It does not touch anything the wrong claimant did while holding the name.**
 * If they saved a character on it, that character is still there — reset it
 * with `resetCharacterSelection`, as a second, separately confirmed decision.
 * Folding the two together would mean a commissioner fixing a mis-tap on the
 * door silently deleting something, which is the class of surprise these tools
 * exist to avoid.
 */
export async function releaseName(
  db: Database,
  input: { readonly actorUserId: string; readonly subjectUserId: string },
): Promise<CorrectionResult> {
  const subject = await correctionSubject(db, input.subjectUserId);
  if (subject === null) return { ok: false, refusal: 'not-in-league' };
  if (subject.id === input.actorUserId) return { ok: false, refusal: 'self' };
  if (!subject.claimed) return { ok: false, refusal: 'not-claimed' };

  await resetPin(db, {
    actorUserId: input.actorUserId,
    subjectUserId: subject.id,
    reason: 'WRONG_IDENTITY',
  });

  return { ok: true, kind: 'release-name', subject, changed: true };
}

/**
 * Put a manager back in front of first-run character creation.
 *
 * `characterFor` reports `chosen: false` when there is **no** configuration row
 * — it never writes a default on read, precisely so that *"has this manager ever
 * chosen anything?"* stays answerable — so deleting the row is the whole
 * correction. The mirror greets them with Tony's guess again, which is what a
 * first run is.
 *
 * ## Equipped wearables are deliberately left on
 *
 * A wearable is something the manager **owns**, and `wearable_equips` is where
 * they put it, not proof they chose a face. Clearing it here would be an
 * identity correction reaching into the collectible economy — the one thing
 * this module says it will not do — and it would take a hat off somebody who
 * only wanted their hair back. The customiser can take it off in one tap; a
 * commissioner cannot put it back.
 *
 * ## It works on an unclaimed name, and that is the launch case
 *
 * The likeliest reason to need this is the one `releaseName` creates: the wrong
 * person claimed a name, dressed a character on it, and the name has since been
 * released. The row is then attached to a manager with no PIN, and refusing to
 * touch it because "nobody holds that key" would leave the correction impossible
 * exactly when it is wanted.
 */
export async function resetCharacterSelection(
  db: Database,
  input: { readonly actorUserId: string; readonly subjectUserId: string },
): Promise<CorrectionResult> {
  const subject = await correctionSubject(db, input.subjectUserId);
  if (subject === null) return { ok: false, refusal: 'not-in-league' };

  const at = now();

  const changed = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(characterConfigurations)
      .where(eq(characterConfigurations.userId, subject.id))
      .returning({ userId: characterConfigurations.userId });

    await tx.insert(adminAuditLogs).values({
      actorUserId: input.actorUserId,
      action: 'character_reset',
      subjectUserId: subject.id,
      /*
       * `cleared: false` is the interesting row. It is the record of a
       * commissioner correcting something that turned out not to need it, and a
       * trail that only recorded successful deletions could not tell that from
       * a correction nobody ever made.
       */
      details: { cleared: removed.length > 0 },
      occurredAt: at,
    });

    return removed.length > 0;
  });

  return { ok: true, kind: 'reset-character', subject: { ...subject, characterChosen: false }, changed };
}

/**
 * Is this correction offered for this manager right now?
 *
 * Read by the screen so a control that would only ever be refused is **absent**
 * rather than present and disabled — the same call the draft board makes. The
 * services above re-check every one of these, because a hidden button is not
 * authorization (`09 §9`) and a screen can be a minute old.
 */
export function correctionAvailable(
  kind: CorrectionKind,
  subject: CorrectionSubject,
  actorUserId: string,
): boolean {
  if (kind === 'release-name') return subject.claimed && subject.id !== actorUserId;
  return subject.characterChosen;
}

/** What each correction is called on the screen, and what it does in one line. */
export const CORRECTION_COPY: Readonly<
  Record<CorrectionKind, { readonly title: string; readonly summary: string }>
> = {
  'release-name': {
    title: 'Release this name',
    summary: 'Takes the key back and puts the name on the door for whoever it belongs to.',
  },
  'reset-character': {
    title: 'Reset their character',
    summary: 'Clears the saved look so the mirror greets them with Tony’s guess again.',
  },
};

/** Run one correction by name. The screen has a kind; the services have jobs. */
export async function applyCorrection(
  db: Database,
  kind: CorrectionKind,
  input: { readonly actorUserId: string; readonly subjectUserId: string },
): Promise<CorrectionResult> {
  return kind === 'release-name'
    ? releaseName(db, input)
    : resetCharacterSelection(db, input);
}

/** What the office says after a correction lands. Plain, and specific about what moved. */
export function correctionOutcome(result: CorrectionResult, displayName: string): string {
  if (!result.ok) return CORRECTION_REFUSALS[result.refusal];

  if (result.kind === 'release-name') {
    return `${displayName} is back on the door. They were signed out everywhere, and their PIN is gone — nobody, including you, can read it.`;
  }

  return result.changed
    ? `${displayName}'s saved look is cleared. The next time they open the mirror it will be their first run again.`
    : `${displayName} had never saved a look, so there was nothing to clear. The mirror already greets them with Tony's guess.`;
}
