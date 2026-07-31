/**
 * Take delivery of an art batch, end to end, in one command.
 *
 *   npm run art:batch                 # Batch B — the eight that close M2
 *   npm run art:batch -- B2
 *   npm run art:batch -- B --register # also flip the registry rows to `final`
 *   npm run art:batch -- B --no-shots # skip the screenshots
 *
 * ## Why this exists
 *
 * The pieces were already here — `art:process`, `art:validate`, the registry, the
 * visual driver — and the sequence connecting them lived in a Markdown file. That
 * is the shape of a step that gets skipped: the day eight PNGs finally arrive is
 * the day somebody runs two of the four commands, sees green, and ships a batch
 * where three sprites never reached `public/`.
 *
 * So the sequence is a program. **No feature code changes when the art arrives** —
 * that was always true — and now no procedure has to be remembered either.
 *
 * ## What it will not do
 *
 * **It does not decide whether the drawings are any good.** Everything here is
 * arithmetic and file plumbing; the screenshots exist so a person can answer the
 * only question that is not arithmetic, which is `§5.3` of the handoff: *would a
 * manager who pulled this be pleased?*
 *
 * **It does not register anything unless asked.** `art/ASSET_PIPELINE.md` makes
 * registration a reviewed edit, because flipping an asset live is a decision
 * rather than a build step. `--register` is that decision, taken on purpose, and
 * the report tells you exactly which rows it would touch.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { artBatch, type ArtBatch } from '@/lib/assets/batches';

import { inspect } from './validate-collectible';

const INCOMING = path.join(process.cwd(), 'art', 'incoming');
const PRODUCTION = path.join(process.cwd(), 'public', 'assets', 'collectible');
const INVENTORY = path.join(process.cwd(), 'art', 'assets.inventory.json');

/** The three surfaces a collectible has to survive, and the states that show them. */
const SCREENSHOT_STATES = [
  'reveal-common',
  'reveal-rare',
  'reveal-epic',
  'reveal-legendary',
  'collection',
  'demo-collection-full',
  'showcase',
] as const;

type Status = 'ok' | 'missing' | 'failed' | 'skipped';

interface Row {
  slug: string;
  received: string | null;
  processed: Status;
  validated: Status;
  registry: Status;
  notes: string[];
}

/* ------------------------------------------------------------------ files -- */

/**
 * Match `<slug>_NN.png` in `art/incoming/`, exactly one per slug.
 *
 * Two failures are refusals rather than warnings, and both were chosen after
 * asking what the *quiet* version of each looks like. A missing sprite leaves its
 * item drawing the placeholder — a legitimate state, so nothing looks broken.
 * A duplicate means somebody generated a second attempt, and taking the first by
 * sort order is taking one at random and calling it a decision.
 */
function matchIncoming(batch: ArtBatch): {
  matched: Map<string, string>;
  duplicates: Map<string, string[]>;
  unexpected: string[];
} {
  const files = existsSync(INCOMING)
    ? readdirSync(INCOMING).filter((name) => name.toLowerCase().endsWith('.png'))
    : [];

  const matched = new Map<string, string>();
  const duplicates = new Map<string, string[]>();
  const claimed = new Set<string>();

  for (const slug of batch.slugs) {
    // `collectible_coffee_mug_01.png` and `collectible_coffee_mug.png` both count.
    // A prefix match would also claim `collectible_coffee_mug_holder_01.png`, so
    // the tail after the slug has to be a generation number or nothing at all.
    const hits = files.filter((name) => new RegExp(`^${slug}(?:_\\d+)?\\.png$`, 'i').test(name));
    for (const hit of hits) claimed.add(hit);
    if (hits.length === 1) matched.set(slug, hits[0]!);
    else if (hits.length > 1) duplicates.set(slug, hits.sort());
  }

  return { matched, duplicates, unexpected: files.filter((name) => !claimed.has(name)) };
}

/* --------------------------------------------------------------- registry -- */

interface InventoryRow {
  canvas?: string;
  anchor?: string;
  art_status?: string;
  rarity?: string;
}

