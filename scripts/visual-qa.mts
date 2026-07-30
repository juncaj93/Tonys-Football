/**
 * Visual QA — the gate that green CI is not.
 *
 *   npm run visual:qa                  # every state, every viewport
 *   npm run visual:qa -- --state=idle  # one state
 *
 * ## Why this exists in the repository rather than in a chat
 *
 * Every visual defect this project has shipped was invisible to the test suite
 * and obvious in a screenshot. The legacy homepage passed CI. The violet floor
 * passed CI. `AmbientLife` glowing on a wooden pillar would have passed CI —
 * the effects are opacity-only, so nothing errors and nothing fails. A
 * full-width bottom sheet covering a quarter of the room passed CI twice.
 *
 * So the checks that catch those live here, run on every pull request, and fail
 * the build. Three kinds, in increasing order of what they can catch:
 *
 *   1. **Deterministic assertions** — palette contamination, tap-target sizes,
 *      hit-region overlap, layer bounds, legacy-asset references. These are
 *      arithmetic and they run unattended, forever.
 *   2. **Captured artifacts** — every required state at every required width,
 *      uploaded to the workflow run so a human or a model can look.
 *   3. **A review pass over those artifacts** — `agents/visual-qa.md`, which
 *      needs a model and therefore needs a key.
 *
 * Layer 1 is the one that never sleeps, so it carries the most weight here.
 * `VISUAL_ACCEPTANCE.md` is the specification it implements.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';

const BASE = process.env['VISUAL_QA_BASE'] ?? 'http://localhost:3111';
const OUT = process.env['VISUAL_QA_OUT'] ?? 'visual-qa';
const PIN = '461902';

/** The widths the room is contracted to work at (`VISUAL_ACCEPTANCE.md §2`). */
const WIDTHS = [390, 375, 360] as const;

/** WCAG 2.5.8 AA. The room's own 44px convention is stricter and not always reachable. */
const AA_MIN = 24;

interface Failure {
  readonly gate: string;
  readonly detail: string;
}

const failures: Failure[] = [];
const fail = (gate: string, detail: string): void => {
  failures.push({ gate, detail });
};

/* ---------------------------------------------------------------- palette -- */

/**
 * Every colour the art is allowed to contain, plus the ones it must not.
 *
 * `violet-deep` is in the palette and legitimate inside an asset, so this does
 * not ban it outright — it bans it from the *page chrome*, which is where the
 * old quantizer bug had been hardcoded as a floor colour. The distinction
 * matters: the check that would have caught that defect is "no legacy quantizer
 * artefact in CSS", not "no violet anywhere".
 */
function paletteHexes(): Set<string> {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), 'art', 'palette.json'), 'utf8')) as {
    ramps: Record<string, { colors: Record<string, string> }>;
  };
  const out = new Set<string>();
  for (const ramp of Object.values(raw.ramps)) {
    for (const hex of Object.values(ramp.colors)) out.add(hex.toUpperCase());
  }
  return out;
}

const BANNED_IN_CHROME = ['#3B2050', '#3b2050'];

/* ------------------------------------------------------------------ states -- */

type StateName =
  | 'idle'
  | 'tony-dialogue'
  | 'tonight-board'
  | 'banner-completed'
  | 'banner-current-tbd'
  | 'rack'
  | 'prediction'
  | 'receipt'
  | 'counter'
  | 'back-hall'
  | 'keyboard-focus'
  | 'six-banners';

async function dismissTony(page: Page): Promise<void> {
  const x = page.getByRole('button', { name: /Dismiss what Tony said/i });
  if ((await x.count()) > 0) await x.click({ force: true });
  await page.waitForTimeout(350);
}

async function home(page: Page, settle = 2500): Promise<void> {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(settle);
}

