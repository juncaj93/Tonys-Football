import { Ledger, LedgerRow } from '@/components/scene/text-surface';
import { TYPE } from '@/lib/design/type';

/**
 * The statement — what has moved on a manager's tab lately.
 *
 * ## Why this exists at all
 *
 * `03 §5`: *"Never treat `season_users.tokens` as the only record of truth. The
 * displayed balance should reconcile to the ledger."* Until weekly rewards there
 * was nothing to reconcile — a balance moved when you bought a box, and you had
 * just bought the box. Now tokens arrive on a Tuesday, from a cron, for a game
 * played on Sunday, and a number that changes while nobody is looking needs to be
 * able to say why.
 *
 * `recentTransactions` has been written and unused since the ledger shipped. This
 * is its first caller, which is why nothing here is new machinery.
 *
 * ## It renders the ledger's own words, and derives nothing
 *
 * The description on each row is the curated template the writer stored
 * (`03 §5`), and the sign is the sign the ledger recorded. This component does no
 * arithmetic, keeps no running total, and does not re-derive a balance by summing
 * — the balance is a trigger-maintained column and a second opinion computed in a
 * browser would be a second opinion about money.
 */

export interface TabMovement {
  readonly amount: number;
  readonly description: string;
}

export function Tab({ movements }: { readonly movements: readonly TabMovement[] }) {
  return (
    /*
     * Movements only — **no balance row**.
     *
     * `BuyBox` states the balance three lines above this, and the counter page's
     * own comment records what happens when one fact is rendered twice a few
     * lines apart: it reads as a defect. The heading names the tab; these rows
     * say what has happened to it.
     */
    <Ledger data-tab-movements={String(movements.length)}>
      {movements.map((movement, index) => (
        <LedgerRow
          /*
           * Index as the key.
           *
           * A ledger row has no natural id exposed here, and the list is
           * append-only, read-only and never reordered — the three conditions
           * under which an index key is actually correct rather than merely
           * convenient.
           */
          key={index}
          kind="name"
          label={movement.description}
          /*
           * The sign, explicitly.
           *
           * `+150` and `-50` on a statement are different in kind, and a bare
           * `150` next to a bare `50` makes a manager work out which was which
           * from the wording beside it. `Intl` is not involved: these are whole
           * tokens, and a locale that groups them differently would make two
           * managers' screenshots disagree about the same fact.
           */
          value={`${movement.amount > 0 ? '+' : '−'}${String(Math.abs(movement.amount))}`}
        />
      ))}
      {movements.length === 0 && (
        <div className="px-3 py-2.5">
          <p className={`${TYPE.bodyCompact} text-ink-700`}>
            Nothing on it yet. Tony writes it down when something moves.
          </p>
        </div>
      )}
    </Ledger>
  );
}