function inventory(): Record<string, unknown> {
  return JSON.parse(readFileSync(INVENTORY, 'utf8')) as Record<string, unknown>;
}

/** Find a slug's row wherever its group happens to be. */
function findRow(
  json: Record<string, unknown>,
  slug: string,
): { group: string; row: InventoryRow } | null {
  const assets = json['assets'] as Record<string, Record<string, InventoryRow>> | undefined;
  if (assets === undefined) return null;
  for (const [group, entries] of Object.entries(assets)) {
    const row = entries[slug];
    if (row !== undefined && typeof row === 'object') return { group, row };
  }
  return null;
}

/**
 * Check the row the sprite has to draw into, and optionally mark it delivered.
 *
 * `canvas` and `anchor` are checked rather than assumed because they have been
 * wrong before: every collectible was registered at `32x32` while the slot it
 * draws into is 46 — a 1.4375× resample that would have blurred every sprite in
 * this batch, and that was only discoverable *after* they were drawn
 * (`lib/assets/art-slots.test.ts` now fails the build for it).
 */
function checkRegistry(slug: string, register: boolean): { status: Status; note: string | null } {
  const json = inventory();
  const found = findRow(json, slug);
  if (found === null) return { status: 'failed', note: 'no row in art/assets.inventory.json' };

  const { row } = found;
  if (row.canvas !== '46x46') {
    return { status: 'failed', note: `canvas is ${String(row.canvas)}, the slot is 46x46` };
  }
  if (row.anchor !== 'bottom-center') {
    return { status: 'failed', note: `anchor is ${String(row.anchor)}, the tray anchors bottom-center` };
  }

  if (row.art_status === 'final') return { status: 'ok', note: null };

  if (!register) {
    return {
      status: 'skipped',
      note: `art_status is "${String(row.art_status)}" — re-run with --register to mark it final`,
    };
  }

  row.art_status = 'final';
  writeFileSync(INVENTORY, `${JSON.stringify(json, null, 2)}\n`);
  return { status: 'ok', note: 'art_status set to final' };
}

/* ------------------------------------------------------------------- main -- */

