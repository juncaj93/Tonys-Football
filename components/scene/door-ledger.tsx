import { TYPE } from '@/lib/design/type';

/**
 * The front counter's key ledger.
 *
 * Signing in is not an exterior promo page or a generic modal: it is the
 * little book Tony keeps just behind the counter.  The scene deliberately has
 * no character art — an upside-down/reversed Tony in the old shop-window crop
 * made the first screen feel like a broken banner, not a place in the game.
 */
export function DoorLedgerHeader({ label }: { label: string }) {
  return (
    <header className="door-ledger-header" aria-hidden="true">
      <div className="door-ledger-header__lamp" />
      <div className="door-ledger-header__shelf">
        <i /><i /><i />
      </div>
      <div className="door-ledger-header__book pixel-edge">
        <span className={TYPE.eyebrow}>TONY&rsquo;S COUNTER LEDGER</span>
        <b className={TYPE.stamp}>{label}</b>
      </div>
      <div className="door-ledger-header__counter" />
    </header>
  );
}

/** A warm stationary layer for the authentication pages, never a neon gradient. */
export function DoorLedgerBackdrop() {
  return <div aria-hidden="true" className="door-ledger-backdrop" />;
}
