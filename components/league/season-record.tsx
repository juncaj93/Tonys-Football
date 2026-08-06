import { type TimelineSeason } from '@/lib/league/timeline';
import { TYPE } from '@/lib/design/type';

/**
 * One season on the wall.
 *
 * ## It computes nothing
 *
 * Same rule as `components/slice/presentation.tsx`, and enforced the same way by
 * `season-record.test.tsx`: this file may not import `lib/stats`, `lib/db` or
 * `lib/league/timeline`'s query, and may not do arithmetic on a fantasy number.
 * Every value here arrives already derived and already ranked. A component that
 * compares two scores is a component that can disagree with the Slice about what
 * happened, and there is no way to notice when it does.
 *
 * The one thing it is allowed to decide is **wording** — `over` against `edged`
 * is presentation, not arithmetic, and it is chosen from a boolean the
 * derivation supplies rather than from a comparison made here.
 */

/** What a fact is called on this wall. Presentation, not classification. */
const KIND_LABEL = {
  'largest-margin': 'Biggest win',
  'closest-game': 'Closest game',
} as const;

export function SeasonRecord({ season }: { season: TimelineSeason }) {
  return (
    <div id={String(season.year)} className="scroll-mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`${TYPE.sectionHeading} text-ink-900`}>{String(season.year)}</h2>
        {season.current ? (
          <span className={`${TYPE.eyebrow} text-wood-mid`}>In progress</span>
        ) : null}
      </div>

      <span aria-hidden="true" className="mt-2 block h-[2px] w-full bg-amber-mid/45" />

      {season.champion === null ? (
        <p className={`mt-3 ${TYPE.body} text-ink-700`}>
          {season.quietBecause ?? 'No champion on record.'}
        </p>
      ) : (
        <>
          <p className={`mt-3 ${TYPE.headline} text-ink-900`}>{season.champion}</p>
          <p className={`mt-1 ${TYPE.eyebrow} text-wood-mid`}>Champion</p>
        </>
      )}

      {season.facts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {season.facts.map((fact) => (
            <li key={fact.id}>
              <p className={`${TYPE.eyebrow} text-ink-500`}>
                {KIND_LABEL[fact.kind]} · Week {fact.week}
              </p>
              {/*
                * The two scores are the loudest thing in the row, because they
                * are what the row is about. The same correction the Slice's
                * board needed — a score printed quieter than its label reads as
                * a caption for a number nobody can find.
                */}
              <p className={`mt-0.5 ${TYPE.body} text-ink-900`}>
                <span className={TYPE.ledgerValue}>{fact.winnerPoints}</span>
                {' — '}
                <span className={TYPE.ledgerValue}>{fact.loserPoints}</span>
              </p>
              <p className={`mt-0.5 ${TYPE.bodyCompact} text-ink-700`}>
                {fact.winner} over {fact.loser}
              </p>
            </li>
          ))}
        </ul>
      ) : season.champion !== null && season.quietBecause !== null ? (
        <p className={`mt-4 ${TYPE.bodyCompact} text-ink-500`}>{season.quietBecause}</p>
      ) : null}

      {/*
        * The cap, said out loud.
        *
        * A reader cannot tell a short list from a trimmed one, and a page that
        * shows two of thirty-two without saying so is claiming the season had
        * two things worth recording.
        */}
      {season.moreFacts > 0 ? (
        <p className={`mt-3 ${TYPE.eyebrow} text-ink-500`}>
          {String(season.moreFacts)} more on record
        </p>
      ) : null}
    </div>
  );
}
