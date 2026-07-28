import { type Receipt } from '@/lib/parlor/receipt';

/**
 * The receipt on the counter (`16 §2`).
 *
 * Styled as a till receipt — monospace, torn top and bottom, paper white — for
 * the same reason the placeholder is a taped-up sign rather than a grey box: a
 * card with a heading and a table is a dashboard, and this product's stated
 * failure mode is becoming a themed dashboard (`16 §1`).
 *
 * Every figure comes from the imported chain. Where there is no figure, the
 * receipt says so; it never prints a zero, because a zero reads as a result.
 */
export function ReceiptSlip({
  receipt,
  name,
}: {
  receipt: Receipt | null;
  name: string;
}) {
  return (
    <div className="relative mx-auto w-full max-w-xs bg-paper-white px-4 py-4 font-mono text-[13px] text-ink-900 shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
      <TornEdge className="-top-[5px]" />

      <p className="text-center text-[11px] tracking-[0.2em] uppercase">Tony&rsquo;s Pizza</p>
      <p className="mt-0.5 text-center text-[10px] tracking-[0.15em] text-ink-500 uppercase">
        Customer copy
      </p>

      <hr className="my-3 border-t border-dashed border-ink-300" />

      {receipt === null ? (
        <>
          <p className="text-center text-[13px] font-bold">{name}</p>
          <p className="mt-3 text-center leading-relaxed text-ink-500">
            No record on file.
            <br />
            First season starts in September.
          </p>
        </>
      ) : (
        <>
          <Row label={String(receipt.year)} value={receipt.finish} strong />
          <hr className="my-2 border-t border-dashed border-ink-300" />
          <Row label="Record" value={receipt.record} />
          <Row label="Points for" value={receipt.pointsFor.toFixed(2)} />
          <Row label="Points against" value={receipt.pointsAgainst.toFixed(2)} />
          <Row label="Roster" value={`#${String(receipt.rosterId)}`} />
        </>
      )}

      <hr className="my-3 border-t border-dashed border-ink-300" />
      <p className="text-center text-[10px] tracking-wide text-ink-500">
        Thank you. Come again Tuesday.
      </p>

      <TornEdge className="-bottom-[5px]" />
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className={strong ? 'font-bold' : 'text-ink-500'}>{label}</span>
      <span className={strong ? 'font-bold' : ''}>{value}</span>
    </div>
  );
}

/** A zig-zag tear, drawn in CSS so it needs no asset. */
function TornEdge({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-0 h-[6px] bg-paper-white ${className}`}
      style={{
        maskImage:
          'linear-gradient(-45deg, transparent 33%, black 33%, black 66%, transparent 66%)',
        maskSize: '8px 8px',
        WebkitMaskImage:
          'linear-gradient(-45deg, transparent 33%, black 33%, black 66%, transparent 66%)',
        WebkitMaskSize: '8px 8px',
      }}
    />
  );
}
