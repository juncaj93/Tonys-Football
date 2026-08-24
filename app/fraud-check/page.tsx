import { PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { TYPE } from '@/lib/design/type';
import { requireUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { fraudCheck } from '@/lib/league/fraud-check';

/**
 * Tony's all-play ledger.
 *
 * This is not a replacement standings page. It is the single, inspectable
 * place where the league can see the transparent all-play calculation behind a
 * joke about a soft schedule: every team score is compared with all nine other
 * scores in a ten-team week.
 */
export const dynamic = 'force-dynamic';

export default async function FraudCheckPage() {
  await requireUser();
  const check = await fraudCheck(getDb());

  return (
    <>
      <RoomBehind />

      <Page>
        <main className="mx-auto w-full max-w-[420px] flex-1 px-4 pt-5 pb-8">
          <SignPlate tone="red">Tony&rsquo;s Fraud Check</SignPlate>
          <h1 className={`mt-4 ${TYPE.sign} text-paper-mid`}>The all-play ledger</h1>
          <p className={`mt-2 ${TYPE.body} text-paper-mid/80`}>
            Every score goes up against the other nine scores from its week. Tony keeps the
            official standings; this is the receipt beside them.
          </p>

          {check === null ? (
            <PixelPanel tone="paper" className="mt-5 px-4 py-4">
              <p className={`${TYPE.bodyLead} text-ink-900`}>The ledger is still blank.</p>
              <p className={`mt-2 ${TYPE.body} text-ink-700`}>
                Tony needs a completed, verified season before he starts circling anybody&rsquo;s
                record in red.
              </p>
            </PixelPanel>
          ) : (
            <>
              <PixelPanel tone="paper" className="mt-5 px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={`${TYPE.sectionHeading} text-ink-900`}>Season {String(check.season)}</h2>
                  <span className={`${TYPE.eyebrow} text-wood-mid`}>
                    {String(check.weeksCounted)} weeks counted
                  </span>
                </div>
                <p className={`mt-3 ${TYPE.bodyCompact} text-ink-700`}>
                  Official record is the real league record. All-play is a computed comparison,
                  never a league result.
                </p>
              </PixelPanel>

              <div className="mt-4 space-y-3">
                {check.lines.map((line) => (
                  <PixelPanel key={line.managerId} tone="paper" className="overflow-hidden px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className={`${TYPE.sectionHeading} text-ink-900`}>{line.displayName}</h2>
                      {line.tonyStamp !== null ? (
                        <SignPlate tone="red" className="shrink-0">
                          {line.tonyStamp}
                        </SignPlate>
                      ) : null}
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t-2 border-dashed border-paper-dark pt-3">
                      <div>
                        <dt className={`${TYPE.eyebrow} text-ink-500`}>Official</dt>
                        <dd className={`mt-1 ${TYPE.ledgerValue} text-ink-900`}>{line.officialRecord}</dd>
                      </div>
                      <div>
                        <dt className={`${TYPE.eyebrow} text-ink-500`}>All-play</dt>
                        <dd className={`mt-1 ${TYPE.ledgerValue} text-ink-900`}>{line.allPlayRecord}</dd>
                      </div>
                      <div>
                        <dt className={`${TYPE.eyebrow} text-ink-500`}>Schedule</dt>
                        <dd className={`mt-1 ${TYPE.ledgerValue} text-red-dark`}>{line.scheduleDelta}</dd>
                      </div>
                    </dl>
                    {line.tonyStamp !== null ? (
                      <p className={`mt-3 ${TYPE.bodyCompact} text-ink-700`}>
                        Tony&rsquo;s sticker, not an official verdict: the schedule gave this record at
                        least two more wins than its all-play rate over the same games.
                      </p>
                    ) : null}
                  </PixelPanel>
                ))}
              </div>

              <PixelPanel tone="board" className="mt-4 px-4 py-3">
                <p className={`${TYPE.bodyCompact} text-paper-mid/90`}>{check.disclaimer}</p>
                {check.excludedWeeks.length > 0 ? (
                  <p className={`mt-2 ${TYPE.bodyCompact} text-paper-mid/75`}>
                    Weeks left out whole: {check.excludedWeeks.join(', ')}. One disputed score
                    would change everybody&rsquo;s comparison, so Tony leaves that week off the board.
                  </p>
                ) : null}
              </PixelPanel>
            </>
          )}

          <div className="mt-6">
            <ReturnPlate />
          </div>
        </main>
      </Page>
    </>
  );
}