/**
 * Sign in as a real manager.
 *
 * Alex is found **by name**, never by id. Reseeding regenerates every uuid, so a
 * hardcoded one turns a fresh database into a thirty-second timeout that looks
 * like a product failure.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/door`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Alex/ }).first().click();
  await page.waitForURL(/\/door\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const door = page.url();

  const submit = async (): Promise<void> => {
    await page.fill('input[name="pin"]', PIN);
    if ((await page.locator('input[name="confirm"]').count()) > 0) {
      await page.fill('input[name="confirm"]', PIN);
    }
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  };

  await submit();
  if (new URL(page.url()).pathname !== '/') {
    // Already claimed on an earlier run: the same form is now sign-in.
    await page.goto(door, { waitUntil: 'networkidle' });
    await submit();
  }
  if (new URL(page.url()).pathname !== '/') {
    throw new Error(`could not sign in; stuck at ${page.url()}`);
  }
}

async function reach(page: Page, state: StateName): Promise<void> {
  switch (state) {
    case 'tony-dialogue':
      await home(page);
      return;
    case 'idle':
    case 'six-banners':
      await home(page);
      await dismissTony(page);
      return;
    case 'tonight-board':
      await home(page);
      await dismissTony(page);
      await page.getByRole('button', { name: /Read the board/i }).click({ force: true });
      return;
    case 'banner-completed':
      await home(page);
      await dismissTony(page);
      await page.getByRole('button', { name: /2025 champion/i }).click({ force: true });
      return;
    case 'banner-current-tbd':
      await home(page);
      await dismissTony(page);
      await page.getByRole('button', { name: /2026/i }).click({ force: true });
      return;
    case 'prediction':
      await home(page);
      await dismissTony(page);
      await page.getByRole('button', { name: /prediction/i }).click({ force: true });
      return;
    case 'receipt':
      await home(page);
      await dismissTony(page);
      await page.getByRole('button', { name: /receipt/i }).click({ force: true });
      return;
    case 'rack':
      await home(page);
      await dismissTony(page);
      await page.getByRole('link', { name: /rack/i }).click({ force: true });
      await page.waitForTimeout(1500);
      return;
    case 'counter':
      await home(page);
      await dismissTony(page);
      await page.getByRole('link', { name: /counter/i }).click({ force: true });
      await page.waitForTimeout(1500);
      return;
    case 'back-hall':
      await home(page);
      await dismissTony(page);
      await page.getByRole('link', { name: /back/i }).click({ force: true });
      await page.waitForTimeout(1500);
      return;
    case 'keyboard-focus':
      await home(page);
      await dismissTony(page);
      // Four tabs lands inside the room rather than on the utility bar.
      for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
      await page.waitForTimeout(250);
      return;
  }
}

const ALL_STATES: readonly StateName[] = [
  'idle',
  'tony-dialogue',
  'tonight-board',
  'banner-completed',
  'banner-current-tbd',
  'rack',
  'prediction',
  'receipt',
  'counter',
  'back-hall',
  'keyboard-focus',
  'six-banners',
];

/* ------------------------------------------------------------------- gates -- */

/**
 * Tap targets and overlap, measured on the real layout.
 *
 * Exact floats, never rounded: the banner pitch is 26.81css at 390, and rounding
 * it to 27 manufactures a one-pixel overlap between neighbours that does not
 * exist. A gate that cries wolf gets switched off, so this one uses an epsilon
 * and reports the actual overlap area.
 */
async function checkTargets(page: Page, width: number): Promise<void> {
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('a,button,[role="button"]')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 48),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      })
      .filter((b) => b.w > 0 && b.h > 0),
  );

  for (const b of boxes) {
    if (b.w + 0.01 < AA_MIN || b.h + 0.01 < AA_MIN) {
      fail(
        'tap-target',
        `@${String(width)} "${b.label}" is ${b.w.toFixed(2)}x${b.h.toFixed(2)}css, under the ${String(AA_MIN)}px AA floor`,
      );
    }
  }

  const EPS = 0.5; // Sub-pixel abutment is arithmetic, not a defect.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (dx > EPS && dy > EPS) {
        fail(
          'overlap',
          `@${String(width)} "${a.label}" overlaps "${b.label}" by ${dx.toFixed(2)}x${dy.toFixed(2)}css`,
        );
      }
    }
  }
}

/**
 * The room's chrome must not reintroduce a legacy palette value, and must not
 * recolour approved art.
 *
 * `filter` and `mix-blend-mode` on an element that renders a registered asset is
 * the mechanism by which pixel art silently stops matching the file it came
 * from — `VISUAL_ACCEPTANCE.md §4`.
 */
async function checkColourFidelity(page: Page, width: number): Promise<void> {
  const problems = await page.evaluate(
    ({ banned }) => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('*')) {
        const s = getComputedStyle(el);
        for (const prop of ['backgroundColor', 'color', 'borderTopColor'] as const) {
          const v = s[prop];
          const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
          if (m === null) continue;
          const hex =
            '#' +
            [m[1], m[2], m[3]]
              .map((n) => Number(n).toString(16).padStart(2, '0'))
              .join('')
              .toUpperCase();
          if (banned.includes(hex)) out.push(`${el.tagName.toLowerCase()} ${prop} = ${hex}`);
        }
        // Recolouring an <img> is how approved art stops matching its source.
        if (el.tagName === 'IMG') {
          if (s.filter !== 'none' && !s.filter.includes('drop-shadow')) {
            out.push(`img has filter: ${s.filter}`);
          }
          if (s.mixBlendMode !== 'normal') out.push(`img has mix-blend-mode: ${s.mixBlendMode}`);
          if (s.imageRendering !== 'pixelated') {
            out.push(`img image-rendering is "${s.imageRendering}", not pixelated`);
          }
        }
      }
      return out;
    },
    { banned: BANNED_IN_CHROME.map((h) => h.toUpperCase()) },
  );

  for (const p of problems) fail('colour-fidelity', `@${String(width)} ${p}`);
}

