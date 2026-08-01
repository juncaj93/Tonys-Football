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
  | 'character-empty'
  | 'character-dressed'
  | 'character-equipped'
  | 'character-default'
  | 'character-tallest'
  | 'character-widest'
  | 'character-balding-visor'
  | 'character-every-slot'
  | 'character-long-hair-apron'
  | 'tony-dialogue'
  | 'tonight-board'
  | 'banner-completed'
  | 'banner-current-tbd'
  | 'rack'
  | 'prediction'
  | 'receipt'
  | 'counter'
  | 'back-hall'
  | 'back-hall-rooms-open'
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
  | 'demo-pull-while-broke'
  | 'demo-box-waiting'
  | 'demo-welcome-box'
  | 'demo-collection-empty'
  | 'slice'
  | 'slice-offseason'
  | 'slice-preseason'
  | 'slice-normal-week'
  | 'slice-blowout'
  | 'slice-close-finish'
  | 'slice-record-score'
  | 'slice-weak-news'
  | 'slice-incomplete-week'
  | 'slice-standings-shakeup'
  | 'slice-playoff-week'
  | 'slice-championship'
  | 'slice-historical-recap'
  | 'slice-no-stories'
  | 'slice-one-story'
  | 'slice-competing-stories'
  | 'reveal-common'
  | 'reveal-rare'
  | 'reveal-epic'
  | 'reveal-legendary'
  | 'reveal-first-offer'
  | 'reveal-complete-offer'
  | 'reveal-no-offer'
  /*
   * The weekly-stakes board, one state per named fixture.
   *
   * `board-quiet` is the state a real manager meets today — nothing authored,
   * because the 2026 season has no games — and it is the one that most needed
   * designing, so it is photographed first.
   */
  | 'board-quiet'
  | 'board-chalkboard-open'
  | 'board-chalkboard-hit'
  | 'board-chalkboard-missed'
  | 'board-chalkboard-leader'
  | 'board-line-pending'
  | 'board-line-incomplete'
  | 'board-line-won'
  | 'board-line-lost'
  | 'board-line-push'
  | 'board-bounty-open'
  | 'board-bounty-missed'
  | 'board-bounty-claimed'
  | 'board-bounty-expired'
  | 'board-thin-basis'
  | 'board-retired-excluded'
  | 'board-long-names'
  /*
   * The market's error affordance, driven from the browser.
   *
   * Deliberately **not** a `board-*` state: it is not a fixture, it is an
   * interaction, and `boards.test.ts` asserts the `board-*` set equals the
   * fixture catalog exactly.
   */
  | 'pick-refused';

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
  // The reveal plate with **no** onward offer, because the tab cannot take it.
  // Every reveal screenshot before this was of somebody who could afford another.
  'demo-pull-while-broke': 'pull-while-broke',
  // Tony's other approved line group: a box waiting for somebody who has
  // opened one before.
  'demo-box-waiting': 'box-waiting',
  // And the first half of it: a manager who has never opened anything, being
  // handed their first box by name. This is beat 3 of the commissioner's
  // emotional sequence, and until the demo seats existed it could only be seen
  // on a manager who had not yet been used for anything else.
  'demo-welcome-box': 'welcome-box',
  // The shelf a brand-new player sees: twenty-four named spots and nothing on
  // any of them. It is the last beat of the commissioner's emotional sequence
  // and the one state of this route nobody had ever photographed — every seeded
  // manager owns something by the time the driver reaches here.
  'demo-collection-empty': 'collection-empty',
  /*
   * M3's three manager-backed states.
   *
   * `character-empty` is the one that matters most: **nothing awards a wearable
   * yet**, so an empty wardrobe is what every real manager meets. A feature
   * reviewed only in its fully-stocked state is a feature reviewed in the state
   * nobody is in.
   *
   * `character-equipped` is `equipped-wearable`, which sat in the demo catalog
   * declared-and-refused from M2 until M3 gave a wearable something to attach to.
   */
  'character-empty': 'character-empty',
  'character-dressed': 'character-dressed',
  'character-equipped': 'equipped-wearable',
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
    /*
     * The hall with something open beyond it.
     *
     * `?open=` is resolved by the **server** (`lib/flags.ts`), behind the demo
     * system's own two guards — so this needs `DEMO_FIXTURES=1` on the server
     * process as well as on this driver. That is the same wiring the nine
     * `reveal-*` states need, and the same wiring whose absence let them
     * photograph a calm parlor and pass. It is checked rather than trusted:
     * `checkBackHall` below fails a state whose doors are not in the state its
     * name claims.
     *
     * Both of these are states no real manager will see for a year. They are
     * photographed now precisely because that is true — a room nobody looks at
     * until the day it ships is a room that ships unreviewed.
     */
    case 'back-hall-rooms-open':
      await page.goto(`${BASE}/back-hall?open=rooms`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
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
    case 'tray-reveal': {
      await page.goto(`${BASE}/counter`, { waitUntil: 'networkidle' });

      /*
       * Wait on the **count**, not on the copy.
       *
       * This used to wait for the words "unopened box" to appear, which broke
       * the day the counter stopped saying them — a driver coupled to prose
       * fails as a fifteen-second timeout in an unrelated-looking place. The
       * page publishes `data-unopened-boxes`, so the wait is now "the number
       * went up", which is what a purchase actually means.
       */
      const before = await page
        .locator('[data-unopened-boxes]')
        .first()
        .getAttribute('data-unopened-boxes');

      await page.getByRole('button', { name: /Buy a standard pizza box/i }).click();
      await page.waitForFunction(
        `document.querySelector("[data-unopened-boxes]")?.getAttribute("data-unopened-boxes") !== ${JSON.stringify(before)}`,
        undefined,
        { timeout: 15_000 },
      );

      await home(page);
      // The pad stays up here too: this is the *real* path, so it is the
      // strongest place to prove the room yields when the box opens.
      await page.getByRole('button', { name: /Open your pizza box/i }).click({ force: true });

      /*
       * **Nothing is said while the box is opening.**
       *
       * The commissioner's ruling lists "dialogue suppressed during the opening
       * animation" as its own required state, and it is the one state that
       * cannot be photographed usefully — a screenshot of a shuddering box is a
       * screenshot of a box. So it is asserted instead, here, on the real path,
       * partway through the real beat.
       *
       * It holds by construction: the plate and Tony's offer live inside
       * `Revealed`, which only renders at `phase === 'reveal'`. The check is
       * cheap and the construction is one `&&` away from changing.
       */
      await page.waitForTimeout(400);
      if ((await page.locator('[role="status"]').count()) > 0) {
        fail(
          'reveal',
          `@${String(page.viewportSize()?.width ?? 0)} the plate is on screen 400ms into ` +
            `an 1100ms anticipation beat — Tony is talking over the box opening`,
        );
      }

      // The anticipation beat is 1100ms and the rise is 420ms.
      await page.waitForTimeout(1800);
      return;
    }

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
    case 'demo-collection-empty':
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
     * The pull is already done by the applier, so this is the room *after* it —
     * the tray empty and the tab short. What it proves is a negative: the plate
     * makes no offer it could not honour, and the counter says the true reason.
     */
    case 'demo-pull-while-broke':
      await page.goto(`${BASE}/counter`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      return;

    /*
     * Tony's returning-manager line, with the pad still up — the point is what
     * he says and that it does not cover the box he is pointing at.
     */
    case 'demo-box-waiting':
    /*
     * Tony handing over the first box, with the pad still up — the point is
     * what he says, that it names the box, and that it does not cover the lit
     * box it is pointing at.
     */
    case 'demo-welcome-box':
      await home(page);
      return;

    /*
     * The rack, with the last issue Tony actually printed on it.
     *
     * A real week of a real season, rendered by the deterministic renderer and
     * checked by the deterministic validator (`16 §9`). Required because a
     * renderer nobody can look at is a renderer nobody has reviewed — and
     * because "does this read like a paper" is exactly the judgement no test
     * makes.
     */
    /*
     * The fifteen named editions of the Slice.
     *
     * `?edition=` is resolved on the **server** behind the demo guard
     * (`lib/slice/editions.ts`), so `DEMO_FIXTURES=1` has to be set on the
     * *server process* as well as on this driver — exactly like `?preview_reveal=`,
     * and for exactly the reason recorded there: without it the server answers
     * with an ordinary rack, the driver photographs it, files it as
     * `390-slice-championship.png` and passes.
     *
     * The `slice-empty` gate below is the symptom check, because a wiring fix
     * protects one cause and a gate protects the symptom.
     */
    case 'slice-offseason':
    case 'slice-preseason':
    case 'slice-normal-week':
    case 'slice-blowout':
    case 'slice-close-finish':
    case 'slice-record-score':
    case 'slice-weak-news':
    case 'slice-incomplete-week':
    case 'slice-standings-shakeup':
    case 'slice-playoff-week':
    case 'slice-championship':
    case 'slice-historical-recap':
    case 'slice-no-stories':
    case 'slice-one-story':
    case 'slice-competing-stories': {
      const key = state.slice('slice-'.length);
      await page.goto(`${BASE}/slice?edition=${key}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-slice-edition]', { state: 'attached' });
      return;
    }

    /*
     * The manager-backed customiser states. The demo runner has already signed
     * this driver in at the reserved seat, so the route is all that is left.
     */
    case 'character-empty':
    case 'character-dressed':
    case 'character-equipped':
      await page.goto(`${BASE}/profile/character`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-character-customiser]', { state: 'attached' });
      return;

    /*
     * The geometry fixtures — the silhouettes that could clip.
     *
     * `?character=` is resolved on the **server** behind the demo guard
     * (`lib/character/previews.ts`), so `DEMO_FIXTURES=1` has to be set on the
     * server process as well as on this driver. Same wiring, same reason, and
     * the same false green as `?edition=` and `?preview_reveal=` if it is
     * missed — which is why the wait below is on the preview's own marker rather
     * than on a timeout.
     */
    case 'character-default':
    case 'character-tallest':
    case 'character-widest':
    case 'character-balding-visor':
    case 'character-every-slot':
    case 'character-long-hair-apron': {
      const key = state.slice('character-'.length);
      await page.goto(`${BASE}/profile/character?character=${key}`, {
        waitUntil: 'networkidle',
      });
      await page.waitForSelector(`[data-character-preview="${key}"]`, { state: 'attached' });
      return;
    }

    case 'slice':
      await page.goto(`${BASE}/slice`, { waitUntil: 'networkidle' });
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
      /*
       * Tony's pad is **not** dismissed here, and that is the point.
       *
       * It used to be, on every reveal state — which meant the driver was
       * removing the one thing that could collide with the plate before
       * photographing whether anything collided with the plate. The room yields
       * on its own (`data-parlor-focus`), and `checkRevealPresent` now measures
       * that it did.
       */
      // Past the rise (420ms) and the plate's deliberate late arrival.
      await page.waitForTimeout(1600);
      return;
    }

    /*
     * The plate's other three compositions, which differ only in the two lines
     * under the item's name — and which is exactly why they need photographing
     * separately. `mid` above is the one that had always been reviewed.
     *
     *   first    — their first collectible, and "first one was free"
     *   complete — the whole shelf, and an offer that admits it is a spare
     *   no-offer — the tab is short, so Tony says nothing about another box and
     *              there is no second link. The absence *is* the state
     *              (commissioner ruling: no disabled sales pitch), so it is
     *              captured rather than assumed.
     */
    case 'reveal-first-offer':
    case 'reveal-complete-offer':
    case 'reveal-no-offer': {
      const stage =
        state === 'reveal-first-offer'
          ? 'first'
          : state === 'reveal-complete-offer'
            ? 'complete'
            : 'broke';
      await page.goto(`${BASE}/?preview_reveal=rare&preview_stage=${stage}`, {
        waitUntil: 'networkidle',
      });
      // Pad left up on purpose — see the note on the four rarity states above.
      await page.waitForTimeout(1600);
      return;
    }

    /*
     * The weekly-stakes board, opened at the prediction sign.
     *
     * `?board=<key>` is resolved on the **server** behind the demo guard, and the
     * sign is a Display — trigger-only, because 37 room units cannot carry a
     * sentence (`lib/parlor/objects.ts`). So the state is *the panel open*, which
     * is where the words are.
     *
     * Tony's pad is dismissed first, deliberately: two transient surfaces must
     * never compete (`MANDATE §6`), and the review question here is whether the
     * board reads on its own.
     *
     * `?open=tonysLine` travels with every board URL for symmetry with the live
     * path, and is **inert here**: a previewed board carries the market whatever
     * the flag says, because the fixture *is* the demo of it and requiring two
     * parameters to see one state would be ceremony. The flag is what gates the
     * **live** board, and `backhall.test.ts` asserts it cannot be opened in
     * production by any route.
     */
    case 'board-quiet':
    case 'board-chalkboard-open':
    case 'board-chalkboard-hit':
    case 'board-chalkboard-missed':
    case 'board-chalkboard-leader':
    case 'board-line-pending':
    case 'board-line-incomplete':
    case 'board-line-won':
    case 'board-line-lost':
    case 'board-line-push':
    case 'board-bounty-open':
    case 'board-bounty-missed':
    case 'board-bounty-claimed':
    case 'board-bounty-expired':
    case 'board-thin-basis':
    case 'board-retired-excluded':
    case 'board-long-names': {
      const key = state.slice('board-'.length);
      /*
       * The bounty has no home on the sign — `16 §38` puts it on the paper — so
       * a bounty state is photographed on the Slice's band and the rest on the
       * sign. Two surfaces, one fixture, and each state goes where the thing it
       * shows actually lives.
       */
      const onPaper = key.startsWith('bounty') || key === 'retired-excluded' || key === 'long-names';

      if (onPaper) {
        await page.goto(`${BASE}/slice?board=${key}&open=tonysLine`, {
          waitUntil: 'networkidle',
        });
        /*
         * Scrolled to the band, because the screenshot is viewport-only.
         *
         * The first run of this state photographed the newspaper and nothing
         * else: the band sits under a full sheet of paper, so at 390 it is
         * entirely below the fold. The gate passed — `checkBoard` reads the DOM
         * — and the artifact showed a page with no bounty on it, filed under
         * `390-board-bounty-claimed.png`.
         *
         * That is the same shape as the nine reveal states: a green tick over
         * evidence of the wrong thing. A screenshot has to show the state it is
         * named for, and here that means scrolling to it.
         */
        await page.locator('[data-stakes-band]').scrollIntoViewIfNeeded();
        await page.waitForTimeout(900);
        return;
      }

      await page.goto(`${BASE}/?board=${key}&open=tonysLine`, { waitUntil: 'networkidle' });
      await dismissTony(page);
      await page.getByRole('button', { name: /prediction/i }).click({ force: true });
      await page.waitForTimeout(500);
      return;
    }

    /*
     * The market refusing a pick, in the shop's voice.
     *
     * `MANDATE §8` asks for error states to be shown rather than asserted, and
     * this is the one the market has: a tap the server declines. It is reachable
     * from a preview board without any arrangement — a previewed stake carries a
     * `preview:` id that `placeEntry` will not find, so the action returns
     * `closed` and the client renders its refusal.
     *
     * **The sentence shown is the preview's own reason**, not a defect: a
     * previewed offer genuinely is not a live one. What is under review is the
     * affordance — that the refusal appears, is announced (`aria-live`), reads as
     * Tony rather than as a stack trace, and leaves the controls usable.
     */
    case 'pick-refused': {
      await page.goto(`${BASE}/?board=line-pending&open=tonysLine`, {
        waitUntil: 'networkidle',
      });
      await dismissTony(page);
      await page.getByRole('button', { name: /prediction/i }).click({ force: true });
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /Take the over/i }).click();
      await page.waitForTimeout(1200);
      return;
    }

    /*
     * A state with no case is a state that photographs whatever was already on
     * screen — and passes.
     *
     * That happened. `slice` was added to `StateName` and to `ALL_STATES`, its
     * case never landed, and the driver dutifully captured the parlor three
     * times under the name `375-slice.png` and reported success. It is the same
     * shape as the nine reveal states that photographed a calm room: a green
     * tick on evidence of the wrong thing, which is worse than a missing state
     * because nobody re-examines a pass.
     *
     * TypeScript cannot catch it — every arm returns, so the switch is
     * exhaustive as far as the compiler is concerned only if every member has an
     * arm, and a `default` is what makes the omission loud at runtime for the
     * case where someone adds a member and a list entry but not an arm.
     */
    default:
      throw new Error(
        `visual-qa has no case for state "${String(state)}" — it would photograph ` +
          `whatever page was already open and report success. Add an arm to reach().`,
      );
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
  'back-hall-rooms-open',
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
  'demo-pull-while-broke',
  'demo-box-waiting',
  'demo-welcome-box',
  'demo-collection-empty',
  // M3. Manager-backed first (each signs in at its own seat), then the geometry
  // fixtures, which need only the demo guard and no particular manager.
  'character-empty',
  'character-dressed',
  'character-equipped',
  'character-default',
  'character-tallest',
  'character-widest',
  'character-balding-visor',
  'character-every-slot',
  'character-long-hair-apron',
  'slice',
  'slice-offseason',
  'slice-preseason',
  'slice-normal-week',
  'slice-blowout',
  'slice-close-finish',
  'slice-record-score',
  'slice-weak-news',
  'slice-incomplete-week',
  'slice-standings-shakeup',
  'slice-playoff-week',
  'slice-championship',
  'slice-historical-recap',
  'slice-no-stories',
  'slice-one-story',
  'slice-competing-stories',
  // The four rarity treatments, side by side and repeatable. Signed in as
  // whoever the previous demo state left us as, which is fine: the payload is
  // synthesised and does not depend on what that seat owns.
  'reveal-common',
  'reveal-rare',
  'reveal-epic',
  'reveal-legendary',
  // The plate's remaining compositions: the first pull, the finished shelf, and
  // the one where Tony makes no offer at all.
  'reveal-first-offer',
  'reveal-complete-offer',
  'reveal-no-offer',
  /*
   * The board. Resolved from `?board=` on the **server**, so a run without
   * `DEMO_FIXTURES` on the server process answers every one of these with the
   * quiet slate — which is why `checkBoard` reads what is on the page rather
   * than trusting the URL. Nine reveal states cost a milestone of false green to
   * that exact mistake.
   */
  'board-quiet',
  'board-chalkboard-open',
  'board-chalkboard-hit',
  'board-chalkboard-missed',
  'board-chalkboard-leader',
  'board-line-pending',
  'board-line-incomplete',
  'board-line-won',
  'board-line-lost',
  'board-line-push',
  'board-bounty-open',
  'board-bounty-missed',
  'board-bounty-claimed',
  'board-bounty-expired',
  'board-thin-basis',
  'board-retired-excluded',
  'board-long-names',
  'pick-refused',
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
 * A named Slice edition must be the edition that was asked for.
 *
 * The same class of gate as `checkRevealPresent`, added for the same reason
 * before it could fail silently: `?edition=` is resolved on the **server**, so a
 * server without `DEMO_FIXTURES=1` renders the ordinary rack and the driver
 * photographs it under the edition's name. The page stamps
 * `data-slice-edition` only when a preview really resolved, so the check is
 * exact rather than pictorial.
 */
async function checkEditionPresent(page: Page, width: number, state: string): Promise<void> {
  const expected = state.slice('slice-'.length);
  const found = await page.evaluate(
    () => document.querySelector('[data-slice-edition]')?.getAttribute('data-slice-edition') ?? null,
  );

  if (found !== expected) {
    fail(
      'slice-edition',
      `@${String(width)} ${state} rendered edition "${String(found)}" — expected "${expected}". ` +
        `The server almost certainly lacks DEMO_FIXTURES=1; see VISUAL_ACCEPTANCE.md.`,
    );
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

/**
 * The back hall is three doors, and the right ones are open.
 *
 * ## Why the hall needs its own map gate
 *
 * `checkObjectMap` asserts the *homepage's* eight and would reject anything else,
 * so it is scoped to parlor states. That left the second room in the product with
 * no map assertion at all — and the back hall is exactly where one is worth
 * having, because a shut door and an open one are different elements carrying the
 * same identity. The whole design claim is that shipping the basement changes one
 * element rather than the room; this is what checks it.
 *
 * ## And why it checks which doors are open
 *
 * `back-hall-rooms-open` and `back-hall-both-open` are resolved by the server
 * from `?open=`, which means a server without `DEMO_FIXTURES=1` answers both of
 * them with the ordinary shut hall — and the driver would file a calm room under
 * a name claiming otherwise and pass. That has happened once already, to nine
 * reveal states, and cost a milestone's worth of false green.
 *
 * An open door is an anchor; a shut one is a button that answers in-world
 * (`18 §6.3`). So the tag name is the evidence, and it is read from the DOM
 * rather than assumed from the URL.
 */
const BACK_HALL_STATES: Readonly<Record<string, { rooms: boolean; underground: boolean }>> = {
  'back-hall': { rooms: false, underground: false },
  'back-hall-rooms-open': { rooms: true, underground: false },
};

/**
 * The board is what the state's name says, read from the page.
 *
 * ## Why a gate, and not just a screenshot
 *
 * `?board=` is resolved by the **server**, which needs `DEMO_FIXTURES=1`. A
 * server without it answers every one of these with the ordinary quiet slate —
 * and a driver that only navigated would file that under `390-board-line-won.png`
 * and pass. That has happened once already, to nine reveal states, and cost a
 * milestone's worth of false green.
 *
 * So each state declares what must be on the page, and the driver reads it out of
 * the DOM: `data-stake-state` for the presentation, and `data-chalk-state` for
 * what the sign itself is showing. A quiet slate under a name claiming a settled
 * market is a failure rather than a picture.
 *
 * ## What each field means
 *
 * - `stakes` — how many items the board shows. Zero is a real expectation for the
 *   two states that are meant to be empty.
 * - `states` — the presentations that must be present, by name.
 * - `chalk` — what the slate is drawn as, for the states photographed in the room.
 *   Wiped, written, or struck through. Only Doors glow, so this is the only
 *   signal the sign has and it is worth asserting.
 */
const BOARD_EXPECTATIONS: Readonly<
  Record<string, { stakes: number; states?: string[]; chalk?: string }>
> = {
  'board-quiet': { stakes: 0, chalk: 'quiet' },
  'board-thin-basis': { stakes: 0, chalk: 'quiet' },
  'board-chalkboard-open': { stakes: 1, states: ['awaiting-week'], chalk: 'written' },
  'board-chalkboard-hit': { stakes: 1, states: ['resolved'], chalk: 'settled' },
  'board-chalkboard-missed': { stakes: 1, states: ['resolved'], chalk: 'settled' },
  'board-chalkboard-leader': { stakes: 1, states: ['resolved'], chalk: 'settled' },
  'board-line-pending': { stakes: 2, states: ['awaiting-week'], chalk: 'written' },
  'board-line-incomplete': { stakes: 2, states: ['awaiting-final'], chalk: 'written' },
  'board-line-won': { stakes: 2, states: ['resolved'], chalk: 'settled' },
  'board-line-lost': { stakes: 2, states: ['resolved'], chalk: 'settled' },
  'board-line-push': { stakes: 1, states: ['resolved'], chalk: 'settled' },
  // The three photographed on the paper: no slate to read, so no `chalk`.
  'board-bounty-open': { stakes: 1, states: ['awaiting-week'] },
  'board-bounty-missed': { stakes: 1, states: ['rolling'] },
  'board-bounty-claimed': { stakes: 1, states: ['resolved'] },
  'board-bounty-expired': { stakes: 1, states: ['expired'] },
  'board-retired-excluded': { stakes: 2, states: ['awaiting-week'] },
  'board-long-names': { stakes: 3, states: ['awaiting-week'] },
};

async function checkBoard(page: Page, width: number, state: string): Promise<void> {
  const expected = BOARD_EXPECTATIONS[state];
  if (expected === undefined) return;

  const at = `@${String(width)} ${state}`;

  const found = await page.evaluate(() => ({
    stakes: [...document.querySelectorAll('[data-stake]')].map((el) => ({
      key: el.getAttribute('data-stake') ?? '',
      state: el.getAttribute('data-stake-state') ?? '',
    })),
    chalk: document.querySelector('[data-chalk-state]')?.getAttribute('data-chalk-state') ?? null,
  }));

  if (found.stakes.length !== expected.stakes) {
    fail(
      'board',
      `${at} shows ${String(found.stakes.length)} stake(s), expected ${String(expected.stakes)}` +
        (expected.stakes > 0 && found.stakes.length === 0
          ? ' — if this is a demo state, DEMO_FIXTURES=1 is missing from the SERVER process'
          : ''),
    );
    return;
  }

  for (const want of expected.states ?? []) {
    if (!found.stakes.some((stake) => stake.state === want)) {
      fail(
        'board',
        `${at} has no stake presenting as "${want}"; found ` +
          `${found.stakes.map((stake) => `${stake.key}:${stake.state}`).join(', ') || 'nothing'}`,
      );
    }
  }

  if (expected.chalk !== undefined && found.chalk !== expected.chalk) {
    fail(
      'board',
      `${at} the slate is drawn as "${found.chalk ?? 'missing'}", expected "${expected.chalk}"`,
    );
  }

  /*
   * The words on the board, checked for the two things a picture cannot show.
   *
   * A brace means a template was filled from a fact that did not carry the value
   * — the *"Tony has the week at {line}"* failure, which is worse than a blank
   * board. `undefined` means a number reached the page from an unset field, which
   * is exactly how the market's own price line shipped reading "undefined off
   * your tab either way" until it was caught by looking.
   */
  const text = (await page.locator('body').innerText()) ?? '';
  if (/[{}]/.test(text)) {
    fail('board', `${at} a template brace reached the page`);
  }
  if (/\bundefined\b|\bNaN\b|\bnull\b/.test(text)) {
    fail('board', `${at} an unset value reached the page`);
  }
}

async function checkBackHall(page: Page, width: number, state: string): Promise<void> {
  const expected = BACK_HALL_STATES[state];
  if (expected === undefined) return;

  const found = await page.evaluate(() =>
    [...document.querySelectorAll('[data-room-object]')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({
        id: el.getAttribute('data-room-object') ?? '',
        kind: el.getAttribute('data-room-kind') ?? '',
        tag: el.tagName.toLowerCase(),
      })),
  );

  const at = `@${String(width)} ${state}`;
  const ids = found.map((object) => object.id).sort();

  if (ids.join(',') !== 'curtain,return,stairs') {
    fail('object-map', `${at} the back hall is ${ids.join(', ') || 'empty'}, expected curtain, return, stairs`);
    return;
  }

  if (found.some((object) => object.kind !== 'door')) {
    fail('object-map', `${at} everything in the back hall is a Door; found ${found.map((o) => `${o.id}:${o.kind}`).join(', ')}`);
  }

  const isOpen = (id: string): boolean => found.find((object) => object.id === id)?.tag === 'a';

  if (isOpen('stairs') !== expected.rooms) {
    fail(
      'back-hall',
      `${at} the stairs are ${isOpen('stairs') ? 'open' : 'shut'}, expected ${expected.rooms ? 'open' : 'shut'} — ` +
        'if this is a demo state, DEMO_FIXTURES=1 is missing from the SERVER process',
    );
  }

  if (isOpen('curtain') !== expected.underground) {
    fail(
      'back-hall',
      `${at} the curtain is ${isOpen('curtain') ? 'open' : 'shut'}, expected ${expected.underground ? 'open' : 'shut'}`,
    );
  }

  // The way out is never shut, in any state.
  if (!isOpen('return')) {
    fail('back-hall', `${at} the way back to the parlor is not a link`);
  }

  /*
   * The chain is a state of the door, not part of the room.
   *
   * It was part of the room for one round, and the open state photographed a
   * chained stairwell a manager could walk down. Nothing failed and the picture
   * simply contradicted the page — the shape of defect only a screenshot finds,
   * on the one state nobody will look at until the day it ships.
   */
  const chained = await page.evaluate(() => document.querySelectorAll('.bg-ink-100\\/70').length > 0);
  if (chained !== !expected.rooms) {
    fail(
      'back-hall',
      `${at} the stairs are ${expected.rooms ? 'open' : 'shut'} but the chain is ${chained ? 'drawn' : 'gone'}`,
    );
  }

  /*
   * **Never labelled CASINO on first discovery** (`18 §5`), asserted against the
   * rendered page rather than against the source strings. The unit test pins the
   * copy; this catches the word arriving from anywhere else — an accessible
   * label, a title attribute, a stray heading.
   */
  const text = await page.evaluate(() => document.body.innerText + ' ' + document.body.innerHTML);
  if (/casino|blackjack|roulette/i.test(text)) {
    fail('back-hall', `${at} names what is behind the curtain`);
  }
}

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
/**
 * A reveal state must contain a reveal.
 *
 * ## The false green this exists to stop
 *
 * The nine `reveal-*` states are all driven by `?preview_reveal=`, which the
 * **server** resolves behind `assertDemoAllowed(process.env)`. The workflow set
 * `DEMO_FIXTURES=1` on the *driver* step and not on the step that starts the
 * server, so every one of those requests came back as an ordinary parlor page —
 * and the driver photographed a calm room nine times, named the files
 * `reveal-legendary` and friends, and reported **passed**.
 *
 * That is the worst failure this harness can have. A missing state is visible in
 * the file list; a state that captured the wrong thing is a green tick on
 * evidence nobody re-examines, and the rarity-contrast gate above was silently
 * measuring nothing on the one surface it was written for.
 *
 * The workflow is fixed. This is here because a wiring fix protects one cause
 * and this protects the *symptom* — an empty artifact fails the build whatever
 * made it empty.
 *
 * ## What it asserts
 *
 * The plate, the rarity word, and — for the three composition states — whether
 * Tony's offer is present or absent, which is the whole point of each of them.
 * `reveal-no-offer` asserting the **absence** matters as much as the others:
 * the commissioner's ruling is that an unaffordable box produces no pitch at
 * all, and "no offer" and "no reveal" look identical in a file listing.
 */
async function checkRevealPresent(page: Page, width: number, state: string): Promise<void> {
  const found = await page.evaluate(
    'JSON.stringify((function () {' +
      'var pad = document.querySelector(".tony-line");' +
      'var padOpacity = pad === null ? 0 : Number(getComputedStyle(pad).opacity);' +
      'var plate = document.querySelector(\'[role="status"]\');' +
      'if (plate === null) return { plate: false, item: false, text: "", padOpacity: padOpacity };' +
      'return {' +
      '  plate: true,' +
      '  item: document.querySelector(".reveal-rise") !== null,' +
      '  text: (plate.textContent || "").trim(),' +
      '  padOpacity: padOpacity,' +
      '};' +
      '})())',
  );

  const seen = JSON.parse(found as string) as {
    plate: boolean;
    item: boolean;
    text: string;
    padOpacity: number;
  };

  if (!seen.plate || !seen.item) {
    fail(
      'reveal',
      `@${String(width)} ${state} photographed no reveal — the plate ` +
        `${seen.plate ? 'is' : 'is not'} present and the collectible ` +
        `${seen.item ? 'is' : 'is not'}. The server needs DEMO_FIXTURES=1.`,
    );
    return;
  }

  // Every reveal names its tier. Without this the state could "pass" on a plate
  // that rendered but lost the signal the plate exists to carry.
  if (!/rare|common|epic|legendary/i.test(seen.text)) {
    fail('reveal', `@${String(width)} ${state} shows a plate with no rarity word`);
  }

  const offered = /Tony/.test(seen.text);

  if (state === 'reveal-no-offer' && offered) {
    fail(
      'reveal',
      `@${String(width)} ${state} makes an offer. An unaffordable box gets no pitch at all.`,
    );
  }

  if ((state === 'reveal-first-offer' || state === 'reveal-complete-offer') && !offered) {
    fail('reveal', `@${String(width)} ${state} shows no offer, which is what it is for`);
  }

  /*
   * **Tony's order pad is not on screen while the plate is.**
   *
   * *"Do not stack an independent dialogue panel on top of the reveal."* The
   * room already has the mechanism — `data-parlor-focus` on `body`, which
   * `globals.css` uses to fade the pad — but until now nothing checked that it
   * fired. It is one `useEffect` away from silently not firing, and the symptom
   * is two cream panels over the lower third: the exact defect the focus rule
   * was written against, and one the driver was hiding from itself by
   * dismissing the pad before every reveal screenshot.
   */
  if (seen.padOpacity > 0.05) {
    fail(
      'reveal',
      `@${String(width)} ${state} shows Tony's order pad at opacity ` +
        `${seen.padOpacity.toFixed(2)} on top of the reveal — the room's focus never yielded`,
    );
  }
}

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

          // The back hall's own map, and whether the doors match the state's name.
          if (state.startsWith('back-hall')) {
            await checkTargets(page, width);
            await checkBackHall(page, width, state);
          }

          // Every reveal state must actually contain a reveal. See the note on
          // `checkRevealPresent` — this gate exists because nine of them did not.
          if (state.startsWith('reveal-') || state === 'tray-reveal') {
            await checkRevealPresent(page, width, state);
          }

          // Every named Slice edition must actually be that edition.
          if (state.startsWith('slice-')) {
            await checkEditionPresent(page, width, state);
          }

          // Every named board state must actually be that board.
          if (state.startsWith('board-')) {
            await checkBoard(page, width, state);
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