function run(command: string, args: readonly string[]): { ok: boolean; output: string } {
  try {
    return {
      ok: true,
      output: execFileSync(command, [...args], { encoding: 'utf8', env: process.env }),
    };
  } catch (error: unknown) {
    const shaped = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: shaped.stdout ?? shaped.stderr ?? shaped.message ?? '' };
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== '--');
  const register = argv.includes('--register');
  const shots = !argv.includes('--no-shots');
  const batch = artBatch(argv.find((arg) => !arg.startsWith('-')) ?? 'B');

  console.log(`\nBatch ${batch.key} — ${batch.shows}`);
  console.log(`  handoff  ${batch.handoff}`);
  console.log(`  expected ${String(batch.slugs.length)} sprites in art/incoming/\n`);

  const { matched, duplicates, unexpected } = matchIncoming(batch);

  const rows: Row[] = batch.slugs.map((slug) => ({
    slug,
    received: matched.get(slug) ?? null,
    processed: 'missing',
    validated: 'missing',
    registry: 'missing',
    notes: [],
  }));

  const byslug = new Map(rows.map((row) => [row.slug, row]));

  for (const [slug, hits] of duplicates) {
    const row = byslug.get(slug)!;
    row.processed = 'failed';
    row.notes.push(`${String(hits.length)} candidates: ${hits.join(', ')} — leave exactly one`);
  }

  /*
   * Process every matched sprite in one call.
   *
   * `art:process` takes slug filters, and passing all of them at once means the
   * palette is loaded and the quantizer built once. Its failure output is kept
   * verbatim: a quantizer complaint names the colour it could not place, and
   * paraphrasing that would throw away the only actionable part.
   */
  if (matched.size > 0) {
    const result = run('npx', ['tsx', 'scripts/process-art.ts', ...matched.keys()]);
    if (!result.ok) console.error(result.output);
    for (const slug of matched.keys()) {
      const row = byslug.get(slug)!;
      const landed = existsSync(path.join(PRODUCTION, `${slug}.png`));
      row.processed = landed ? 'ok' : 'failed';
      if (!landed) row.notes.push('art:process produced no file — see its output above');
    }
  }

  for (const row of rows) {
    if (row.processed !== 'ok') continue;

    const findings = await inspect(row.slug, path.join(PRODUCTION, `${row.slug}.png`));
    row.validated = findings.length === 0 ? 'ok' : 'failed';
    for (const finding of findings) row.notes.push(`[${finding.rule}] ${finding.detail}`);

    const registry = checkRegistry(row.slug, register);
    row.registry = registry.status;
    if (registry.note !== null) row.notes.push(registry.note);
  }

  /* ---- screenshots ---- */

  const shotResults: { state: string; status: Status; note: string | null }[] = [];
  const complete = rows.every((row) => row.validated === 'ok');

  if (!shots) {
    for (const state of SCREENSHOT_STATES) {
      shotResults.push({ state, status: 'skipped', note: '--no-shots' });
    }
  } else if (!complete) {
    // Photographing a half-delivered batch produces screenshots that mix new art
    // with placeholders and look like a review artefact. Skipped, loudly.
    for (const state of SCREENSHOT_STATES) {
      shotResults.push({ state, status: 'skipped', note: 'batch is not complete and valid' });
    }
  } else {
    for (const state of SCREENSHOT_STATES) {
      const result = run('npx', ['tsx', 'scripts/visual-qa.mts', `--state=${state}`]);
      shotResults.push({
        state,
        status: result.ok ? 'ok' : 'failed',
        note: result.ok ? null : firstLine(result.output),
      });
    }
  }

  /* ---- the report ---- */

  const width = Math.max(...rows.map((row) => row.slug.length));
  const mark = (status: Status): string =>
    status === 'ok' ? '  ok  ' : status === 'missing' ? 'MISSING' : status === 'skipped' ? ' skip ' : ' FAIL ';

  console.log(
    `  ${'asset'.padEnd(width)}  ${'received'.padEnd(34)}  process  validate  registry`,
  );
  console.log(`  ${'-'.repeat(width)}  ${'-'.repeat(34)}  -------  --------  --------`);
  for (const row of rows) {
    console.log(
      `  ${row.slug.padEnd(width)}  ${(row.received ?? '—').padEnd(34)}  ` +
        `${mark(row.processed).padEnd(7)}  ${mark(row.validated).padEnd(8)}  ${mark(row.registry)}`,
    );
    for (const note of row.notes) console.log(`  ${' '.repeat(width)}  ↳ ${note}`);
  }

  console.log('\n  screenshots');
  for (const shot of shotResults) {
    console.log(`    ${shot.state.padEnd(22)} ${mark(shot.status)}${shot.note === null ? '' : `  ${shot.note}`}`);
  }

  if (unexpected.length > 0) {
    console.log(`\n  ${String(unexpected.length)} file(s) in art/incoming/ that this batch did not expect:`);
    for (const name of unexpected) console.log(`    ${name}`);
    console.log('    Either they belong to another batch or a filename is wrong.');
  }

  const failures = rows.filter((row) => row.processed !== 'ok' || row.validated !== 'ok').length;
  const shotFailures = shotResults.filter((shot) => shot.status === 'failed').length;

  console.log('');
  if (failures === 0 && shotFailures === 0 && complete) {
    console.log(
      `  Batch ${batch.key} is in. ${String(rows.length)} sprites processed, validated and photographed.\n` +
        (register
          ? '  Registry rows are marked final.\n'
          : '  Registry rows are still `placeholder` — re-run with --register when you are happy with the screenshots.\n'),
    );
    return;
  }

  console.error(
    `  Batch ${batch.key} is not in. ${String(failures)} asset(s) and ` +
      `${String(shotFailures)} screenshot state(s) need attention.\n` +
      `  Every line marked FAIL or MISSING above names its own fix.\n`,
  );
  process.exit(1);
}

function firstLine(text: string): string {
  return (text.split('\n').find((line) => line.trim() !== '') ?? '').trim().slice(0, 120);
}

// Same guard as the other art scripts: they compile to CJS, where a top-level
// await is a syntax error rather than a style choice.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`\nBatch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
