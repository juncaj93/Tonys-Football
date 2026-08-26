import { TYPE } from '@/lib/design/type';

type SliceReward = {
  readonly reason: 'MATCHUP_WIN' | 'WEEKLY_HIGH_SCORE';
  readonly amount: number;
};

/** A manager-only receipt mounted beneath this week's printed Slice. */
export function SliceRewardSlip({ rewards }: { rewards: readonly SliceReward[] }) {
  if (rewards.length === 0) return null;

  const highScore = rewards.find((reward) => reward.reason === 'WEEKLY_HIGH_SCORE');
  const total = rewards.reduce((sum, reward) => sum + reward.amount, 0);

  return (
    <aside
      data-slice-reward=""
      className="pixel-edge mt-4 border-2 border-wood-dark bg-paper-mid px-4 py-3 shadow-[3px_3px_0_var(--color-wood-dark)]"
      aria-label="This week's Tony Token receipt"
    >
      <p className={`${TYPE.eyebrow} text-red-dark`}>TONY&apos;S TOKEN RECEIPT</p>
      <div className="mt-2 flex items-end justify-between gap-3 border-t-2 border-ink-900/25 pt-2">
        <div>
          <h2 className={`${TYPE.subhead} text-ink-900`}>
            {highScore === undefined ? 'MATCHUP WIN' : 'TOP SCORE BONUS'}
          </h2>
          <p className={`mt-1 ${TYPE.bodyCompact} text-ink-700`}>
            {highScore === undefined
              ? 'Tony marked down your win and put the tokens in your tab.'
              : 'Highest score of the week. Tony put the bonus straight in your tab.'}
          </p>
        </div>
        <strong className={`${TYPE.ledgerValue} shrink-0 text-red-dark`}>+{String(total)}</strong>
      </div>
    </aside>
  );
}