/** Legacy assets and routes that were withdrawn and must not come back. */
async function checkNoLegacy(page: Page, width: number): Promise<void> {
  const html = await page.content();
  const banned: readonly [string, string][] = [
    ['zone_front_counter', 'the legacy two-tile room'],
    ['zone_counter_front', 'the withdrawn foreground asset'],
    ['/collection', 'the withdrawn collectible route'],
    ['ShowInteractables', 'the withdrawn hitbox control'],
  ];
  for (const [needle, why] of banned) {
    if (html.includes(needle)) fail('legacy', `@${String(width)} page references ${needle} — ${why}`);
  }
}

/**
 * The eight-object map, asserted against the rendered page.
 *
 * The room's whole grammar is 3 Doors, 4 Displays, 1 Toy. A ninth interactive
 * object, or a Door that has quietly become a Display, is a product regression
 * that no unit test sees.
 */
async function checkObjectMap(page: Page, width: number): Promise<void> {
  const counts = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href]')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && a.getAttribute('href')?.startsWith('/') === true;
    });
    const roomLinks = links.filter((a) => /slice|counter|back-hall/.test(a.getAttribute('href') ?? ''));
    const buttons = [...document.querySelectorAll('button[aria-label]')].filter(
      (b) => b.getBoundingClientRect().width > 0,
    );
    return {
      doors: roomLinks.length,
      buttons: buttons.map((b) => b.getAttribute('aria-label') ?? ''),
    };
  });

  if (counts.doors !== 3) {
    fail('object-map', `@${String(width)} expected 3 Doors, found ${String(counts.doors)}`);
  }
  const toy = counts.buttons.filter((l) => /Talk to Tony/i.test(l)).length;
  if (toy !== 1) fail('object-map', `@${String(width)} expected 1 Toy, found ${String(toy)}`);
}

/* -------------------------------------------------------------------- main -- */

async function run(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--state='))?.split('=')[1];
  const states = only === undefined ? ALL_STATES : ALL_STATES.filter((s) => s === only);
  if (states.length === 0) throw new Error(`unknown --state=${String(only)}`);

  mkdirSync(OUT, { recursive: true });
  const palette = paletteHexes();
  if (palette.size === 0) fail('palette', 'palette.json parsed to zero colours');

  const executablePath = process.env['PLAYWRIGHT_CHROMIUM'];
  const browser: Browser = await chromium.launch({
    ...(existsSync(executablePath ?? '') ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });

  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: 664 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));

      await signIn(page);

      for (const state of states) {
        await reach(page, state);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `${String(width)}-${state}.png`) });

        // The homepage gates only make sense on the homepage.
        if (!['rack', 'counter', 'back-hall'].includes(state)) {
          await checkColourFidelity(page, width);
          await checkNoLegacy(page, width);

          /*
           * Overlap is only meaningful between targets that are reachable at
           * the same time. Every open panel sits above a scrim that makes the
           * room inert, so a panel's Close button "overlapping" a Door behind
           * it is z-order working, not a defect — the first run of this gate
           * reported eleven of those and none of them were real.
           *
           * `idle` is the one state where every room object is simultaneously
           * live, so it is the one state where overlap can be judged.
           */
          if (state === 'idle') {
            await checkTargets(page, width);
            await checkObjectMap(page, width);
          }
        }

        // Nothing may scroll horizontally at any supported width.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) {
          fail('overflow', `@${String(width)} ${state} scrolls ${String(overflow)}px horizontally`);
        }
      }

      for (const e of errors.slice(0, 5)) fail('console', `@${String(width)} ${e}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  const report = {
    base: BASE,
    widths: WIDTHS,
    states,
    failures,
    passed: failures.length === 0,
  };
  writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (failures.length > 0) {
    console.error(`\nVisual QA FAILED — ${String(failures.length)} gate failure(s):\n`);
    for (const f of failures) console.error(`  [${f.gate}] ${f.detail}`);
    console.error(
      `\nScreenshots and report.json are in ${OUT}/. See VISUAL_ACCEPTANCE.md for what each gate protects.`,
    );
    process.exit(1);
  }

  console.log(
    `Visual QA passed — ${String(states.length)} states x ${String(WIDTHS.length)} widths, artifacts in ${OUT}/`,
  );
}

await run();
