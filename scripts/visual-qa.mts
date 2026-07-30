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
 *
 * ## This driver needs a *freshly seeded* database, and is not re-runnable
 *
 * It opens Alex's welcome box, and a box opens **once, ever** — that is the
 * whole point of `box_openings.box_id UNIQUE`. Re-seeding does not give it
 * back either, because the welcome grant is idempotent on a stable
 * `grant_key`. So a second run against the same database finds a manager with
 * no box, the tray states go looking for something that is gone, and the
 * failure surfaces somewhere unrelated and geometric — a room object reported
 * "outside of the viewport" — which reads like a layout regression and is not
 * one. CI is immune because every run gets a new database. Locally:
 *
 *   dropdb tonys_dev && createdb tonys_dev && npm run db:migrate && npm run db:seed
 *
 * before each run. A green result on a used database means nothing.
 */
import { execFileSync } from 'node:child_process';
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

/** WCAG 1.4.3 AA for normal text. Rarity words are the primary rarity signal. */
const AA_CONTRAST = 4.5;

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
  | 'six-banners'
  | 'tray-owned-box'
  | 'tray-reveal'
  | 'collection'
  | 'collection-filtered'
  | 'showcase'
  | 'showcase-chosen'
  | 'demo-tray-empty'
  | 'demo-collection-full'
  | 'demo-counter-broke'
  | 'demo-showcase-chosen'
  | 'reveal-common'
  | 'reveal-rare'
  | 'reveal-epic'
  | 'reveal-legendary';

/**
 * States photographed on a demo seat rather than on a manager.
 *
 * `MANDATE §8` asks for the important states to be reachable without hand-edited
 * SQL, and this is the payoff: four states the driver **could not photograph at
 * all** before, because reaching them from a seeded manager meant destroying the
 * state a later capture needed.
 *
 * The calm room is the clearest example. Every seeded manager owns a welcome
 * box, so `idle` has always had a box on the tray and the box-free room — what
 * the parlor looks like for most of a season — had never once been captured.
 *
 * Each seat is reserved, `demo:`-prefixed and unreachable from production
 * (`lib/demo/guard.ts`), and each state is idempotent, so a re-run photographs
 * the same database. That last property is what the rest of this driver still
 * lacks: see the header note about `tray-reveal` consuming a box.
 */
const DEMO_BACKED: Partial<Record<StateName, string>> = {
  'demo-tray-empty': 'no-box',
  'demo-collection-full': 'collection-full',
  'demo-counter-broke': 'broke',
  'demo-showcase-chosen': 'showcased',
};

interface DemoApplied {
  readonly doorPath: string;
  readonly pin: string;
  readonly route: string;
}

/**
 * Put the database into a demo state and hand back where to sign in.
 *
 * Shells out to the same CLI a person runs, rather than importing the appliers,
 * for one reason: it keeps the guards on the path. A driver that called
 * `applyDemoState` directly would be a second caller that could forget to pass
 * an environment, and the guard would then be protecting only the humans.
 *
 * `DEMO_FIXTURES` is read from this process's own environment and passed
 * through unchanged — never injected. The opt-in exists so that whoever starts
 * a run has said which database it is pointing at, and a driver that opted in
 * on their behalf would have removed the only thing the opt-in does.
 */
function applyDemo(stateKey: string): DemoApplied {
  if ((process.env['DEMO_FIXTURES'] ?? '') !== '1') {
    throw new Error(
      `the demo-backed states need DEMO_FIXTURES=1 in this shell, confirming DATABASE_URL ` +
        `points at a local or preview database. Run:\n` +
        `  DEMO_FIXTURES=1 npm run visual:qa`,
    );
  }

  const raw = execFileSync('npx', ['tsx', 'scripts/demo.ts', 'apply', stateKey, '--json'], {
    encoding: 'utf8',
    env: process.env,
  });

  return JSON.parse(raw) as DemoApplied;
}

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
  await enterPin(page, page.url(), PIN);
}

