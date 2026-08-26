import Link from 'next/link';

import { applyCorrectionAction } from '@/app/actions/admin-corrections';
import { PanelHeading, ReturnPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import {
  MetadataStrip,
  Plaque,
  PrintedRule,
  SectionHeading,
  WarningBlock,
} from '@/components/scene/text-surface';
import { Page, TAP_TARGET } from '@/components/shell';
import { DeskExit, DeskPanel, StampButton } from '@/components/slice/review';
import { requireAdmin } from '@/lib/auth/current-user';
import {
  CORRECTION_COPY,
  CORRECTION_KINDS,
  CORRECTION_REFUSALS,
  correctionAvailable,
  correctionOutcome,
  correctionSubject,
  isCorrectionKind,
  listCorrectionSubjects,
  type CorrectionKind,
  type CorrectionRefusal,
  type CorrectionSubject,
} from '@/lib/admin/corrections';
import { getDb } from '@/lib/db';
import { TYPE } from '@/lib/design/type';

/**
 * Corrections — the drawer in the office where launch-week mistakes get fixed.
 *
 * ## Why this is a screen and not two more buttons on the key board
 *
 * The key board answers *"somebody texted me, they cannot get in."* One control,
 * one row, reached without reading anything. These are different: a correction
 * changes what somebody's identity **is**, so the commissioner has to know which
 * manager, which correction, and what it will and will not touch before they
 * press anything. Three more controls per row on a 390-wide phone would have put
 * that decision on a list, where the gesture is a tap and not a decision.
 *
 * ## Three screens, one route
 *
 * `/admin/corrections` is the league · `?subject=<id>` is one manager and what
 * can be corrected about them · `?subject=<id>&do=<kind>` is the confirmation,
 * which is the only screen with a button on it. The confirmation exists to be
 * read: it names the manager, says in plain words what will happen, and says
 * what will **not** — the tokens, the collection, the room. A correction whose
 * blast radius a reader has to infer is a correction they will avoid using.
 *
 * The same reasoning the press desk recorded when it refused an Approve button
 * on the queue row: *"a button bar at the top would make approving without
 * reading the default gesture."* A correction on the list would be that, one
 * screen earlier.
 *
 * ## A control that would only be refused is absent, not disabled
 *
 * `correctionAvailable` decides, and the sentence beside the manager says why
 * instead — the draft board's convention. The services re-check every rule
 * regardless, because a hidden button is not authorization (`09 §9`) and this
 * screen can be a minute old.
 *
 * `requireAdmin()` answers with `notFound()`, so a manager probing this URL
 * learns nothing about whether it exists.
 */

export const dynamic = 'force-dynamic';

/** Why a correction is not on offer for this manager, in one sentence each. */
function unavailableBecause(kind: CorrectionKind, subject: CorrectionSubject, actorId: string): string {
  if (kind === 'release-name') {
    return subject.id === actorId
      ? 'This is your own name. Releasing it would sign you out mid-action.'
      : 'This name is on the hook already — nobody has set a PIN against it.';
  }
  return 'They have never saved a look, so the mirror already greets them with Tony’s guess.';
}

/**
 * What each correction touches, and what it leaves alone.
 *
 * Both halves are written down for both corrections, and the second half is the
 * load-bearing one. *"This does not touch their tokens, their collection or
 * their room"* is the sentence that makes a correction safe to press, and it is
 * only true because `lib/admin/corrections.ts` says it is — the module refuses
 * to reach into the economy at all.
 */
const CONFIRMATION: Readonly<
  Record<CorrectionKind, { readonly moves: readonly string[]; readonly leaves: readonly string[] }>
> = {
  'release-name': {
    moves: [
      'Their PIN is cleared. Nobody, including you, can read what it was.',
      'Every device signed in as them is signed out immediately.',
      'The name goes back on the door for whoever it belongs to.',
    ],
    leaves: [
      'Their tokens, their collection and their room are untouched.',
      'A character saved against this name stays. Reset it separately if the wrong person made it.',
      'Nothing on the league’s side changes — no scores, no history, no paper.',
    ],
  },
  'reset-character': {
    moves: [
      'The saved look is cleared — skin, hair, facial hair and top.',
      'The next time they open the mirror, it is their first run again.',
    ],
    leaves: [
      'Their tokens, their collection and their room are untouched.',
      'Anything they are wearing stays on. It is theirs, and they can take it off in one tap.',
      'Their name, their PIN and their sessions are untouched. They stay signed in.',
    ],
  },
};

export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireAdmin();
  const db = getDb();
  const query = await searchParams;

  const one = (key: string): string | null =>
    typeof query[key] === 'string' ? (query[key] as string) : null;

  const subjectId = one('subject');
  const subject = subjectId === null ? null : await correctionSubject(db, subjectId);

  const asked = one('do');
  const kind = isCorrectionKind(asked) ? asked : null;

  const refused = one('refused');
  const done = one('done');
  const changed = one('result') === 'changed';

  /* ------------------------------------------------------------------ *
   * The confirmation. One manager, one correction, and the only button.
   * ------------------------------------------------------------------ */
  if (subject !== null && kind !== null && correctionAvailable(kind, subject, user.id)) {
    const copy = CORRECTION_COPY[kind];
    const detail = CONFIRMATION[kind];

    return (
      <Screen marker="confirm">
        <Plaque tone="stop">Confirm</Plaque>
        <div className="mt-3.5">
          <PanelHeading>{copy.title}</PanelHeading>
        </div>

        <p className={`mt-2 ${TYPE.bodyLead} text-ink-900`}>{subject.displayName}</p>
        {subject.teamName !== null && (
          <MetadataStrip className="mt-1">{subject.teamName}</MetadataStrip>
        )}

        <div className="mt-4">
          <WarningBlock tone="stop" title="What this does">
            <ul className="space-y-1.5">
              {detail.moves.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </WarningBlock>
        </div>

        <div className="mt-3">
          <WarningBlock tone="quiet" title="What it leaves alone">
            <ul className="space-y-1.5">
              {detail.leaves.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </WarningBlock>
        </div>

        <p className={`mt-4 ${TYPE.body} text-ink-700`}>
          This is written down against your name and theirs, with the time, the moment you press
          it.
        </p>

        {/*
          * The button, last and below everything there is to read. The subject
          * and the correction travel as hidden fields; who is pressing it does
          * not, because the action takes that from the session.
          */}
        <form action={applyCorrectionAction} className="mt-4">
          <input type="hidden" name="userId" value={subject.id} />
          <input type="hidden" name="kind" value={kind} />
          <StampButton tone="stop">{copy.title}</StampButton>
        </form>

        <div className="mt-3">
          <BackLink href={`/admin/corrections?subject=${subject.id}`}>
            Not this — go back
          </BackLink>
        </div>
      </Screen>
    );
  }

  /* ------------------------------------------------------------------ *
   * One manager, and what can be corrected about them.
   * ------------------------------------------------------------------ */
  if (subject !== null) {
    return (
      <Screen
        marker="subject"
        exit="/admin/corrections"
        exitLabel={<>&larr;&nbsp;&nbsp;All managers</>}
      >
        <Plaque tone="stop">Staff only</Plaque>
        <div className="mt-3.5">
          <PanelHeading>{subject.displayName}</PanelHeading>
        </div>

        <MetadataStrip className="mt-1.5">
          {subject.claimed ? 'Key taken' : 'On the hook'} &middot;{' '}
          {subject.characterChosen ? 'Look saved' : 'Tony’s guess'}
        </MetadataStrip>

        {refused !== null && (
          <div className="mt-4">
            <WarningBlock tone="stop" title="Nothing was changed">
              {CORRECTION_REFUSALS[refused as CorrectionRefusal] ??
                'That was not a correction this office can make.'}
            </WarningBlock>
          </div>
        )}

        {done !== null && isCorrectionKind(done) && (
          <div className="mt-4">
            <WarningBlock tone="go" title="Done" data-correction-done={done}>
              {correctionOutcome(
                { ok: true, kind: done, subject, changed },
                subject.displayName,
              )}
            </WarningBlock>
          </div>
        )}

        <section className="mt-6" data-correction-list="">
          <PrintedRule weight="heavy" />
          <div className="mt-2">
            <SectionHeading ink="text-ink-500">Corrections</SectionHeading>
          </div>

          <ul className="mt-2.5 space-y-3">
            {CORRECTION_KINDS.map((available) => {
              const copy = CORRECTION_COPY[available];
              const offered = correctionAvailable(available, subject, user.id);

              return (
                <li key={available}>
                  {offered ? (
                    <Link
                      href={`/admin/corrections?subject=${subject.id}&do=${available}`}
                      data-correction={available}
                      className={`pixel-edge flex ${TAP_TARGET} w-full flex-col justify-center border-2 border-red-dark bg-red-dark/10 px-3 py-2.5 active:translate-y-px`}
                    >
                      <span className={`${TYPE.action} text-red-dark`}>{copy.title}</span>
                      <span className={`mt-1 ${TYPE.bodyCompact} text-ink-700`}>
                        {copy.summary}
                      </span>
                    </Link>
                  ) : (
                    <div
                      data-correction-unavailable={available}
                      className="border-2 border-dashed border-ink-300 px-3 py-2.5"
                    >
                      <p className={`${TYPE.action} text-ink-500`}>{copy.title}</p>
                      <p className={`mt-1 ${TYPE.bodyCompact} text-ink-700`}>
                        {unavailableBecause(available, subject, user.id)}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </Screen>
    );
  }

  /* ------------------------------------------------------------------ *
   * The league. Names only — the decision is on the next screen.
   * ------------------------------------------------------------------ */
  const managers = await listCorrectionSubjects(db);

  return (
    <Screen marker="league" exit="/admin" exitLabel={<>&larr;&nbsp;&nbsp;The office</>}>
      <Plaque tone="stop">Staff only</Plaque>
      <div className="mt-3.5">
        <PanelHeading>Corrections</PanelHeading>
      </div>

      <p className={`mt-2 ${TYPE.body} text-ink-700`}>
        Launch-night mistakes, one manager at a time: the wrong name taken off the door, or a look
        saved by accident. Pick a name to see what can be put right.
      </p>

      <section className="mt-6" data-correction-league="">
        <PrintedRule weight="heavy" />
        <div className="mt-2">
          <SectionHeading ink="text-ink-500">The league</SectionHeading>
        </div>

        {managers.length === 0 ? (
          <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>
            Nobody holds a seat this season, so there is nobody to correct.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {managers.map((manager) => (
              <li key={manager.id}>
                <Link
                  href={`/admin/corrections?subject=${manager.id}`}
                  data-correction-subject={manager.id}
                  className={`pixel-edge flex ${TAP_TARGET} w-full flex-col justify-center border-2 border-ink-900/25 bg-paper-white/45 px-3 py-2.5 active:translate-y-px`}
                >
                  <span className={`${TYPE.bodyCompact} text-ink-900`}>{manager.displayName}</span>
                  <MetadataStrip className="mt-1">
                    {manager.claimed ? 'Key taken' : 'On the hook'} &middot;{' '}
                    {manager.characterChosen ? 'Look saved' : 'Tony’s guess'}
                  </MetadataStrip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={`mt-6 ${TYPE.body} text-ink-500`}>
        Nothing here moves a token, opens a box, or empties a room. There is no reset for the whole
        league — every correction names one manager and is written down against them.
      </p>
    </Screen>
  );
}

/**
 * The desk this screen sits on.
 *
 * One wrapper for all three views, so the frame, the exit and the marker cannot
 * drift between them — the defect `DeskField` records, one screen up.
 *
 * `data-corrections` proves the desk really rendered: `requireAdmin()` answers
 * `notFound()`, and a 404 photographs cleanly and files under the state's name.
 * The gate reads the marker, not the pixels.
 */
function Screen({
  marker,
  exit = null,
  exitLabel = null,
  children,
}: {
  marker: 'league' | 'subject' | 'confirm';
  exit?: string | null;
  exitLabel?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <RoomBehind />

      <Page>
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8" data-corrections={marker}>
          <DeskPanel>{children}</DeskPanel>

          {exit !== null && (
            <div className="mt-6">
              <DeskExit href={exit}>{exitLabel}</DeskExit>
            </div>
          )}

          <div className="mt-3">
            <ReturnPlate />
          </div>
        </main>
      </Page>
    </>
  );
}

/** The way out of a confirmation, on paper rather than as a door plate. */
function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex min-h-[48px] w-full items-center justify-center border-2 border-ink-900/30 bg-paper-white/45 ${TYPE.action} text-ink-700 active:translate-y-px`}
    >
      {children}
    </Link>
  );
}
