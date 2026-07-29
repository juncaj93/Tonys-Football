import type { AssetResolution } from './types';

/**
 * The universal placeholder: a hand-torn piece of cardboard taped to the wall.
 *
 * Drawn entirely in CSS, so it needs no generated art of its own — it is the
 * fallback beneath the fallback, available before batch B4 exists.
 *
 * `art/prompts/surface.md` explains why the placeholder is in-world rather
 * than a grey box: a grey box reads as broken software, while a taped-up sign
 * reads as a shop held together with tape, which is what this shop is. It lets
 * the product ship with most art unfinished and still look deliberate.
 */
export function PlaceholderSign({
  label,
  slug,
  className = '',
}: {
  label: string;
  slug?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex min-h-24 items-center justify-center overflow-hidden rounded-[2px] bg-paper-dark px-4 py-3 text-center shadow-[inset_0_0_0_1px_var(--color-wood-mid)] ${className}`}
      style={{ transform: 'rotate(-0.4deg)' }}
    >
      {/* Masking tape, deliberately crooked. */}
      <span
        aria-hidden="true"
        className="absolute -top-1.5 -left-3 h-5 w-14 rotate-[-24deg] bg-paper-white/50"
      />
      <span
        aria-hidden="true"
        className="absolute -top-1 -right-3 h-5 w-14 rotate-[18deg] bg-paper-white/50"
      />

      <span className="relative z-10">
        <span className="block text-sm leading-tight font-semibold text-ink-900">{label}</span>
        {slug !== undefined && (
          <span className="mt-1 block font-mono text-[10px] break-all text-ink-500">{slug}</span>
        )}
      </span>
    </div>
  );
}

/**
 * Renders any resolution.
 *
 * Art is not yet implemented because no asset has advanced past `placeholder`;
 * that branch lands with batch B1. `missing` is rendered loudly on purpose —
 * a typo'd slug should be obvious in development, not silently invisible.
 */
export function AssetView({
  resolution,
  className = '',
}: {
  resolution: AssetResolution;
  className?: string;
}) {
  if (resolution.kind === 'missing') {
    return (
      <div
        className={`flex min-h-24 items-center justify-center rounded-[2px] border-2 border-dashed border-red-mid px-4 py-3 text-center ${className}`}
      >
        <span className="font-mono text-xs break-all text-red-light">
          missing asset: {resolution.slug}
        </span>
      </div>
    );
  }

  if (resolution.kind === 'placeholder') {
    return (
      <PlaceholderSign
        label={resolution.label}
        slug={resolution.slug}
        className={className}
      />
    );
  }

  // Real art.
  //
  // `image-rendering: pixelated` is not decoration — it is the whole contract.
  // These files are authored at 32×48 and 320×228 and displayed several times
  // larger, so the browser's default smoothing would blur exactly the hard
  // edges the pipeline spent its quantization step guaranteeing.
  //
  // A plain `<img>` rather than `next/image`: the assets are static, tiny, and
  // already at their final dimensions, so there is nothing to optimize and a
  // resizing proxy would only reintroduce interpolation.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={resolution.path}
      alt={resolution.record.alt}
      width={pixelWidth(resolution.record.canvas)}
      height={pixelHeight(resolution.record.canvas)}
      className={`block h-auto w-full ${className}`}
      style={{ imageRendering: 'pixelated' }}
      draggable={false}
    />
  );
}

/** `"320x228"` → `320`. */
function pixelWidth(canvas: string): number {
  return Number(canvas.split('x')[0] ?? 0);
}

function pixelHeight(canvas: string): number {
  return Number(canvas.split('x')[1] ?? 0);
}