/**
 * Sign in at a specific door.
 *
 * Split out of `signIn` so a demo seat — which is reached by the URL the applier
 * prints, never by picking a name off the board — uses exactly the same form and
 * the same submission as a manager does. A demo that authenticated by a side
 * door would stop being evidence that the front one works.
 */
async function enterPin(page: Page, doorUrl: string, pin: string): Promise<void> {
  const submit = async (): Promise<void> => {
    await page.fill('input[name="pin"]', pin);
    if ((await page.locator('input[name="confirm"]').count()) > 0) {
      await page.fill('input[name="confirm"]', pin);
    }
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  };

  await submit();
  if (new URL(page.url()).pathname !== '/') {
    // Already claimed on an earlier run: the same form is now sign-in.
    await page.goto(doorUrl, { waitUntil: 'networkidle' });
    await submit();
  }
  if (new URL(page.url()).pathname !== '/') {
    throw new Error(`could not sign in at ${doorUrl}; stuck at ${page.url()}`);
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
    /*
     * `/counter`, reached directly rather than by tapping the tray.
     *
     * The tray is a Door, but its destination is conditional: with a box on it,
     * tapping **opens the box in place** (`18 §4.1`) instead of navigating, so
     * there is no anchor to click while a manager is holding one. Every seeded
     * manager starts with a box, so that is the state this driver always finds.
     *
     * Navigating straight there is the honest way to photograph the page. The
     * Door itself is asserted by `object-map` on `idle` and `tray-owned-box`,
     * which check the tray's identity and kind rather than its HTML tag — so
     * nothing is lost by not clicking it here.
     */
    case 'counter':
      await page.goto(`${BASE}/counter`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      return;
    /*
     * The shelf, after a pull.
     *
     * Ordered **after** `tray-reveal` in `ALL_STATES`, so by the time this runs the
     * manager owns something and the grid shows a held spot beside empty ones. A
     * capture of an entirely empty shelf would miss the two things worth reviewing:
     * the rarity treatment on a held spot, and whether the empty spots read as
     * deliberately empty rather than as components that failed to load.
     */
    case 'collection':
      await page.goto(`${BASE}/counter/collection`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      return;

    /*
     * A filter that matches nothing.
     *
     * The empty-result path, which is a real state a manager reaches by tapping a
     * tier they have not pulled yet — and `VISUAL_ACCEPTANCE.md §4` requires empty
     * surfaces to be visibly empty on purpose. `legendary` is the safe choice: at
     * the provisional weights it is 2 parts in 4000, so a seeded run will not have
     * one by accident.
     */
    case 'collection-filtered':
      await page.goto(`${BASE}/counter/collection?rarity=legendary`, {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(1200);
      return;

    /*
     * The Showcase, before anything is chosen.
     *
     * The empty state carries real weight here: it is what nine of ten managers see
     * on day one, and `18 §4` forbids clout, so having nothing out has to look like
     * a choice rather than a deficiency.
     */
    case 'showcase':
      await page.goto(`${BASE}/counter/showcase`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      return;

    /*
     * The Showcase, with something in it.
     *
     * Runs after `tray-reveal` has put a collectible on the shelf, so the picker has
     * something to offer. Picking it is the last step of the milestone's loop — the
     * point at which a pull becomes something the league can see.
     */
    case 'showcase-chosen': {
      await page.goto(`${BASE}/counter/showcase`, { waitUntil: 'networkidle' });

      /*
       * The state is *the Showcase with something in it*, and by this point it
       * may already be in that state.
       *
       * Each width signs in as the same manager and `tray-reveal` buys and opens
       * a fresh box — but the roll is real randomness, so the second width can
       * pull a **duplicate** of what the first width already put on the shelf.
       * `showcaseChoices` is one entry per *distinct* item, so the picker then
       * offers exactly one choice, already chosen, and there is no
       * "Show this one" to click. The driver waited thirty seconds for a button
       * that correctly did not exist.
       *
       * A latent flake rather than a new one: it needs two widths to draw the
       * same slug out of twenty-four, which is likely enough to happen and rare
       * enough to look like whatever change was in flight when it did. Waiting
       * on the *outcome* instead of on the click is what makes it stable — and
       * it is the more honest assertion anyway.
       */
      const pick = page.getByRole('button', { name: /Show this one/i }).first();
      if ((await pick.count()) > 0) await pick.click();

      // The pick is confirmed by a server round trip and a refresh, not optimistically.
      await page.getByRole('button', { name: /take it off the shelf/i }).waitFor({
        timeout: 15_000,
      });
      await page.waitForTimeout(400);
      return;
    }

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

    /*
     * A box on the tray, unopened.
     *
     * Non-destructive on purpose — it looks and does not touch. Every width
     * signs in as the same manager, so a state that *opened* the box would
     * consume it and leave the two narrower widths photographing an empty tray.
     *
     * This is the state that proves the whole visual claim of the slice: the box
     * is on the tray, the tray Door glows for the first time, and the object map
     * is still eight.
     *
     * ## It currently looks like `idle`, and that is the truth rather than a bug
     *
     * The seed grants every manager a box, so *today* the idle room has a box on
     * the tray and these two artifacts resemble each other. The value here is the
     * gates: this is the named state where `object-map`, `tap-target` and `glow`
     * run against the owned tray, so a reviewer knows which screenshot is
     * making that claim.
     *
     * They diverge as soon as boxes are acquired rather than seeded — a manager
     * who has opened theirs has an empty tray again, and `idle` goes back to the
     * calm room it was in V1.
     */
    case 'tray-owned-box':
      await home(page);
      await dismissTony(page);
      // Past the glow's 3.4s cycle, so the capture is not caught mid-breath.
      await page.waitForTimeout(600);
      return;

    /*
     * The reveal.
     *
     * **Required at every width, now that boxes are bought rather than seeded.**
     *
     * It could not be before. A box opens exactly once by design, so the seeded
     * fixture box meant capturing the reveal at 390 consumed it and the two
     * narrower widths photographed an empty tray — a gate that passes on a fresh
     * database and fails on the second run, which is worse than no gate.
     *
     * Purchase fixes it properly rather than by contrivance: each width buys its
     * own box out of the season's opening balance, which covers several at the
     * provisional price. So this state now also exercises the ledger, the balance
     * check and the tray transition in one pass.
     */
    case 'tray-reveal':
      await page.goto(`${BASE}/counter`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Buy a standard pizza box/i }).click();
      // The purchase refreshes the page; wait for the tray panel to appear rather
      // than for a fixed delay, so a slow runner does not photograph a stale page.
      await page.getByText(/unopened box/i).first().waitFor({ timeout: 15_000 });
      await home(page);
      await dismissTony(page);
      await page.getByRole('button', { name: /Open your pizza box/i }).click({ force: true });
      // The anticipation beat is 1100ms and the rise is 420ms.
      await page.waitForTimeout(2200);
      return;

    /*
     * The demo-backed states.
     *
     * Each one is signed in as its own reserved seat before it is photographed —
     * see `reachDemo`. The navigation is all these cases have to do, because the
     * *state* was put into the database by the applier rather than by driving the
     * browser to it.
     */
    case 'demo-tray-empty':
      await home(page);
      await dismissTony(page);
      await page.waitForTimeout(600);
      return;

    case 'demo-collection-full':
      await page.goto(`${BASE}/counter/collection`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      return;

    case 'demo-counter-broke':
      await page.goto(`${BASE}/counter`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      return;

    case 'demo-showcase-chosen':
      await page.goto(`${BASE}/counter/showcase`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      return;

    /*
     * The reveal, at each rarity, on purpose.
     *
     * These are the four states this driver could never produce. The roll
     * happens inside `openBox`, so `tray-reveal` photographs whatever the table
     * gave — which for four runs out of five is a common, and means the epic and
     * legendary treatments had never once been reviewed at 360.
     *
     * `?preview_reveal=` synthesises the payload on the server behind the demo
     * guards (`lib/demo/preview.ts`). Nothing is rolled, nothing is written, no
     * box is consumed — so unlike `tray-reveal` these are repeatable, and they
     * are the same item at every width so the three screenshots compare.
     */
    case 'reveal-common':
    case 'reveal-rare':
    case 'reveal-epic':
    case 'reveal-legendary': {
      const rarity = state.slice('reveal-'.length);
      await page.goto(`${BASE}/?preview_reveal=${rarity}`, { waitUntil: 'networkidle' });
      await dismissTony(page);
      // Past the rise (420ms) and the plate's deliberate late arrival.
      await page.waitForTimeout(1600);
      return;
    }
  }
}

/**
 * Apply a demo state, sign in as its seat, then reach it.
 *
 * The applier runs once per width on purpose. It is idempotent, so the second
 * and third widths find the state already applied and photograph the same
 * database — which is the property the manager-backed states do not have, and
 * the reason `tray-reveal` has to buy a fresh box at every width.
 */
async function reachDemo(page: Page, state: StateName, demoKey: string): Promise<void> {
  const applied = applyDemo(demoKey);

  // The door redirects to the room when a session already exists, so signing in
  // as a second seat means being nobody first. Without this the PIN field is
  // simply not on the page and the failure reads as a broken door.
  await page.context().clearCookies();

  await page.goto(`${BASE}${applied.doorPath}`, { waitUntil: 'networkidle' });
  await enterPin(page, `${BASE}${applied.doorPath}`, applied.pin);
  await reach(page, state);
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
  'tray-owned-box',
  // After the reveal on purpose: the shelf is worth reviewing with something on it.
  'tray-reveal',
  'collection',
  'collection-filtered',
  'showcase',
  'showcase-chosen',
  /*
   * Last, and deliberately so: each signs in as a different seat, and the
   * manager-backed states above expect to still be Alex.
   */
  'demo-tray-empty',
  'demo-collection-full',
  'demo-counter-broke',
  'demo-showcase-chosen',
  // The four rarity treatments, side by side and repeatable. Signed in as
  // whoever the previous demo state left us as, which is fine: the payload is
  // synthesised and does not depend on what that seat owns.
  'reveal-common',
  'reveal-rare',
  'reveal-epic',
  'reveal-legendary',
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

  const banned: readonly [RegExp, string, string][] = [
    [/zone_front_counter/, 'zone_front_counter', 'the legacy two-tile room'],
    [/zone_counter_front/, 'zone_counter_front', 'the withdrawn foreground asset'],
    /*
     * The withdrawn route is `/collection` at the **root**. `/counter/collection`
     * is the canonical one (`18 §4`), and a plain substring match banned it —
     * which is how this gate first reported the correct route as a violation.
     *
     * Anchored to a quote or a path boundary so `href="/collection"` fails and
     * `href="/counter/collection"` does not.
     */
    [/["'(\s]\/collection(["'?#/\s)]|$)/, '/collection', 'the withdrawn root collectible route'],
    [/ShowInteractables/, 'ShowInteractables', 'the withdrawn hitbox control'],
  ];

  for (const [pattern, name, why] of banned) {
    if (pattern.test(html)) fail('legacy', `@${String(width)} page references ${name} — ${why}`);
  }
}

/**
 * The eight-object map, asserted against the rendered page.
 *
 * The room's whole grammar is 3 Doors, 4 Displays, 1 Toy. A ninth interactive
 * object, or a Door that has quietly become a Display, is a product regression
 * that no unit test sees.
 *
 * ## This used to count anchors, and that was too weak in both directions
 *
 * The old gate counted `<a href>` matching `slice|counter|back-hall` and looked
 * for one button labelled "Talk to Tony". Two problems:
 *
 *   - **It reported a false failure.** The tray is a Door, and when a box is
 *     owned it *opens at the tray, in place* (`18 §4.1`) rather than navigating,
 *     so it renders as a button. An anchor count reads that as a missing Door —
 *     and the obvious way to make the gate green again would have been to route
 *     to `/counter` first, which is the precise defect the ruling forbids. A gate
 *     that pressures you toward a known defect is worse than no gate.
 *   - **It missed real ones.** Nothing checked the four Displays, and nothing
 *     would have noticed a Door quietly becoming a Display as long as some
 *     anchor still pointed at the route.
 *
 * So the assertion is now the **whole map by identity**: every interactive room
 * object carries `data-room-object` and `data-room-kind`
 * (`components/scene/room-object.tsx`), and the rendered set must equal
 * `ROOM_OBJECTS` exactly — same ids, same kinds, no extras, no duplicates. That
 * catches the ninth object, the demoted Door, the vanished Display, and the
 * renamed id, and it is indifferent to which HTML tag an object happens to use.
 */

/** The map, as `objects.ts` declares it. Kept in sync by the gate, not by hand. */
const EXPECTED_OBJECTS: Readonly<Record<string, 'door' | 'display' | 'toy'>> = {
  slice: 'door',
  counter: 'door',
  'back-hall': 'door',
  tonight: 'display',
  banners: 'display',
  prediction: 'display',
  receipt: 'display',
  tony: 'toy',
};

/**
 * The one object allowed to render as several targets.
 *
 * The banner rail is a single Display divided into one button per occupied slot,
 * because "which season is that one?" is a question about a specific banner. Any
 * *other* id appearing twice is a duplicate, and a duplicate doubles a tap
 * target where nobody can see it.
 */
const PARTITIONED = new Set(['banners']);

async function checkObjectMap(page: Page, width: number): Promise<void> {
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('[data-room-object]')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({
        id: el.getAttribute('data-room-object') ?? '',
        kind: el.getAttribute('data-room-kind') ?? '',
        partitioned: el.hasAttribute('data-room-partition'),
      })),
  );

  const at = `@${String(width)}`;

  // Collapse partitions to the object they belong to, then count. A partitioned
  // object is one object; anything else appearing twice is a defect.
  const byId = new Map<string, typeof found>();
  for (const object of found) {
    byId.set(object.id, [...(byId.get(object.id) ?? []), object]);
  }

  for (const [id, group] of byId) {
    if (group.length === 1) continue;
    if (!PARTITIONED.has(id)) {
      fail('object-map', `${at} "${id}" is rendered ${String(group.length)} times`);
    } else if (!group.every((object) => object.partitioned)) {
      fail(
        'object-map',
        `${at} "${id}" has ${String(group.length)} elements but not all are marked as partitions`,
      );
    }
  }

  for (const [id, kind] of Object.entries(EXPECTED_OBJECTS)) {
    const group = byId.get(id);
    if (group === undefined) {
      fail('object-map', `${at} room object "${id}" (${kind}) is missing`);
    } else if (group[0]!.kind !== kind) {
      fail('object-map', `${at} "${id}" is a ${group[0]!.kind}, expected a ${kind}`);
    }
  }

  for (const id of byId.keys()) {
    if (!(id in EXPECTED_OBJECTS)) {
      fail(
        'object-map',
        `${at} unexpected room object "${id}" — the homepage is exactly eight`,
      );
    }
  }

  // The headline numbers, stated so a failure names the grammar and not just a row.
  const tally = (kind: string): number =>
    [...byId.values()].filter((group) => group[0]!.kind === kind).length;

  if (tally('door') !== 3 || tally('display') !== 4 || tally('toy') !== 1) {
    fail(
      'object-map',
      `${at} expected 3 Doors · 4 Displays · 1 Toy, found ${String(tally('door'))} · ${String(tally('display'))} · ${String(tally('toy'))}`,
    );
  }
}

/**
 * A box on the tray glows; nothing else in the room does.
 *
 * `18` allows exactly one persistent affordance — a Door with something to say —
 * and V1 shipped with none. This slice creates the first, so this gate exists to
 * stop the second from arriving unnoticed: a glow on a Display, or a second Door
 * lighting up, teaches the room's grammar wrong and no unit test can see it.
 *
 * Measured as "a `drop-shadow` filter on an element inside the room", which is
 * the room's only sanctioned glow mechanism (`18 §9.4`).
 */
async function checkOnlyTheTrayGlows(page: Page, width: number): Promise<void> {
  const glowing = await page.evaluate(() => {
    const room = document.querySelector('main');
    if (room === null) return [];
    return [...room.querySelectorAll<HTMLElement>('*')]
      .filter((el) => {
        const filter = getComputedStyle(el).filter;
        return filter !== 'none' && filter.includes('drop-shadow');
      })
      .map((el) => el.className.toString().slice(0, 60));
  });

  for (const className of glowing) {
    if (!/\bbox-(owned|opening)\b|\brarity-/.test(className)) {
      fail(
        'glow',
        `@${String(width)} something other than the tray's box is glowing: "${className}"`,
      );
    }
  }
}


/**
 * Rarity words have to be readable on whatever they are sitting on.
 *
 * `18` makes rarity **the printed word first**, colour third — so a rarity word
 * nobody can read is not a styling nit, it is the primary signal missing.
 *
 * This has now shipped twice. `LEGENDARY` was invisible on cream once, was
 * repaired on the surfaces that existed then, and was still invisible on the
 * **reveal plate** — because the plate is a hand-rolled cream surface that never
 * got `on-paper`, and because the reveal's rarity treatment could not be
 * photographed on purpose until `?preview_reveal=` existed. The first legendary
 * screenshot ever taken showed it.
 *
 * So it is arithmetic now. WCAG AA for normal text is 4.5:1; these are small
 * uppercase display type, where anything less is unreadable at arm's length on a
 * phone in a lit room.
 */
/**
 * Rarity words have to be readable on whatever they are sitting on.
 *
 * `18` makes rarity **the printed word first**, colour third — so a rarity word
 * nobody can read is not a styling nit, it is the primary signal missing.
 *
 * This shipped twice. `LEGENDARY` was invisible on cream once, was repaired on
 * the surfaces that existed then, and was still invisible on the **reveal
 * plate** — a hand-rolled cream surface that never got `on-paper`, and one whose
 * rarity treatment could not be photographed on purpose until
 * `?preview_reveal=` existed. The first legendary screenshot ever taken showed
 * it.
 *
 * So it is arithmetic now. WCAG AA for normal text is 4.5:1, and these are small
 * uppercase display type where less than that is unreadable at arm's length.
 */
async function checkRarityContrast(page: Page, width: number, state: string): Promise<void> {
  /*
   * The page returns **strings**; every calculation happens in Node.
   *
   * Not a style preference. `tsx` compiles this file with esbuild's `keepNames`,
   * which wraps named function expressions in a `__name(...)` helper — and that
   * helper does not exist inside `page.evaluate`, so any named arrow in here
   * fails at runtime with `ReferenceError: __name is not defined`. Keeping the
   * in-page half to one anonymous expression with no local functions sidesteps
   * it, and the arithmetic is easier to read out here anyway.
   */
  const samples = await page.evaluate(() => {
    const out: { text: string; color: string; ground: string }[] = [];
    for (const el of document.querySelectorAll('.rarity-word')) {
      let ground = '';
      let node: Element | null = el;
      for (let depth = 0; depth < 12 && node !== null; depth++) {
        const bg = getComputedStyle(node).backgroundColor;
        // Anything with real alpha is the ground. `transparent` and near-clear
        // washes are not, so keep walking.
        if (bg !== '' && !bg.includes('rgba(0, 0, 0, 0)')) {
          const alpha = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(bg);
          if (alpha === null || Number(alpha[1]) >= 0.9) {
            ground = bg;
            break;
          }
        }
        node = node.parentElement;
      }
      out.push({ text: (el.textContent ?? '').trim().slice(0, 24), color: getComputedStyle(el).color, ground });
    }
    return out;
  });

  for (const sample of samples) {
    const fg = channels(sample.color);
    const bg = channels(sample.ground);
    if (fg === null || bg === null) continue;

    const ratio = contrast(fg, bg);
    if (ratio < AA_CONTRAST) {
      fail(
        'rarity-contrast',
        `@${String(width)} ${state} "${sample.text}" is ${ratio.toFixed(2)}:1 against its own ` +
          'background, under the 4.5:1 AA floor. A cream surface needs `on-paper`.',
      );
    }
  }
}

function channels(value: string): [number, number, number] | null {
  const match = /rgba?\(([^)]+)\)/.exec(value);
  if (match?.[1] === undefined) return null;
  const parts = match[1].split(',').map((n) => Number.parseFloat(n.trim()));
  const [r, g, b] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
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
      /*
       * Console errors, tagged with the state that produced them.
       *
       * They used to be collected into one bare list and reported as
       * `@375 <message>`. That is a true statement and an unusable one: the run
       * covers twenty-two states, and locating a single hydration warning meant
       * reproducing the whole sequence by hand. The gate now records where it
       * was standing when the error arrived.
       */
      const errors: { state: string; text: string }[] = [];
      let capturing = 'sign-in';
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push({ state: capturing, text: m.text() });
      });
      page.on('pageerror', (e) => errors.push({ state: capturing, text: e.message }));

      await signIn(page);

      for (const state of states) {
        capturing = state;
        const demoKey = DEMO_BACKED[state];
        if (demoKey === undefined) await reach(page, state);
        else await reachDemo(page, state, demoKey);

        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `${String(width)}-${state}.png`) });

        /*
         * Colour fidelity and legacy references apply to **every** page.
         *
         * They used to be skipped on `rack`, `counter` and `back-hall`, on the
         * reasoning that "the homepage gates only make sense on the homepage".
         * That was true of the object map and the tap targets and false of these
         * two — and the exemption is precisely why `RoomBehind` sat there drawing
         * the withdrawn two-tile room behind every interior screen, undetected,
         * from V1 until the `collection` state happened not to be on the list.
         *
         * A skip list is a place for defects to live. These now run everywhere.
         */
        await checkColourFidelity(page, width);
        await checkNoLegacy(page, width);
        // Everywhere, like the two above: a rarity word can appear on any
        // surface, and the defect this catches was on the one surface nobody
        // thought to check.
        await checkRarityContrast(page, width, state);

        {

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
            // Nothing glows in the idle room unless a box is on the tray.
            await checkOnlyTheTrayGlows(page, width);
          }

          /*
           * The owned tray is the second state where every room object is
           * simultaneously live, so the map and the targets are judged here too.
           * This is the state that would catch the box arriving as a *ninth*
           * object, or the tray Door being replaced rather than restated — the
           * two ways this slice could have broken the room's grammar.
           */
          if (state === 'tray-owned-box') {
            await checkTargets(page, width);
            await checkObjectMap(page, width);
            await checkOnlyTheTrayGlows(page, width);
          }

          /*
           * The room with nothing on the tray — the third state where every
           * object is live, and until the demo seats existed, one this driver
           * could not produce at all. Every seeded manager owns a welcome box,
           * so `idle` has always been the *owned* room wearing the calm room's
           * name, and the glow gate there has never once had to prove a
           * negative. Here it does: eight objects, and nothing glowing.
           */
          if (state === 'demo-tray-empty') {
            await checkTargets(page, width);
            await checkObjectMap(page, width);
            await checkOnlyTheTrayGlows(page, width);
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

      for (const e of errors.slice(0, 5)) {
        fail('console', `@${String(width)} during "${e.state}" — ${e.text}`);
      }
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
