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
import sharp from 'sharp';

import { CANVAS as CHARACTER_CANVAS } from '../lib/character/art/geometry.ts';
import { CHARACTER_SCALES } from '../components/character/character-view.tsx';
import { TYPE_FLOOR_PX } from '../lib/design/type.ts';
import { QUARANTINE_CEILING, quarantineFor } from './visual-qa-quarantine.ts';
import { CAPTURE } from './visual-qa-capture';
import { demoPin } from '../lib/demo/seat.ts';
import {
  HarnessRefusal,
  assertServerIsOurBuild,
  assertVisualDatabaseIsolated,
} from './harness.ts';

/**
 * The only `data-environmental-type` this product declares.
 *
 * Text painted onto the artwork, sized in the artwork's own units. See
 * `components/scene/banner-rail.tsx` for the whole reasoning and
 * `lib/design/typography.test.ts` for the static half of the same rule.
 */
const ENVIRONMENTAL_TYPE = 'banner-year';

const BASE = process.env['VISUAL_QA_BASE'] ?? 'http://localhost:3111';
const OUT = process.env['VISUAL_QA_OUT'] ?? 'visual-qa';
const PIN = process.env['VISUAL_QA_PIN'] ?? demoPin();

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

/**
 * Hydration messages, as the pages themselves reported them.
 *
 * Module-scoped beside `failures` and for the same reason: it outlives the
 * per-width browser context, so `report.json` carries every sighting from the
 * whole run rather than only the last width's.
 */
const sightings: (HydrationSighting & { state: string; width: number })[] = [];

/**
 * Console errors matching a known-defect entry, counted rather than fired.
 *
 * Module-scoped for the same reason as `sightings`: the ceiling is a property of
 * **the sweep**, not of one width, and the whole point of the number is that a
 * deterministic mismatch clears it by appearing at every width.
 */
const quarantined: { debt: number; why: string; detail: string }[] = [];

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
  /*
   * The front door, signed out — the three screens every manager meets before
   * the product has any state about them, and the only V1 surfaces that had
   * never been photographed. They carry the PIN form, which is the one place in
   * the product with text inputs, so they are also the only place the 16px
   * iOS-zoom floor and the tap-target rule were unmeasured.
   *
   * They sit **last** in `ALL_STATES` because reaching them means signing out,
   * and every other state needs a session.
   */
  | 'door'
  | 'door-claim'
  | 'door-return'
  | 'idle'
  /*
   * The settled room, photographed *after* the arrival's reveal has come and
   * gone — the moment the commissioner was looking at when Tony clipped. Its
   * gate is `checkTonySteady`, which does its own timed passes; the screenshot
   * is the still the passes are about.
   */
  | 'tony-steady'
  | 'reduced-motion'
  | 'character-empty'
  | 'character-dressed'
  | 'character-equipped'
  | 'character-default'
  | 'character-tallest'
  | 'character-widest'
  | 'character-balding-visor'
  | 'character-every-slot'
  | 'character-long-hair-apron'
  | 'character-retired-options'
  | 'character-editing'
  | 'character-saved'
  | 'tony-dialogue'
  /*
   * A Display opened **without** putting Tony's line away first.
   *
   * Every other Display state calls `dismissTony` before it taps, which is
   * exactly why visual debt 4 survived: the pad sat behind the panel's scrim,
   * so every board screenshot was clean and a manager who tapped the sign
   * mid-sentence was not. This is the state that photographs what they saw.
   */
  | 'display-over-tony'
  | 'tonight-board'
  | 'banner-completed'
  | 'banner-current-tbd'
  | 'rack'
  /*
   * Champions & history, and the reason it is on this list at all.
   *
   * `/timeline` is a v1 surface reachable from every champion banner's *View
   * season*, and the driver had **never photographed it** — the same shape of
   * gap as `demo-tray-empty`, where the box-free parlor turned out never to
   * have been captured. A route the gates have never seen is a route where the
   * type floor, the colour fidelity and the tap targets are all unverified.
   */
  | 'timeline'
  /**
   * The three v1 routes the gate had never looked at, added together because
   * the gap was one gap.
   *
   * `/profile` is the key ring — the device list and *sign out everywhere*, the
   * only place in the product a manager can end a session they no longer
   * control. `/rooms` is the chained basement door, which nobody will open for a
   * year, so nobody would notice it looking wrong. `/admin` is the office.
   *
   * A route the driver has never reached has an unverified type floor, colour
   * fidelity, tap targets and reduced-motion promise — and this exact shape has
   * produced a real defect on **first capture**, twice: the Timeline's sign read
   * `CHAMPIONS $ HISTORY` (#69) and the door's PIN label broke `IT` onto its own
   * line at 360 (#75).
   */
  | 'profile'
  /**
   * The same screen with a second key cut, and the destructive control that
   * only exists then.
   *
   * *"Change the locks everywhere"* renders only at two or more sessions, and it
   * is the one irreversible action on any manager-facing page. It was reaching
   * film **by accident**: the widths share a database and each signs in again,
   * so `profile` photographed 1 device at 390, 2 at 375 and 3 at 360 — three
   * files with one name meaning three screens, and a single-state run making a
   * fourth. That is the defect the door states' own comment names.
   *
   * Both states build their own precondition now, so both mean one thing.
   */
  | 'profile-devices'
  /*
   * The basement, and the eight states it needs to mean one thing each.
   *
   * `rooms` used to be one state photographing a chained door. The room behind
   * it is now built, and every one of these **builds its own precondition** —
   * the theme is set and the four places are emptied or filled through the
   * product's own controls before the shutter opens.
   *
   * That is not decoration. The three widths share a database, so a state that
   * merely navigated would photograph whatever the previous width left behind:
   * `room` empty at 390 and furnished at 375, under one name. That is exactly
   * the defect `profile` shipped and `C2` records, and it is cheaper to refuse
   * it here than to discover it in a screenshot nobody compares.
   */
  | 'room'
  | 'room-furnished'
  | 'room-slot'
  | 'room-corridor'
  | 'room-rec'
  | 'room-cold'
  | 'room-visited'
  | 'room-empty'
  | 'office'
  /**
   * The commissioner queue — *"what needs my approval?"* — in its four answers.
   *
   * `office` is the empty one and keeps its name: it is the state Alex meets
   * today, because the 2026 season has no games and nothing has been drafted.
   * These are the three that have something on them plus the whole desk, and
   * they exist because a governance screen that has only ever been photographed
   * empty is a governance screen nobody has looked at.
   *
   * Three of them narrow the queue with `?queue=<band>`, a server-resolved
   * preview behind both demo guards that **filters and fabricates nothing**. The
   * reason is the one `review-empty` records: an issue belongs to the league
   * rather than to a seat, and the driver loops widths on the outside, so an
   * unnarrowed "one paper is waiting" would photograph one item at 390 and four
   * at 360 under a single name.
   */
  | 'office-ready'
  | 'office-blocked'
  | 'office-printed'
  | 'office-queue'
  | 'prediction'
  | 'receipt'
  | 'counter'
  | 'back-hall'
  /*
   * The hall with everything shut — **what a revert produces**, not what a
   * manager sees.
   *
   * Until the basement shipped this was the default and needed no state of its
   * own; `back-hall-rooms-open` was the special case. Opening `rooms` inverted
   * that, and `BACK_HALL_BOUNDARY §5`'s reasoning survives the inversion
   * unchanged: the state nobody will see unless something is reverted is
   * precisely the one where being wrong is least recoverable.
   */
  | 'back-hall-shut'
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
  | 'demo-rings-none'
  | 'demo-rings-one'
  | 'demo-rings-many'
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
  | 'slice-monday-comeback'
  | 'reveal-common'
  | 'reveal-rare'
  | 'reveal-epic'
  | 'reveal-legendary'
  | 'reveal-first-offer'
  | 'reveal-complete-offer'
  | 'reveal-no-offer'
  /*
   * `16 §8`'s salvage, which `0014` made real: the tier is complete, so the
   * plate names the tokens rather than the shelf. Photographed for the same
   * reason the four rarities are — the outcome depends on owning a whole tier,
   * which no harness can arrange from a URL.
   */
  | 'reveal-spare'
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
  | 'pick-refused'
  /*
   * The press desk — the commissioner review chain (`16 §9`, `08 §22`).
   *
   * Six states because the decision has six shapes, and `review-empty` leads for
   * the reason `demo-tray-empty` did: it is **what a commissioner meets today**,
   * and a screen reviewed only in its busy state is a screen reviewed in the
   * state nobody is in.
   *
   * Each signs in at its own reserved seat, which carries the commissioner's
   * keys — `requireAdmin()` answers `notFound()`, so an ordinary seat would
   * photograph a 404 and file it under the state's name.
   */
  | 'review-empty'
  | 'review-waiting'
  | 'review-refused'
  | 'review-approved'
  | 'review-published'
  | 'review-held'
  /** One draft, opened from the queue. The proof sheet, as it will print. */
  | 'review-draft'
  /**
   * The same draft, scrolled to the stamp.
   *
   * Screenshots here are one phone screen, and the review screen puts its
   * actions **below the paper** on purpose so that approving without reading is
   * not the default gesture. The consequence went unnoticed until the queue was
   * built: the single most consequential control in the product — the one that
   * puts a week of league history in front of ten people — was off the bottom of
   * every picture ever taken of the screen it lives on.
   */
  | 'review-decision'
  /*
   * The draft-review special (`docs/PRESEASON_SLICE_BOUNDARY.md`).
   *
   * Nine states, and each one answers a question no other does: the two rack
   * editions are the **issue** at its fullest and at its sparsest; the three
   * board states are `0`, `4` and `10` of ten, which is the only number on that
   * screen; the two editor states are a manager Tony has written and one he has
   * not, photographed from the same database; and the last two are the issue on
   * the desk and the issue on the rack.
   */
  | 'slice-preseason-draft-review'
  | 'slice-preseason-sparse'
  /**
   * The same sparse issue, scrolled to the **last** of its ten sections.
   *
   * Captures are viewport-sized, so every picture ever taken of this paper was
   * of its masthead. The draft review's whole body is ten team sections below
   * that fold — the long names, the grades beside them and the takes at their
   * maximum length are all in the half nobody had photographed, and the DOM
   * gates that count them cannot show whether they *read*.
   *
   * The tenth rather than the first, because the tenth is the one a short list
   * would be missing and it is the one a scroll has to survive to reach.
   *
   * Not named `slice-*`: `checkEditionPresent` derives the expected edition key
   * from that prefix, and this state renders `preseason-sparse` under its own
   * name.
   */
  | 'preseason-teams'
  | 'draft-board-empty'
  | 'draft-board-partial'
  | 'draft-board-complete'
  | 'draft-editor-blank'
  | 'draft-editor-written'
  | 'preseason-review'
  | 'preseason-rack';

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
  /*
   * The reveal buys its own box, and now needs its own **tab** to buy it with.
   *
   * It used to run on the shared signed-in seat, and `reach`'s comment recorded
   * the assumption that made that work: *"each width buys its own box out of the
   * season's opening balance, **which covers several at the provisional
   * price**."* At 50 tokens the 250-token opening balance covered five. The
   * commissioner's ruling moved the box to 200, so it covers **one** — and the
   * second width found an empty tab and hung on a fifteen-second wait for a
   * purchase the database was right to refuse.
   *
   * `no-box` seats a fresh manager with the opening balance and an empty tray,
   * and `reachDemo` mints one **per width** — so each capture buys with its own
   * 250 rather than three widths sharing one. The purchase, the ledger and the
   * balance check are all still exercised; what changed is whose money it is.
   */
  'tray-reveal': 'no-box',
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
  'demo-rings-none': 'rings-none',
  'demo-rings-one': 'rings-one',
  'demo-rings-many': 'rings-many',
  /*
   * A basement belonging to a manager with nothing to put in it.
   *
   * Borrows `collection-empty` rather than adding a demo state of its own,
   * because the room needs exactly what that seat is — a real manager who has
   * never pulled anything — and nothing arranged beyond it. It is the state a
   * manager meets on their first trip downstairs and the only one that can
   * prove the four empty places say something.
   */
  'room-empty': 'collection-empty',
  /*
   * The six states of a room somebody actually keeps things in, plus the visit.
   *
   * All on one seat, because `demoSleeperId` keys a seat by state key and
   * generation — so `collection-full` is the *same* manager each time and each
   * state rebuilds the room from whatever the last one left it as. That is what
   * makes them fixed points rather than an ordered sequence.
   */
  room: 'collection-full',
  'room-furnished': 'collection-full',
  'room-slot': 'collection-full',
  'room-corridor': 'collection-full',
  'room-rec': 'collection-full',
  'room-cold': 'collection-full',
  'room-visited': 'collection-full',
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
  /*
   * The two states that **drive the customiser** rather than photograph it.
   *
   * They start from the empty wardrobe, because that is the manager every real
   * seat is today, and the thing being photographed is the controls and the save
   * — not what is in the drawer.
   */
  'character-editing': 'character-empty',
  'character-saved': 'character-empty',

  /*
   * The press desk. Every one of these seats is an admin seat — set by
   * `ensureDemoSeat` behind both demo guards, so the flag can only ever land on
   * a `demo:`-prefixed fixture and can never be set in production at all.
   */
  'review-empty': 'review-empty',
  'review-waiting': 'review-waiting',
  'review-refused': 'review-refused',
  'review-approved': 'review-approved',
  'review-published': 'review-published',
  'review-held': 'review-held',
  // The detail screen, reached by opening the queue's one waiting draft.
  'review-draft': 'review-waiting',
  // The same draft, scrolled to the stamp. Same seat, same draft, lower down.
  'review-decision': 'review-waiting',
  // The office. Borrowed for the commissioner's keys — see `reach`.
  office: 'review-empty',

  /*
   * The office queue. Each has its own demo state, and all four arrange the
   * *same* desk — one paper of each kind — because what differs between the
   * four screens is which bands the preview parameter shows, not what is in the
   * database. Applying them in any order at any width lands on the same rows.
   */
  'office-ready': 'office-ready',
  'office-blocked': 'office-blocked',
  'office-printed': 'office-printed',
  'office-queue': 'office-queue',

  /*
   * Tony's draft board. Commissioner seats, like the press desk, and for the
   * same reason: `requireAdmin()` answers `notFound()` and a 404 photographs
   * cleanly.
   *
   * The two editor screens share `draft-board-partial`'s seat deliberately —
   * *"written"* and *"blank"* are two rows of one board, and photographing them
   * from two different databases would make the pair prove less than either one
   * alone.
   */
  'draft-board-empty': 'draft-board-empty',
  'draft-board-partial': 'draft-board-partial',
  'draft-board-complete': 'draft-board-complete',
  'draft-editor-blank': 'draft-board-partial',
  'draft-editor-written': 'draft-board-partial',
  'preseason-review': 'preseason-review',
  'preseason-rack': 'preseason-published',
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
 * A User-Agent that `deviceLabel` reads as a different device.
 *
 * Real, and real matters: `lib/auth/session.ts` derives the label by matching
 * `iPhone` and then `Safari` in the header the browser sent. A made-up string
 * would test the regular expression rather than the product.
 */
const OTHER_DEVICE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

/**
 * Leave this manager holding exactly one key.
 *
 * Through the product and nothing else: *"Change the locks everywhere"* revokes
 * every session including this one, so the page lands back at the door and signs
 * in again — one row, deterministically, whatever ran before.
 *
 * **No database hook and no auth bypass**, deliberately. A helper that deleted
 * `sessions` rows would make the screenshot depend on a mechanism the product
 * does not have, and it would stop the precondition from being evidence that
 * revocation works. This way the destructive control is exercised on every
 * sweep, at every width, before it is photographed.
 *
 * The button is absent when only one session exists, which is the ordinary case
 * at the first width. Absent is the goal already met, so it is not an error.
 */
async function onlyThisDevice(page: Page): Promise<void> {
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });

  const revoke = page.locator('[data-sign-out-everywhere]');
  if ((await revoke.count()) === 0) return;

  await revoke.click();
  // Every session is dead, including this one, so the next page is the door.
  await page.waitForURL((url) => url.pathname.startsWith('/door'), { timeout: 20_000 });
  await signIn(page);
}

/**
 * Sign in as the same manager from a second, visibly different device.
 *
 * Its own browser context, so its own cookie jar: this is a second sign-in
 * rather than a shared session, which is what puts a second row in `sessions`.
 * The context is closed immediately — the row survives it, the way a real
 * manager's other phone does after they put it down.
 */
async function signInFromAnotherDevice(page: Page): Promise<void> {
  const browser = page.context().browser();
  if (browser === null) throw new Error('no browser to open a second device from');

  const other = await browser.newContext({
    viewport: { width: 390, height: 664 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: OTHER_DEVICE_UA,
  });

  try {
    await signIn(await other.newPage());
  } finally {
    await other.close();
  }
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
  /*
   * Waits for the **navigation**, not for a fixed number of milliseconds.
   *
   * This used to `waitForTimeout(2500)` and then assert the URL, which is a race
   * dressed as a check: the assertion is *"the door opened"* and the evidence
   * was *"two and a half seconds elapsed"*. It aborted a sweep at 78% — thirty-
   * four sign-ins had succeeded, the thirty-fifth was simply slower than the
   * sleep, and the same seat signed in correctly the moment it was tried by
   * hand. Nothing was wrong with the product; the harness had asserted a clock.
   *
   * `waitForURL` waits for the condition itself and gives it a real budget, so a
   * loaded machine costs time rather than a false failure — and a genuinely
   * broken door still fails, in fifteen seconds instead of two and a half.
   */
  const submit = async (): Promise<boolean> => {
    await page.fill('input[name="pin"]', pin);
    if ((await page.locator('input[name="confirm"]').count()) > 0) {
      await page.fill('input[name="confirm"]', pin);
    }
    await page.click('button[type="submit"]');

    try {
      await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
      return true;
    } catch {
      // The door did not open in fifteen seconds. That is either a wrong PIN —
      // the claim-versus-sign-in case below — or a real failure, and the caller
      // decides which by trying once more.
      return false;
    }
  };

  if (await submit()) return;

  // Already claimed on an earlier run: the same form is now sign-in.
  await page.goto(doorUrl, { waitUntil: 'networkidle' });
  if (await submit()) return;

  throw new Error(`could not sign in at ${doorUrl}; stuck at ${page.url()}`);
}

/**
 * Put the browser back outside the shop.
 *
 * Clearing cookies rather than hitting a sign-out route: the session is a
 * cookie, the door is what an unauthenticated visitor sees, and this reproduces
 * a first-ever visit rather than a logout — which is the state these three
 * screens are actually for.
 */
async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto(`${BASE}/door`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
}

/** The tag text the door prints for a manager who has set a PIN. */
const TAKEN = /taken/i;

/**
 * Leave the browser signed out, with at least one manager holding a PIN.
 *
 * Both facts are needed and neither can be assumed. `door` and `door-return`
 * want a board that shows both tag states, and on a freshly seeded database
 * nobody has ever set a PIN — but by the time a *full sweep* reaches these
 * states the page is signed in, and `signIn` begins by navigating to `/door`,
 * which redirects a signed-in visitor straight back to the parlor. So the naive
 * "sign in, then sign out" worked in a single-state run and timed out at the end
 * of the sweep, waiting for a link that was never going to render.
 *
 * Signing out **first** removes the difference between the two cases, and the
 * claim is then skipped entirely when the board already shows a `taken` tag —
 * which is what makes this idempotent rather than merely ordered.
 */
async function ensureClaimedManager(page: Page): Promise<void> {
  await signOut(page);
  if ((await page.locator('main li a').filter({ hasText: TAKEN }).count()) > 0) return;
  await signIn(page);
  await signOut(page);
}

/**
 * The states that must **not** carry a session.
 *
 * Named as a set rather than inferred from the `door-` prefix, so a future
 * `door-something` that genuinely needs a session is a decision here rather than
 * a surprise at capture time.
 */
const SIGNED_OUT = new Set<StateName>(['door', 'door-claim', 'door-return']);

/* -------------------------------------------------------------------------
 * The basement
 * ---------------------------------------------------------------------- */

/**
 * Open a room object and wait for its panel.
 *
 * The hit regions are transparent and sit under nothing, but Playwright's
 * actionability check still measures them against a scrim that may be mid-fade,
 * so `force` skips a wait that has no bearing on whether the tap lands. Same
 * reasoning the parlor's own states use.
 */
async function openRoomObject(page: Page, id: string): Promise<void> {
  await page.locator(`[data-room-object="${id}"]`).first().click({ force: true });
  await page.locator('[data-room-panel]').first().waitFor({ timeout: 15_000 });
  // Past the panel's rise, so the capture is not caught mid-animation.
  await page.waitForTimeout(500);
}

/** Take whatever panel is up back down, and wait until nothing is. */
async function closeRoomPanel(page: Page): Promise<void> {
  if ((await page.locator('[data-room-panel]').count()) === 0) return;
  await page.keyboard.press('Escape');
  await page.locator('[data-room-panel]').first().waitFor({ state: 'detached', timeout: 15_000 });
}

/**
 * Put the room into a known state, through the room's own controls.
 *
 * ## Why the driver does this rather than the demo CLI
 *
 * `MANDATE §8` prefers a state reached by **driving the real system**, and this
 * is the only place in the sweep that presses `placeInSlotAction`,
 * `clearSlotAction` and `setThemeAction`. A screenshot of a room proves the room
 * renders; tapping the controls proves the room *works* — which is the exact
 * distinction `character-saved` was added for after every Save had been
 * returning a 500 behind three green gates.
 *
 * ## Why it is unconditional
 *
 * The three widths share one database and run the full state list each, so a
 * state that only navigated would photograph whatever the previous width left
 * behind. `fill: false` empties every place and `fill: true` fills every place,
 * from whatever the room happened to be in — so both are fixed points and both
 * mean one thing at all three widths.
 */
async function furnishRoom(
  page: Page,
  options: { fill: boolean; theme: string },
): Promise<void> {
  await page.goto(`${BASE}/rooms`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  for (const slot of ROOM_SLOTS) {
    await openRoomObject(page, slot);

    const here = page.getByRole('button', { name: /^Take .* down$/ });
    /*
     * **`Put`, never `Move`**, and that distinction was a real defect in this
     * helper rather than a nicety.
     *
     * The picker lists everything the manager holds, labelled by what tapping it
     * would do: `Put X here` for something that is nowhere, `Move X here, from
     * …` for something already on a shelf. Matching both took the first row
     * every time — which after the first slot was filled was *the item already
     * in it* — so each place stole the last one's contents and the room ended
     * with exactly one thing in it, four times over. The gate caught it, which
     * is the whole reason the gate counts rather than trusting the drive.
     */
    const put = page.getByRole('button', { name: /^Put .* here$/ });

    if (options.fill) {
      // Already holding something? Leave it — refilling would only reshuffle
      // which item is where, and the state has to be stable across widths.
      if ((await here.count()) === 0 && (await put.count()) > 0) {
        await put.first().click();
        await page.waitForTimeout(900);
      }
    } else if ((await here.count()) > 0) {
      await here.first().click();
      await page.waitForTimeout(900);
    }

    await closeRoomPanel(page);
  }

  // The theme, from the panel that carries the room's own decisions.
  await openRoomObject(page, 'manager');
  const choice = page.getByRole('button', { name: new RegExp(options.theme, 'i') });
  if ((await choice.getAttribute('aria-pressed')) !== 'true') {
    await choice.click();
    await page.waitForTimeout(900);
  }
  await closeRoomPanel(page);

  /*
   * Give the focus ring back.
   *
   * `RoomPanel` returns focus to the object that opened it, which is correct
   * behaviour and is what `keyboard-focus` exists to photograph. Here it is an
   * artefact of how the state was built: every room screenshot came out with a
   * yellow rectangle round the manager because the theme picker was the last
   * thing closed. A state must photograph the room, not the driver's last tap.
   */
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.waitForTimeout(150);
}

/** The four places, in the order `lib/rooms/objects.ts` declares them. */
const ROOM_SLOTS = ['shelf_left', 'shelf_right', 'wall', 'bench'] as const;

async function reach(page: Page, state: StateName): Promise<void> {
  switch (state) {
    /*
     * The key board. Ten names, and whether each key is on its hook.
     *
     * It signs in first and then signs out so that **one** manager is always
     * claimed. Without that the board's content depends on what ran before it:
     * a full sweep reaches here after sign-in and photographs a `taken` tag, a
     * `--state=door` run on a fresh database photographs ten identical `on the
     * hook` rows, and the two artifacts carry the same name. One sign-in makes
     * the state deterministic *and* puts both tag variants in the same frame,
     * which is the more useful picture anyway.
     */
    case 'door':
      await ensureClaimedManager(page);
      return;

    /*
     * **New key** — a manager who has never signed in. Red plate, two fields,
     * and the six-digits paragraph.
     *
     * Found by tag rather than by name or index: which managers are claimed
     * depends on what ran before this in the sweep, and a hardcoded name would
     * photograph the *other* screen the day that changed.
     */
    case 'door-claim': {
      await signOut(page);
      const unclaimed = page.locator('main li a').filter({ hasNotText: TAKEN }).first();
      if ((await unclaimed.count()) === 0) throw new Error('no unclaimed manager on the door');
      await unclaimed.click();
      await page.waitForURL(/\/door\/[0-9a-f-]{36}/, { timeout: 20_000 });
      await page.waitForTimeout(300);
      return;
    }

    /*
     * **Welcome back** — the same route for a manager who already has a PIN.
     * Blue plate, one field, no explanation.
     *
     * It signs in first and then signs out, because a claimed manager is not a
     * fixture: on a freshly seeded database nobody has a PIN, so asking for this
     * screen without making one would silently photograph the claim screen
     * again under this name. `signIn` claims Alex if needed and is idempotent.
     */
    case 'door-return': {
      await ensureClaimedManager(page);
      const claimed = page.locator('main li a').filter({ hasText: TAKEN }).first();
      if ((await claimed.count()) === 0) throw new Error('no claimed manager on the door');
      await claimed.click();
      await page.waitForURL(/\/door\/[0-9a-f-]{36}/, { timeout: 20_000 });
      await page.waitForTimeout(300);
      return;
    }

    case 'tony-dialogue':
      await home(page);
      return;
    /*
     * `idle` settles **past the arrival's reveal** — 4900ms plus its ramp.
     *
     * It is the room's canonical portrait and the state where every object is
     * live, so it is the one that must be photographed with nothing prompted.
     * At 2500ms it was a room mid-reveal wearing the calm room's name. The
     * other homepage states keep the shorter settle: none of them judges the
     * unprompted room, and three seconds each across a sweep this size is real.
     */
    case 'idle':
      await home(page, 5400);
      await dismissTony(page);
      return;
    case 'six-banners':
      await home(page);
      await dismissTony(page);
      return;
    /*
     * A first visit, left alone until the arrival's reveal has finished — 4900ms
     * plus its 260ms ramp. Everything before that settles is animation; this is
     * the room as it actually sits, which is the state the clipping report was
     * about and the one no capture in this driver had ever taken.
     */
    case 'tony-steady':
      await page.evaluate(FORGET_ARRIVAL);
      await home(page, 5400);
      return;
    case 'tonight-board':
      await home(page);
      await dismissTony(page);
      await page.getByRole('button', { name: /Read the board/i }).click({ force: true });
      return;

    /*
     * Deliberately no `dismissTony`. The pad is up, the manager taps the board,
     * and `checkOneTransient` counts what is on screen.
     */
    case 'display-over-tony':
      await home(page);
      await page.getByRole('button', { name: /Read the board/i }).click({ force: true });
      await page.waitForTimeout(400);
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
     * The key ring, holding exactly one key.
     *
     * Reached directly rather than through the room, because it hangs off the
     * utility bar rather than off a parlor object — `18 §3` gives the homepage
     * eight interactive objects and this is not one of them.
     *
     * `onlyThisDevice` is the precondition, and it is the same idea as
     * `ensureClaimedManager` on the door: a state whose content depends on what
     * ran before it is a state with three meanings and one filename.
     */
    case 'profile':
      await onlyThisDevice(page);
      await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      return;

    /*
     * The key ring with a second key on it.
     *
     * The second session is made by **signing in again from another device** —
     * the real front door, the real form, the real PIN — in a context carrying
     * an iPhone Safari User-Agent. Nothing is inserted, nothing is stubbed and
     * no token is copied: `deviceLabel` reads the header the browser actually
     * sent, so the two rows are `iPhone · Safari` and `Unknown device · Chrome`
     * rather than two identical lines distinguishable only by a date.
     *
     * That distinction is the screen's whole job. *"Is that my phone?"* cannot
     * be answered by a list of three identical labels, and a capture of one
     * would have verified nothing about the label at all.
     */
    case 'profile-devices':
      await onlyThisDevice(page);
      await signInFromAnotherDevice(page);
      await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      return;

    /*
     * The chained basement door.
     *
     * Navigated to rather than reached through the Back Hall on purpose: the
     * door *there* is flag-gated and shut in v1, but `/rooms` itself only
     * requires a session, so this is the page as any manager who guesses the URL
     * would find it. `back-hall-rooms-open` already photographs the doorway.
     */
    /* ---- The basement ------------------------------------------------- */
    /*
     * Every room state sets the room up **through the product's own controls**
     * before it photographs it, so the same name means the same screen at all
     * three widths. See the note on `StateName`.
     *
     * It is also the only place in this sweep that exercises
     * `placeInSlotAction`, `clearSlotAction` and `setThemeAction`. A screenshot
     * of a room is not a test of the room; pressing the buttons is — the same
     * argument `character-saved` was added for.
     */
    case 'room':
      await furnishRoom(page, { fill: false, theme: 'The storeroom' });
      await page.waitForTimeout(400);
      return;

    case 'room-furnished':
      await furnishRoom(page, { fill: true, theme: 'The storeroom' });
      await page.waitForTimeout(400);
      return;

    /* The picker, on a place that already has something on it. */
    case 'room-slot':
      await furnishRoom(page, { fill: true, theme: 'The storeroom' });
      await openRoomObject(page, 'shelf_left');
      return;

    case 'room-corridor':
      await furnishRoom(page, { fill: true, theme: 'The storeroom' });
      await openRoomObject(page, 'corridor');
      return;

    case 'room-rec':
      await furnishRoom(page, { fill: true, theme: 'The rec room' });
      await page.waitForTimeout(400);
      return;

    case 'room-cold':
      await furnishRoom(page, { fill: true, theme: 'The cold store' });
      await page.waitForTimeout(400);
      return;

    /*
     * Somebody else's room, reached the way a manager reaches it: through the
     * corridor door, by name. Navigating to a `/rooms/<uuid>` literal would
     * photograph the same page and prove nothing about how anybody gets there.
     */
    case 'room-visited': {
      await furnishRoom(page, { fill: true, theme: 'The storeroom' });
      await openRoomObject(page, 'corridor');

      /*
       * A champion's door, when the corridor has one.
       *
       * A visited room is always a **real league manager's**, because demo
       * seats are excluded from `activeLeagueManagers` and therefore from
       * `visitable()` — so nobody's room down here has anything on a shelf
       * yet. What a real manager's room *can* have is a championship, and the
       * seed grants two from verified titles. Preferring that door means this
       * state photographs the rail with something on it rather than four empty
       * places and nothing else.
       *
       * Falls back to the first door rather than failing: a database with no
       * champion is a legitimate state and not this gate's business.
       */
      const doors = page.locator('[data-room-panel] a[href^="/rooms/"]');
      const champion = doors.filter({ hasText: /title/i });
      const target = (await champion.count()) > 0 ? champion.first() : doors.first();

      await target.click();
      await page.waitForURL(/\/rooms\/[0-9a-f-]{36}/, { timeout: 20_000 });
      await page.waitForTimeout(700);
      return;
    }

    /*
     * A manager who owns nothing at all.
     *
     * Demo-backed, because every seeded manager owns something by the time the
     * driver gets here — the same reason `demo-collection-empty` exists. It is
     * the state a manager meets on their very first trip downstairs, and the one
     * that has to prove the four empty places say something rather than nothing.
     */
    case 'room-empty':
      await page.goto(`${BASE}/rooms`, { waitUntil: 'networkidle' });
      await openRoomObject(page, 'bench');
      return;

    /*
     * The office.
     *
     * Demo-backed for the seat and nothing else: `requireAdmin()` answers
     * `notFound()`, so an ordinary manager photographs a 404 and files it under
     * this state's name — the false green the nine reveal states shipped. It
     * borrows `review-empty` rather than adding a demo state of its own, because
     * the office needs a commissioner's keys and **nothing arranged**, and
     * `review-empty` is exactly "a commissioner seat with nothing waiting."
     */
    case 'office':
      /*
       * `?queue=empty` rather than a bare `/admin`.
       *
       * The office used to have no queue on it, so a bare URL was deterministic.
       * It has one now, and the queue is league-scoped and additive — the same
       * hazard `review-empty` records — so the empty desk has to be asked for.
       * Nothing else about the screen changes: the key board and the press-desk
       * door are the product's, unfiltered.
       */
      await page.goto(`${BASE}/admin?queue=empty`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      return;

    /*
     * The queue with something on it, narrowed one band at a time.
     *
     * `office-queue` takes no parameter: it is the real, whole desk. It is
     * deterministic because its own applier arranges one paper of each kind and
     * every applier that could add another is idempotent on a fixed slot — so
     * the second and third widths photograph the same rows as the first.
     */
    case 'office-ready':
      await page.goto(`${BASE}/admin?queue=ready`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      return;
    case 'office-blocked':
      await page.goto(`${BASE}/admin?queue=blocked`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      return;
    case 'office-printed':
      await page.goto(`${BASE}/admin?queue=printed`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      return;
    case 'office-queue':
      await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      return;

    /*
     * Reached by URL rather than by tapping a banner.
     *
     * The banner rail opens a champion panel first and *its* action is the link,
     * so a click path here would be photographing the rail's interaction — which
     * `six-banners` and the room-transient gates already own. What this state is
     * for is the page.
     */
    case 'reduced-motion':
      /*
       * The room as a manager who asked for less motion sees it. The gate that
       * runs on this state restores `no-preference` before it returns, so the
       * states after this one are photographed in the ordinary room.
       */
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await home(page);
      await dismissTony(page);
      return;
    case 'timeline':
      await page.goto(`${BASE}/timeline`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
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
     * The hall with everything shut — **the state a revert produces.**
     *
     * `?open=` is resolved by the **server** (`lib/flags.ts`), behind the demo
     * system's own two guards — so this needs `DEMO_FIXTURES=1` on the server
     * process as well as on this driver. That is the same wiring the nine
     * `reveal-*` states need, and the same wiring whose absence let them
     * photograph a calm parlor and pass. It is checked rather than trusted:
     * `checkBackHall` below fails a state whose doors are not in the state its
     * name claims.
     *
     * The override could only ever *add* until the basement shipped, because
     * both destinations were shut by default and every state above the floor
     * was reachable. Opening `rooms` inverted that, and `none` is the sentinel
     * that keeps the floor photographable. `BACK_HALL_BOUNDARY §5`: a room
     * nobody looks at until the day it ships is a room that ships unreviewed —
     * and that applies with more force to the one a revert produces.
     */
    case 'back-hall-shut':
      await page.goto(`${BASE}/back-hall?open=none`, { waitUntil: 'networkidle' });
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
     * own box and so also exercises the ledger, the balance check and the tray
     * transition in one pass.
     *
     * **The money comes from a demo seat now, one per width** (`DEMO_BACKED`).
     * This used to spend the shared seat's opening balance, on the reasoning that
     * it "covers several at the provisional price" — true at 50 tokens a box and
     * false at 200, where 250 covers exactly one and the second width hung.
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

    /*
     * The championship shelf, in its three states. Same route as the shelf
     * below it, because a ring is part of a manager's collection rather than a
     * separate screen — it is simply the part no box can produce.
     */
    case 'demo-rings-none':
    case 'demo-rings-one':
    case 'demo-rings-many':
      await page.goto(`${BASE}/counter/collection`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-championships]', { state: 'attached' });
      await page.waitForTimeout(600);
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
     * The press desk (`16 §9`, `08 §22`).
     *
     * The wait is on the queue's own marker rather than on a timeout, and that
     * is the whole gate against a false green here: `requireAdmin()` answers
     * `notFound()`, so a seat without the commissioner's keys renders a 404 —
     * which photographs cleanly, files under the state's name, and passes. The
     * nine `reveal-*` states cost a milestone to exactly that shape of mistake.
     */
    /*
     * The empty desk, as a rendering — `?desk=empty`, resolved on the server
     * behind the demo guard.
     *
     * It cannot be a driven state: an issue belongs to the league rather than to
     * a seat, so once any other press-desk demo has drafted something the desk is
     * not empty for anybody — and this driver loops **widths on the outside**, so
     * the 375 and 360 passes would photograph a populated desk under this name
     * and pass. `checkReviewDesk` asserts the marker says `empty`, which is what
     * makes the parameter's failure loud instead of silent.
     */
    case 'review-empty':
      await page.goto(`${BASE}/admin/slice?desk=empty`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-review-queue]', { state: 'attached' });
      await page.waitForTimeout(400);
      return;

    /*
     * The desk itself: with work on it, and with the press stopped.
     *
     * Only these two belong on the queue. The other three are about **one
     * draft**, and the queue cannot show them apart — an issue belongs to the
     * league rather than to a seat, so the sections accumulate as each state is
     * applied, and by the last one every desk looks the same. The screenshots
     * settled it: four states photographed byte-identically.
     */
    case 'review-waiting':
    case 'review-held':
      await page.goto(`${BASE}/admin/slice`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-review-queue]', { state: 'attached' });
      await page.waitForTimeout(400);
      return;

    /*
     * One draft, opened the way a commissioner opens it — from the queue.
     *
     * Navigated rather than deep-linked, because the version id is a uuid the
     * driver has no business knowing and because *"can you get to the decision
     * from the desk"* is part of what is being reviewed. Each picks its row out
     * of the section that names the state it is about, so the screen photographed
     * is the one where that state means something: the approve-or-refuse
     * controls, the validator's violations, the Print button, the printed stamp.
     */
    case 'review-draft':
    case 'review-decision':
    case 'review-refused':
    case 'review-approved':
    case 'review-published': {
      await page.goto(`${BASE}/admin/slice`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-review-queue]', { state: 'attached' });

      const row =
        state === 'review-refused'
          ? page.locator('[data-review-refused]')
          : state === 'review-draft' || state === 'review-decision'
            ? page.locator('[data-review-section="waiting"] a:not([data-review-refused])')
            : page.locator(
                `[data-review-section="${state === 'review-approved' ? 'approved' : 'published'}"] a`,
              );

      if ((await row.count()) === 0) {
        throw new Error(
          `${state}: the desk had no row to open. The applier ran but the section is empty, ` +
            `which means the state was not produced — not that the screen is broken.`,
        );
      }

      await row.first().click();
      await page.waitForSelector('[data-review-version]', { state: 'attached' });

      /*
       * The stamp itself, which nothing had ever photographed.
       *
       * Screenshots here are **viewport-sized**, not full-page — one phone
       * screen — and the review screen deliberately puts its actions below the
       * paper so that approving without reading is not the default gesture. The
       * consequence is that the single most consequential control in the product
       * has always been off the bottom of every picture of it. `review-draft`
       * photographs the proof sheet; this photographs the decision.
       *
       * Scrolled to rather than deep-linked, for the reason the block above
       * gives: getting there from the desk is part of what is being reviewed.
       */
      if (state === 'review-decision') {
        await page.locator('[data-review-decision]').scrollIntoViewIfNeeded();
      }

      await page.waitForTimeout(400);
      return;
    }

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
    case 'slice-competing-stories':
    case 'slice-monday-comeback':
    case 'slice-preseason-draft-review':
    case 'slice-preseason-sparse': {
      const key = state.slice('slice-'.length);
      await page.goto(`${BASE}/slice?edition=${key}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-slice-edition]', { state: 'attached' });
      return;
    }

    /*
     * The body of the paper, which no capture had ever contained.
     *
     * `scrollIntoViewIfNeeded` on the tenth section rather than a pixel offset:
     * the sections are different heights at every width, so a number would be
     * three different places on three phones and would silently stop pointing
     * at anything the first time a section grew.
     */
    case 'preseason-teams': {
      await page.goto(`${BASE}/slice?edition=preseason-sparse`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-preseason-team]', { state: 'attached' });
      await page.locator('[data-preseason-team]').last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
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
     * A category open, a choice made, and nothing saved.
     *
     * The screen this replaces printed every option of every trait at once, so
     * "which category am I in" was not a state it could be in. It is now, and it
     * is the one a manager spends the whole visit in.
     */
    case 'character-editing': {
      await page.goto(`${BASE}/profile/character`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-character-customiser]', { state: 'attached' });
      await page.click('[data-trait-tab="hair"]');
      await pickSomethingElse(page, 'hair');
      await page.waitForSelector('[data-character-dirty="yes"]', { state: 'attached' });
      return;
    }

    /*
     * **The state that would have caught the production crash.**
     *
     * Every existing character state opened the route and photographed it, and
     * the route was never broken — `app/actions/character.ts` exported a
     * non-function from a `'use server'` file, which Next evaluates when an
     * action is *invoked*. So Save returned a 500 with digest `…@E352` for every
     * manager, from #48 onward, with `visual:qa`, `npm run test` and `next build`
     * all green.
     *
     * A screenshot of a form is not a test of the form. This one presses the
     * button, waits for the server to answer, and photographs what it said.
     */
    case 'character-saved': {
      await page.goto(`${BASE}/profile/character`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-character-customiser]', { state: 'attached' });
      await page.click('[data-trait-tab="top"]');
      await pickSomethingElse(page, 'top');
      await page.waitForSelector('[data-character-dirty="yes"]', { state: 'attached' });
      await page.click('[data-save]');
      // The saved sentence, not a sleep: `router.refresh()` follows the action.
      await page
        .locator('[data-character-customiser] [aria-live="polite"]')
        .filter({ hasText: /Saved/ })
        .waitFor({ timeout: 20_000 });
      return;
    }

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
    case 'character-long-hair-apron':
    case 'character-retired-options': {
      const key = state.slice('character-'.length);
      await page.goto(`${BASE}/profile/character?character=${key}`, {
        waitUntil: 'networkidle',
      });
      await page.waitForSelector(`[data-character-preview="${key}"]`, { state: 'attached' });
      return;
    }

    /*
     * Tony's draft board, in its three states.
     *
     * The wait is on the board's own marker rather than on a timeout, for the
     * reason the press desk's is: `requireAdmin()` answers `notFound()`, and a
     * 404 photographs cleanly and files under the state's name.
     */
    case 'draft-board-empty':
    case 'draft-board-partial':
    case 'draft-board-complete':
      await page.goto(`${BASE}/admin/slice/draft`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-draft-board]', { state: 'attached' });
      await page.waitForTimeout(400);
      return;

    /*
     * One manager's editor, opened the way a commissioner opens it — from the
     * board.
     *
     * Navigated rather than deep-linked, because the user id is a uuid the
     * driver has no business knowing and because *"can you get from the board to
     * the person"* is part of what is being reviewed. Each picks its row out of
     * the half of the board that names the state it is about, so `blank` really
     * is somebody Tony has not written and `written` really is somebody he has.
     */
    case 'draft-editor-blank':
    case 'draft-editor-written': {
      await page.goto(`${BASE}/admin/slice/draft`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-draft-board]', { state: 'attached' });

      const wanted = state === 'draft-editor-blank' ? 'todo' : 'done';
      const row = page.locator(`[data-draft-row="${wanted}"]`);

      if ((await row.count()) === 0) {
        throw new Error(
          `${state}: the board had no ${wanted} row to open. The applier ran but the board is ` +
            `all one way, which means the state was not produced — not that the screen is broken.`,
        );
      }

      await row.first().click();
      await page.waitForSelector('[data-draft-editor]', { state: 'attached' });
      await page.waitForTimeout(400);
      return;
    }

    /*
     * The draft review on the press desk, opened from the queue.
     *
     * The one row in `waiting` whose filing line says `Draft review` rather than
     * a week — which is also the assertion, because a preseason issue that
     * queued as `Week 0` would be the internal shape of the record leaking onto
     * the screen.
     */
    case 'preseason-review': {
      await page.goto(`${BASE}/admin/slice`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-review-queue]', { state: 'attached' });

      const row = page
        .locator('[data-review-section="waiting"] a')
        .filter({ hasText: /Draft review/ });

      if ((await row.count()) === 0) {
        throw new Error(
          'preseason-review: no draft review is waiting on the desk. The applier ran but the ' +
            'queue does not hold it, which means the state was not produced.',
        );
      }

      await row.first().click();
      await page.waitForSelector('[data-review-version]', { state: 'attached' });
      await page.waitForTimeout(400);
      return;
    }

    /*
     * The draft review on the rack — what the league actually reads.
     *
     * `/slice` with no parameter, so this is the **published** issue coming
     * through `rackIssue` rather than a preview. That is the whole point of the
     * state: the two `?edition=` previews prove the renderer, and this proves
     * the approval chain put it on the shelf.
     */
    case 'preseason-rack':
      await page.goto(`${BASE}/slice`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-preseason-board]', { state: 'attached' });
      await page.waitForTimeout(600);
      return;

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
    case 'reveal-no-offer':
    case 'reveal-spare': {
      const stage =
        state === 'reveal-first-offer'
          ? 'first'
          : state === 'reveal-complete-offer'
            ? 'complete'
            : state === 'reveal-spare'
              ? 'spare'
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
  'tony-steady',
  'reduced-motion',
  'tony-dialogue',
  'display-over-tony',
  'tonight-board',
  'banner-completed',
  'banner-current-tbd',
  'rack',
  'timeline',
  'profile',
  // Directly after, and that order is load-bearing: this one leaves a second
  // session behind, and `profile` is the state that must not have one.
  'profile-devices',
  'prediction',
  'receipt',
  'counter',
  'back-hall',
  'back-hall-shut',
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
  'demo-rings-none',
  'demo-rings-one',
  'demo-rings-many',
  /*
   * The basement, and all eight of its states are demo-backed.
   *
   * Not a convenience: **Alex owns nothing that can be put on a shelf.** Every
   * seeded manager holds two unopened boxes and no collectibles, so a
   * manager-backed `room-furnished` filled zero places and the gate said so on
   * the first run. Opening Alex's boxes to fix it would have consumed the
   * fixture `tray-owned-box` depends on — a state paying for another state's
   * screenshot.
   *
   * `collection-full` is a real manager with a real collection, so the four
   * places have something to hold and every capture drives the real actions.
   *
   * `room` is first because it is the one that **empties** the four places, so
   * every state after it starts from a known position rather than from whatever
   * the previous state left.
   */
  'room',
  'room-furnished',
  'room-slot',
  'room-corridor',
  'room-rec',
  'room-cold',
  'room-visited',
  // And the first trip downstairs, for somebody who owns nothing at all.
  'room-empty',
  // M3. Manager-backed first (each signs in at its own seat), then the geometry
  // fixtures, which need only the demo guard and no particular manager.
  'character-empty',
  'character-dressed',
  'character-equipped',
  'character-editing',
  'character-saved',
  'character-default',
  'character-tallest',
  'character-widest',
  'character-balding-visor',
  'character-every-slot',
  'character-long-hair-apron',
  'character-retired-options',
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
  'slice-monday-comeback',
  'slice-preseason-draft-review',
  'slice-preseason-sparse',
  // The same paper, scrolled to its tenth section — the half of the draft
  // review that no viewport-sized capture had ever contained.
  'preseason-teams',
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
  'reveal-spare',
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
  /*
   * The press desk, last: each signs in at its own commissioner seat, and every
   * manager-backed state above expects to still be whoever it signed in as.
   */
  'review-empty',
  'review-waiting',
  'review-draft',
  'review-decision',
  'review-refused',
  'review-approved',
  'review-published',
  'review-held',
  /*
   * Tony's draft board, after the press desk.
   *
   * The order is load-bearing in one direction only: `preseason-published` puts
   * an issue for the **open** season on the rack, and `rackIssue` prefers the
   * most recently published issue over the historical fallback — so `rack` and
   * `slice`, which photograph the offseason shelf, must run before it. They do:
   * both are near the top of this list.
   */
  'draft-board-empty',
  'draft-board-partial',
  'draft-editor-blank',
  'draft-editor-written',
  'draft-board-complete',
  'preseason-review',
  'preseason-rack',
  // The office, last of the commissioner-seated states for the same reason.
  'office',
  /*
   * The queue, after the press desk on purpose.
   *
   * `office-queue` shows the **real** desk with no narrowing, so it must be
   * photographed once the press-desk states have put their papers on it —
   * otherwise the first width would see a different desk from the other two.
   * Every applier involved is idempotent on a fixed slot, so running them again
   * at 375 and 360 reproduces the same rows rather than adding to them.
   *
   * The draft-review states above put a **second** kind of paper on that same
   * desk, and no ordering can hide it: the database survives between widths, so
   * whatever ran at 390 is still there at 375. `OFFICE_EXPECTATIONS` counts it
   * rather than working around it — see the note there before reordering
   * anything in this block.
   */
  'office-ready',
  'office-blocked',
  'office-printed',
  'office-queue',

  /*
   * Last, and that is load-bearing: `reach` signs *out* to get here, so any
   * state after these would find itself at the door instead of where it meant
   * to be. `--state=` selects exactly one state, so a single-state run is
   * unaffected either way.
   */
  'door',
  'door-claim',
  'door-return',
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

/* ------------------------------------------------------- Tony holds still -- */

/**
 * One animation frame of Tony, measured against the counter that cuts him.
 *
 * `t` is **page time** — `performance.now()`, whose origin is navigation start —
 * not time since sampling began. The gate asserts which parts of the arrival
 * timeline it actually covered, and it can only do that against the same clock
 * `arrival.tsx` schedules on.
 */
interface TonyFrame {
  readonly t: number;
  /** Sprite offset from the counter-front layer. The invariant that matters. */
  readonly dx: number;
  readonly dy: number;
  readonly w: number;
  readonly h: number;
  /** What is left of him after every clipping ancestor, in the same frame. */
  readonly cx: number;
  readonly cy: number;
  readonly cw: number;
  readonly ch: number;
  readonly speaking: boolean;
  /**
   * The entrance is running in this frame.
   *
   * Recorded for the same reason `speaking` is: `tony-steps-up` is a sanctioned
   * animation that genuinely moves him, so its frames are not evidence of the
   * defect this gate exists for and must be filtered rather than judged.
   *
   * It used to be excluded by waiting for `performance.now() >= 1300` instead,
   * and that is a different claim than it looks. The entrance is scheduled from
   * a `useEffect`, so it is anchored to **hydration**; `performance.now()` is
   * anchored to **navigation**. On this machine hydration lands at 118-178ms and
   * the entrance's last movement at 1114-1157ms, so the constant cleared it by
   * about 150ms — and on a loaded runner it did not. A local production sweep
   * failed with `dy moved 0.74px (-134.04 at t=1323ms, -134.78 at t=1457ms)`,
   * which is the tail of `tony-steps-up` easing out, judged as a defect.
   *
   * Reading the class per frame removes the guess. It also cannot hide a real
   * defect: `.arriving` is on for 1100ms of one first visit per pass, and every
   * other frame in every pass is still judged.
   */
  readonly arriving: boolean;
  /** The affordance reveal is lit in this frame. Anchors the coverage windows. */
  readonly revealed: boolean;
}

/**
 * Sample Tony every animation frame for `ms`.
 *
 * ## Why a rAF loop in the page rather than screenshots on a timer
 *
 * The defect is transient — two pixels, arriving 1.6s after load and leaving
 * 3.3s later — and `18`'s own note is that a green sweep taken from one
 * post-navigation capture is the false green this repository has shipped three
 * times. Screenshots on a timer are the same mistake with more steps: they see
 * whatever frames the harness happened to ask for. A rAF loop sees **every
 * frame the compositor drew**, which is the population the claim is about.
 *
 * ## Measured against the counter, not against the viewport
 *
 * `getBoundingClientRect().top` moves when the page scrolls, so a scroll of one
 * pixel would read as a sprite that moved. Every number here is a delta from
 * `[data-room-layer="counter-front"]`, which is Tony's stationary neighbour and
 * the layer whose cut across his apron `objects.ts` calls "the difference
 * between behind and severed".
 *
 * ## The clip box
 *
 * Tony is *covered* by the counter front — a sibling drawn over him — which is
 * design, and *clipped* by any ancestor with a non-visible `overflow`, which
 * would not be. Rather than assert what the correct static clip is, each frame
 * records the intersection of his box with every clipping ancestor and the gate
 * asserts that intersection never changes. "No body part is briefly cropped" is
 * then a measurement rather than an opinion.
 *
 * ## Why it is a string, and why it is an immediately-invoked one
 *
 * A string, because `esbuild`'s `keepNames` rewrites named function bodies with
 * a `__name` helper that does not exist in the page: a `tsx`-compiled arrow with
 * an inner named const handed to `page.evaluate` throws `__name is not defined`
 * inside the browser.
 *
 * **Invoked in the expression**, because Playwright sets `isFunction` from
 * `typeof pageFunction === 'function'` — which is `false` for a string — and
 * then returns the evaluated expression *without calling it*. A string arrow
 * therefore comes back as an unserializable function value, which arrives here
 * as `undefined`. The first run of this gate crashed on exactly that. So the
 * duration is interpolated in and the expression evaluates to the promise.
 */
function tonySampler(ms: number): string {
  return `(() => { const ms = ${String(ms)}; return new Promise((resolve) => {
  const mark = document.querySelector('.tony-mark');
  const ref = document.querySelector('[data-room-layer="counter-front"]');
  if (mark === null || ref === null) { resolve(null); return; }

  // The drawn sprite when there is one, the mark itself when the asset is still
  // a placeholder. Either way it is a descendant, so it carries every ancestor
  // transform — which is where the movement under investigation lived.
  const drawn = mark.querySelector('img') || mark;

  const clipped = () => {
    const box = drawn.getBoundingClientRect();
    let top = box.top, left = box.left, right = box.right, bottom = box.bottom;
    for (let node = drawn.parentElement; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const a = node.getBoundingClientRect();
      top = Math.max(top, a.top);
      left = Math.max(left, a.left);
      right = Math.min(right, a.right);
      bottom = Math.min(bottom, a.bottom);
    }
    return { top, left, right, bottom };
  };

  const frames = [];
  const until = performance.now() + ms;
  const tick = () => {
    const d = drawn.getBoundingClientRect();
    const r = ref.getBoundingClientRect();
    const c = clipped();
    frames.push({
      t: Math.round(performance.now()),
      dx: d.left - r.left,
      dy: d.top - r.top,
      w: d.width,
      h: d.height,
      cx: c.left - r.left,
      cy: c.top - r.top,
      cw: Math.max(0, c.right - c.left),
      ch: Math.max(0, c.bottom - c.top),
      speaking: document.querySelector('.speaking') !== null,
      arriving: document.querySelector('.arriving') !== null,
      revealed: document.querySelector('.showing-taps') !== null,
    });
    if (performance.now() < until) requestAnimationFrame(tick);
    else resolve(frames);
  };
  requestAnimationFrame(tick);
}); })()`;
}

/**
 * Clear the once-per-session latch so the next load plays the whole arrival.
 *
 * Invoked in the expression for the reason above — as a bare string arrow this
 * evaluated to a function nobody called, and every "first visit" in this gate
 * was silently a return visit with no entrance and no reveal to sample.
 */
/**
 * The drawn sprite's rectangle in CSS pixels, or null.
 *
 * A string rather than a function, like every other injected snippet here: tsx
 * compiles with `keepNames`, which references a `__name` helper that does not
 * exist in the page.
 */
const TONY_RECT = `(() => {
  const mark = document.querySelector('.tony-mark');
  if (mark === null) return null;
  const drawn = mark.querySelector('img') || mark;
  const b = drawn.getBoundingClientRect();
  return { x: b.left, y: b.top, width: b.width, height: b.height };
})()`;

const FORGET_ARRIVAL = `(() => { try { sessionStorage.removeItem('tonys:arrived'); } catch (e) {} })()`;

/**
 * Sub-pixel arithmetic is not movement.
 *
 * `getBoundingClientRect` on a percentage-positioned element inside a
 * fractionally scaled room lands on values like `215.69999694824219`, and two
 * reads of an element that did not move can differ in the last place. The
 * defect this gate was built for moved him **two whole CSS pixels** and put him
 * at 214.11 and 215.35 on the way back, so a twentieth of a pixel is a floor
 * far below anything real and far above float noise.
 */
const STEADY_EPS = 0.05;

function spread(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

/** Report the extremes, so a failure says what moved and when rather than that something did. */
function describeSpread(frames: readonly TonyFrame[], key: keyof TonyFrame): string {
  const numbers = frames.map((f) => f[key] as number);
  const lo = frames[numbers.indexOf(Math.min(...numbers))]!;
  const hi = frames[numbers.indexOf(Math.max(...numbers))]!;
  return (
    `${(Math.max(...numbers) - Math.min(...numbers)).toFixed(2)}px ` +
    `(${(hi[key] as number).toFixed(2)} at t=${String(hi.t)}ms, ` +
    `${(lo[key] as number).toFixed(2)} at t=${String(lo.t)}ms)`
  );
}

const STEADY_KEYS = ['dx', 'dy', 'w', 'h', 'cx', 'cy', 'cw', 'ch'] as const;

function assertSteady(
  frames: readonly TonyFrame[],
  width: number,
  pass: string,
  minimumFrames: number,
): void {
  if (frames.length < minimumFrames) {
    fail(
      'tony-steady',
      `@${String(width)} ${pass}: only ${String(frames.length)} still frames to judge, ` +
        `needed ${String(minimumFrames)}. A pass with nothing in it is not a pass.`,
    );
    return;
  }

  for (const key of STEADY_KEYS) {
    if (spread(frames.map((f) => f[key])) > STEADY_EPS) {
      fail('tony-steady', `@${String(width)} ${pass}: ${key} moved ${describeSpread(frames, key)}`);
    }
  }
}

/**
 * Tony holds still.
 *
 * ## The defect
 *
 * The commissioner saw Tony *"briefly clip after the homepage has been sitting
 * for a few seconds"*. He was: `.showing-taps .tony-mark` translated him -2px
 * with a 260ms eased transition, and `arrival.tsx` turns that class on at
 * 1600ms and off at 4900ms. So on an untouched homepage he rose two pixels,
 * stood there for three and a third seconds, and slid back — moving the
 * counter's cut about two sprite rows up his apron, and resampling a
 * nearest-neighbour sprite at fractional offsets for every frame of both ramps.
 *
 * ## What this gate asserts
 *
 * That his offset from the counter, his size, and what survives every clipping
 * ancestor are **identical in every frame he is not talking**, and that while he
 * is talking he only ever occupies the two whole-pixel positions `tony-talks`
 * defines. Five passes, covering the seven moments the direction names:
 *
 * | pass | covers |
 * |---|---|
 * | A | an undisturbed first visit — several seconds idle, active idle frames, the greeting typing |
 * | B | the same window with the line dismissed, so the *pre-reveal* frames are still ones too |
 * | C | Tony speaking, on demand |
 * | D | Tony after speaking |
 * | E | a room interaction — out to `/counter` — and the return visit |
 *
 * A and B between them put still frames on both sides of 1600ms and both sides
 * of 4900ms, which is what makes this able to fail on the old behaviour: under
 * it, `dy` in pass B spans 1300ms at rest, 3000ms two pixels up, and 4950ms
 * mid-ramp at a third of a pixel. The gate was run against the old CSS before
 * the repair was kept, and reported `dy moved 2.00px`.
 */

/**
 * The glow may add light. It may not move him.
 *
 * ## Why this is not `checkTonySteady` with a longer window
 *
 * `checkTonySteady` samples `getBoundingClientRect` on the sprite and on the
 * counter layer every animation frame, and it is the right gate for the defect
 * it was built for — the entrance keyframe dropping him 62px behind the counter.
 * It is **structurally incapable** of seeing the commissioner's 2026-08-05
 * report, because the rectangle does not change: what moved was where the sprite
 * landed on the device's pixel grid, one device pixel, only while the filter
 * transition had him promoted to his own compositing layer.
 *
 * So this gate reads the glass instead of the DOM, off the compositor's own
 * frames.
 *
 * ## The test is exact, and needs no authored mask
 *
 * `drop-shadow` composites a blurred copy of the alpha **behind** the element,
 * so every pixel it touches gets brighter and none gets darker. Therefore:
 *
 *   - brighter than the settled frame is the glow, and expected;
 *   - **darker** than the settled frame cannot be the glow. It is the sprite
 *     covering something it does not cover once the room has settled.
 *
 * A threshold-free discriminator matters here because the first version of this
 * measurement masked by *"pixels the first frame changed"*, and the first
 * screencast frame turned out not to represent the whole glowing period — the
 * mask leaked and reported hundreds of glow pixels as movement. This one has no
 * such freedom.
 *
 * On the build before the fix it reports **320 differing pixels at 375, 90 at
 * 360 and 27 at 390**; after `will-change: filter` pins the layer, zero at all
 * three.
 */
async function checkGlowLeavesTonyAlone(page: Page, width: number): Promise<void> {
  const REVEAL_FOR = 3300;
  const RAMP = 260;

  await page.evaluate(FORGET_ARRIVAL);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const geo = (await page.evaluate(TONY_RECT)) as
    | { x: number; y: number; width: number; height: number }
    | null;
  if (geo === null) {
    fail('tony-glow', `@${String(width)} the homepage has no .tony-mark to measure`);
    return;
  }

  try {
    await page.waitForSelector('.showing-taps', { timeout: 6000 });
  } catch {
    /*
     * No reveal on this load. Not a failure of *this* gate — `checkTonySteady`
     * owns the arrival's schedule and will say so — and a silent pass here would
     * be worse than either.
     */
    fail('tony-glow', `@${String(width)} the glow never appeared, so it could not be measured`);
    return;
  }

  const lit = (await page.evaluate('performance.now()')) as number;

  const cdp = await page.context().newCDPSession(page);
  const frames: Buffer[] = [];
  /*
   * The last frame always arrives after the session is gone.
   *
   * Chromium keeps emitting `Page.screencastFrame` until it has processed
   * `stopScreencast`, so at least one event is normally still in flight when
   * `detach()` runs — and acking a frame on a detached session **rejects**. The
   * ack used to be `void`ed, which makes that rejection an *unhandled* one, and
   * Node's default for an unhandled rejection is to kill the process. So a race
   * this gate loses roughly one time in ten took down the whole sweep with
   * `cdpSession.send: Target page, context or browser has been closed` — a
   * message about the harness, printed where a reader is looking for a message
   * about the room.
   *
   * Two halves: stop collecting once detached, so a late frame cannot change the
   * measurement, and swallow the ack's rejection, because a frame nobody is
   * going to read does not need to be acknowledged.
   */
  let listening = true;
  cdp.on('Page.screencastFrame', (frame) => {
    if (!listening) return;
    frames.push(Buffer.from(frame.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {
      // The session is closing. Ack was best-effort from the start.
    });
  });

  const waitUntilPageTime = async (target: number): Promise<void> => {
    const now = (await page.evaluate('performance.now()')) as number;
    if (target > now) await page.waitForTimeout(target - now);
  };

  // Opened just before the class is removed and closed once everything has
  // settled, so the window contains the last glowing frame, the whole ramp and
  // the frame the layer is torn down on.
  await waitUntilPageTime(lit + REVEAL_FOR - 200);
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await waitUntilPageTime(lit + REVEAL_FOR + RAMP + 350);
  await cdp.send('Page.stopScreencast');
  listening = false;
  await cdp.detach();

  if (frames.length < 4) {
    fail('tony-glow', `@${String(width)} only ${String(frames.length)} frames across the fade`);
    return;
  }

  const decode = async (png: Buffer): Promise<{ data: Buffer; width: number; height: number }> => {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  };

  const settled = await decode(frames.at(-1)!);
  const scale = settled.width / width;
  // Widened by the glow's reach so a halo that spills past his alpha is inside
  // the region rather than silently outside it.
  const reach = 12;
  const left = Math.max(0, Math.floor((geo.x - reach) * scale));
  const top = Math.max(0, Math.floor((geo.y - reach) * scale));
  const right = Math.min(settled.width, Math.ceil((geo.x + geo.width + reach) * scale));
  const bottom = Math.min(settled.height, Math.ceil((geo.y + geo.height + reach) * scale));

  const luma = (d: Buffer, p: number): number =>
    0.299 * (d[p] ?? 0) + 0.587 * (d[p + 1] ?? 0) + 0.114 * (d[p + 2] ?? 0);

  let worst = 0;
  let worstAt = -1;

  for (const [index, png] of frames.entries()) {
    const frame = await decode(png);
    if (frame.width !== settled.width || frame.height !== settled.height) continue;

    let darker = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const p = (y * settled.width + x) * 4;
        // 8 of 255 is far above compositor noise and far below a one-pixel edge
        // move on this art, which swings by a hundred or more.
        if (luma(frame.data, p) - luma(settled.data, p) < -8) darker += 1;
      }
    }
    if (darker > worst) {
      worst = darker;
      worstAt = index;
    }
  }

  if (worst > 0) {
    fail(
      'tony-glow',
      `@${String(width)} frame ${String(worstAt)} of ${String(frames.length)} draws Tony ` +
        `${String(worst)} pixels darker than the settled room. A glow only adds light, so ` +
        'the sprite moved, was clipped, or was rasterized differently while the filter ' +
        'transition had it on its own compositing layer.',
    );
  }
}

/**
 * The reduced-motion promise, verified rather than assumed.
 *
 * `globals.css` collapses every animation to `0.01ms` under
 * `prefers-reduced-motion: reduce`, and three components — `arrival.tsx`,
 * `spoken-line.tsx`, `counter-tray.tsx` — branch on the same query in
 * JavaScript. That is a real accessibility promise made in seven places across
 * **seventeen** keyframe animations, and until this gate existed **nothing
 * checked that any of it held**.
 *
 * ## It measures the browser, not the stylesheet
 *
 * `document.getAnimations()` is the set of animations the compositor is actually
 * running. A CSS audit cannot see an animation started by `element.animate()`,
 * and the Web Animations API is precisely what `animation-duration: !important`
 * **cannot** suppress — so a future regression is far likelier to be invisible
 * to a stylesheet scan than to this.
 *
 * ## The control is the load-bearing half
 *
 * Asserting "nothing is animating under reduce" passes trivially if the room
 * stops animating at all — a gate that cannot fail is not a gate. So it samples
 * the same page **twice**: motion allowed, where the room must be genuinely
 * alive, and motion reduced, where it must be still. Measured on the homepage
 * because that is where the room breathes: two haze drifts and the sign's sway,
 * all infinite, none of which any other state carries.
 *
 * It restores `no-preference` before returning, so the states after it are
 * photographed in the ordinary room.
 */
async function checkStillUnderReducedMotion(page: Page, width: number): Promise<void> {
  const running = async (): Promise<{ count: number; names: string }> => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    // Long enough for the entrance and its timers to finish; what is left
    // running after this is running for good.
    await page.waitForTimeout(3200);
    return page.evaluate(() => {
      const live = document.getAnimations().filter((a) => a.playState === 'running');
      return {
        count: live.length,
        names: live
          .map((a) => {
            const effect = a.effect as KeyframeEffect | null;
            const target = effect?.target as Element | null;
            const name = (a as unknown as { animationName?: string }).animationName;
            const cls = target === null ? '?' : String(target.className).split(' ')[0];
            return `${name ?? 'script-driven'} on .${cls}`;
          })
          .join(', '),
      };
    });
  };

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const allowed = await running();
  if (allowed.count === 0) {
    fail(
      'reduced-motion',
      `@${String(width)} the control failed: with motion allowed the homepage is running ` +
        'no animations at all, so the reduced-motion assertion below would pass for the ' +
        'wrong reason. The room is meant to breathe — two haze drifts and the sign sway.',
    );
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await running();
  if (reduced.count > 0) {
    fail(
      'reduced-motion',
      `@${String(width)} ${String(reduced.count)} animation(s) still running under ` +
        `prefers-reduced-motion: ${reduced.names}. A manager who asked for less motion is ` +
        'getting it anyway. CSS cannot suppress an animation started from JavaScript, so ' +
        'check for element.animate() before reaching for a stylesheet fix.',
    );
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function checkTonySteady(page: Page, width: number): Promise<void> {
  /*
   * The arrival timeline, from `arrival.tsx`. Duplicated deliberately: a gate
   * that imports the constants it is checking cannot notice them changing, and
   * these numbers are the schedule this whole gate exists to sample across. If
   * they move, this fails and says so, which is the point.
   *
   * They are **durations**, not page times. `arrival.tsx` starts its timers from
   * a `useEffect`, so every one of them is measured from hydration — which is
   * why `REVEAL_AT` is only ever a fallback here and the windows below are
   * anchored to the frame the reveal was first seen lit in.
   */
  const REVEAL_AT = 1600;
  const REVEAL_FOR = 3300;
  const RAMP = 260;

  const firstVisit = async (): Promise<void> => {
    await page.evaluate(FORGET_ARRIVAL);
    await page.goto(BASE, { waitUntil: 'networkidle' });
  };

  const sample = async (ms: number): Promise<TonyFrame[]> => {
    const frames = (await page.evaluate(tonySampler(ms))) as TonyFrame[] | null | undefined;
    if (frames === null || frames === undefined) {
      throw new Error(
        `@${String(width)} the sampler returned nothing — either .tony-mark or ` +
          `[data-room-layer="counter-front"] is missing from the homepage`,
      );
    }
    return frames;
  };

  /**
   * Sample from now until `page time` reaches `until`.
   *
   * The windows this gate needs are fixed points on the *arrival's* clock —
   * 1600ms, 4900ms — so the sample has to end at a page time rather than run
   * for a duration measured from whenever the harness happened to get here. A
   * fixed duration on a loaded machine ends early and the coverage assertions
   * below start failing for a reason that has nothing to do with Tony.
   */
  const sampleUntil = async (until: number): Promise<TonyFrame[]> => {
    const now = (await page.evaluate('performance.now()')) as number;
    return sample(Math.max(1200, until - now));
  };

  const covers = (frames: readonly TonyFrame[], lo: number, hi: number): boolean =>
    frames.some((f) => f.t >= lo && f.t <= hi);

  /** Frames where nothing is *supposed* to be moving. */
  const still = (frames: readonly TonyFrame[]): TonyFrame[] =>
    frames.filter((f) => !f.speaking && !f.arriving);

  /**
   * When the reveal actually turned on, in page time.
   *
   * `arrival.tsx` schedules it 1600ms after **hydration**, so the constant
   * above is only the right answer on a machine where hydration is free. Every
   * window below is expressed relative to what the frames say happened, so a
   * slow runner costs coverage rather than producing a failure about a defect
   * that is not there. Falls back to the constant when no frame saw it lit,
   * which keeps a genuinely missing reveal loud.
   */
  const revealOnset = (frames: readonly TonyFrame[]): number =>
    frames.find((f) => f.revealed)?.t ?? REVEAL_AT;

  /** Past the reveal's 4900ms end plus its ramp, with room to spare. */
  const WINDOW_ENDS = 6600;

  /* --- A. Nobody touches anything ------------------------------------- */

  await firstVisit();
  /*
   * Sampled from the first frame there is one. The entrance still moves him —
   * that is `tony-steps-up`, by design — but its frames are now excluded by the
   * class that causes them rather than by a constant that hoped to have
   * outlasted it. See `TonyFrame.arriving`.
   */
  const undisturbed = await sampleUntil(WINDOW_ENDS);
  const quietA = still(undisturbed);
  assertSteady(quietA, width, 'pass A (untouched homepage)', 60);

  /*
   * The greeting types from 1150ms for at most 1700ms, so an undisturbed page
   * has no still frames before the reveal turns on — pass B exists for those.
   * What A must cover is the reveal *standing* and the reveal *gone*.
   */
  const litA = revealOnset(undisturbed);
  if (!covers(quietA, litA + 1400, litA + REVEAL_FOR - 100)) {
    fail('tony-steady', `@${String(width)} pass A never sampled a still frame while lit`);
  }
  if (!covers(quietA, litA + REVEAL_FOR + RAMP + 200, litA + REVEAL_FOR + 1500)) {
    fail('tony-steady', `@${String(width)} pass A never sampled a still frame after the reveal`);
  }

  /* --- B. The same window, with his line put away --------------------- */

  await firstVisit();
  /*
   * Dismissed as early as the button can be clicked, and sampled from that
   * instant rather than after a settling wait.
   *
   * Dismissing unmounts `SpokenLine`, whose cleanup clears `speaking`, so
   * everything from here is a still frame — including the interval **before**
   * the reveal turns on, which pass A cannot reach because the greeting is
   * still typing through it, and which is the one that makes the lift visible
   * as a *change* rather than as a constant.
   */
  const dismiss = page.getByRole('button', { name: /Dismiss what Tony said/i });
  if ((await dismiss.count()) > 0) await dismiss.click({ force: true });
  /*
   * Sampled from the moment the dismissal returns, and judged on the frames the
   * entrance is not running in.
   *
   * An earlier version sampled immediately and reported `dy moved 5.52px` at
   * all three widths — the entrance, judged as a defect. That was patched by
   * waiting for `performance.now() >= 1300`, which held on a fast machine and
   * broke on a loaded one for the same reason: the wait is on the navigation
   * clock and the animation is on the hydration clock. Excluding the frames by
   * their own class is the version that has no margin to run out.
   */
  const dismissed = await sampleUntil(WINDOW_ENDS);
  const quietB = still(dismissed);
  assertSteady(quietB, width, 'pass B (line dismissed)', 120);

  const litB = revealOnset(dismissed);
  for (const [lo, hi, what] of [
    [0, litB - 50, 'before the reveal'],
    [litB + RAMP + 100, litB + REVEAL_FOR - 100, 'while the reveal is lit'],
    [litB + REVEAL_FOR + RAMP + 200, litB + REVEAL_FOR + 1200, 'after the reveal'],
  ] as const) {
    if (!covers(quietB, lo, hi)) {
      fail(
        'tony-steady',
        `@${String(width)} pass B sampled nothing ${what} (${String(lo)}-${String(hi)}ms); ` +
          `the window this gate needs was not covered, so a green result means nothing`,
      );
    }
  }

  const baseline = quietB[quietB.length - 1]!;

  /* --- C. Talking ------------------------------------------------------ */

  await page.getByRole('button', { name: /Talk to Tony/i }).click({ force: true });
  await page.waitForFunction(() => document.querySelector('.speaking') !== null, undefined, {
    timeout: 10_000,
  });
  const talking = (await sample(1200)).filter((f) => f.speaking);

  if (talking.length < 20) {
    fail(
      'tony-steady',
      `@${String(width)} pass C caught only ${String(talking.length)} speaking frames`,
    );
  } else {
    // Width, height and horizontal position are untouched by `tony-talks`.
    for (const key of ['dx', 'w', 'h'] as const) {
      if (spread(talking.map((f) => f[key])) > STEADY_EPS) {
        fail(
          'tony-steady',
          `@${String(width)} pass C (speaking): ${key} moved ${describeSpread(talking, key)}`,
        );
      }
    }

    /*
     * Vertically he shifts, and that is the point of the animation — but on
     * `steps(2, end)` he only ever occupies **two positions, one pixel apart**,
     * never a fraction between them. That is the whole reason this one is safe
     * and the reveal's eased transition was not: a pixel-art sprite resampled
     * at 0.4px is the smearing the art direction names.
     */
    const offsets = [...new Set(talking.map((f) => Number((f.dy - baseline.dy).toFixed(2))))].sort(
      (a, b) => a - b,
    );
    const whole = offsets.every((o) => Math.abs(o - Math.round(o)) <= STEADY_EPS);
    if (!whole || offsets.length > 2 || Math.abs(offsets[0]!) > 1 + STEADY_EPS) {
      fail(
        'tony-steady',
        `@${String(width)} pass C (speaking): he takes ${String(offsets.length)} vertical ` +
          `position(s) [${offsets.join(', ')}] relative to rest; ` +
          `tony-talks defines exactly two, one whole pixel apart`,
      );
    }
  }

  /* --- D. Done talking ------------------------------------------------- */

  await page.waitForFunction(() => document.querySelector('.speaking') === null, undefined, {
    timeout: 15_000,
  });
  await page.waitForTimeout(400);
  const after = await sample(900);
  assertSteady(after, width, 'pass D (after speaking)', 30);
  if (Math.abs(after[0]!.dy - baseline.dy) > STEADY_EPS) {
    fail(
      'tony-steady',
      `@${String(width)} pass D: he came to rest ${(after[0]!.dy - baseline.dy).toFixed(2)}px ` +
        `from where he started`,
    );
  }

  /* --- E. A room interaction, then out of the room and back ------------- */

  /*
   * Two interactions, because "room interaction followed by return" has two
   * readings and both are cheap: a Display opened and closed **without leaving**
   * — which mounts a panel and a scrim over the room and then unmounts them —
   * and a Door taken out of the room and a walk back in.
   */
  await page.getByRole('button', { name: /receipt/i }).click({ force: true });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const afterPanel = still(await sample(700));
  assertSteady(afterPanel, width, 'pass E (a panel opened and closed)', 20);

  /*
   * The Back Hall doorway rather than the counter: when a box is on the tray the
   * counter Door is **restated as the box**, so `a[href="/counter"]` is not in
   * the room for a manager who owns one — which is every seeded manager. The
   * rear doorway is one of the three Doors in every state of the homepage.
   */
  await page.locator('a[href="/back-hall"]').first().click({ force: true });
  await page.waitForURL((url) => url.pathname.startsWith('/back-hall'), { timeout: 20_000 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const returned = still(await sample(1600));
  assertSteady(returned, width, 'pass E (back from the Back Hall)', 40);
  if (returned.length > 0 && Math.abs(returned[0]!.dy - baseline.dy) > STEADY_EPS) {
    fail(
      'tony-steady',
      `@${String(width)} pass E: a return visit stands him ` +
        `${(returned[0]!.dy - baseline.dy).toFixed(2)}px from where the first visit left him`,
    );
  }

  /* --- F. A slow arrival ------------------------------------------------ */

  /*
   * The entrance may not move a room the manager is already looking at.
   *
   * Passes A-E all measure a *fast* arrival, which is the one case where this
   * defect is invisible: the server renders Tony at the counter, the browser
   * paints that, and hydration attaches `.arriving` about 150ms later — so
   * `tony-steps-up`'s opening keyframe, `translate3d(0, 26%, 0)` under
   * `animation-fill-mode: both`, drops him a quarter of his height before
   * anybody has focused on him.
   *
   * Under an 8x CPU throttle the same sequence measured: **the room paints
   * complete at 331ms and at 642ms he drops 62.42px** — behind the counter
   * front, which is drawn over him — and takes three seconds to climb back.
   * That is the commissioner's *"Tony's bottom half clips, seconds after the
   * homepage settles"*, and no pass that hydrates in 150ms can see it.
   *
   * ## Why the client bundle is delayed rather than the CPU throttled
   *
   * CPU throttling was the first attempt and it is the wrong instrument: it
   * slows paint and hydration *together*, so the gap between them — which is the
   * entire defect — stays small and the pass reports whatever the runner
   * happened to do. It passed at two widths and failed at the third on the same
   * build, which is a measurement that has not measured anything.
   *
   * Delaying `/_next/static/chunks/` models the real case exactly and
   * deterministically: the HTML and the CSS arrive, the room paints complete,
   * and the script that animates it turns up several hundred milliseconds
   * later. That is a phone on a real network, and it is reproducible.
   *
   * `arrival.tsx` skips the entrance once the finished room has been on screen
   * longer than `ENTRANCE_STALE_AFTER_MS`, so with that rule he holds still, and
   * with it removed this reports a sixty-pixel move at every width.
   *
   * The route is removed before returning. A gate that leaves every script
   * delayed would charge every check after it for this one.
   */
  const BUNDLE_DELAY_MS = 700;
  try {
    await page.route('**/_next/static/chunks/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, BUNDLE_DELAY_MS));
      await route.continue();
    });
    await page.evaluate(FORGET_ARRIVAL);
    /*
     * `commit` rather than `load`, because the whole point is to be sampling
     * *before* the script arrives — waiting for the load event would wait out
     * the delay this pass just installed.
     *
     * Which means the sampler can be injected before the parser has reached
     * Tony, so both of the elements it measures are waited for explicitly.
     * They are in the server's HTML, so this resolves as soon as the document
     * parses and long before the delayed bundle: it costs no coverage. Without
     * it the pass raced at 375 on a loaded machine and aborted the whole sweep
     * with "the sampler returned nothing".
     */
    await page.goto(BASE, { waitUntil: 'commit' });
    await page.waitForSelector('.tony-mark', { state: 'attached', timeout: 20_000 });
    await page.waitForSelector('[data-room-layer="counter-front"]', {
      state: 'attached',
      timeout: 20_000,
    });

    // Long enough to cover the delayed bundle, hydration, and the whole 900ms
    // the entrance would have run for had it started.
    const slow = await sample(4200);
    const judged = slow.filter((f) => !f.speaking);
    if (judged.length < 30) {
      fail(
        'tony-steady',
        `@${String(width)} pass F (a slow arrival): only ${String(judged.length)} frames to ` +
          `judge. A pass with nothing in it is not a pass.`,
      );
    } else {
      // The position the server painted, taken from the first frame — before
      // any client code has had the chance to move him.
      const painted = judged[0]!;
      const worst = judged.reduce(
        (far, f) => (Math.abs(f.dy - painted.dy) > Math.abs(far.dy - painted.dy) ? f : far),
        painted,
      );
      const moved = Math.abs(worst.dy - painted.dy);
      if (moved > STEADY_EPS) {
        fail(
          'tony-steady',
          `@${String(width)} pass F (a slow arrival): the room painted him at ` +
            `${painted.dy.toFixed(2)} and he moved ${moved.toFixed(2)}px from it at ` +
            `t=${String(worst.t)}ms. An entrance may not start on a room that is already on ` +
            `screen — see ENTRANCE_STALE_AFTER_MS in arrival.tsx.`,
        );
      }
    }
  } finally {
    await page.unroute('**/_next/static/chunks/**');
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await dismissTony(page);
}

/**
 * Only one transient surface is on screen at a time — `MANDATE §6`.
 *
 * ## What it counts, and why it counts pixels rather than elements
 *
 * Visual debt 4 was not two overlapping panels. Tony's order pad sat *behind*
 * the panel's scrim, dimmed, so nothing overlapped and nothing was unreadable —
 * and it was still a second transient surface up at the same time as the first.
 * A DOM check that asks "is the pad rendered" would have passed then and passes
 * now, because the fix is that the pad **yields**: it is still in the tree, at
 * `opacity: 0`, so its state survives and it comes straight back.
 *
 * So this measures what a manager can see: a transient counts when it has real
 * opacity and real area, following every ancestor's opacity down. That is the
 * only formulation that fails on the old build and passes on the new one.
 */
async function checkOneTransient(page: Page, width: number, state: string): Promise<void> {
  const visible = await page.evaluate(() => {
    /*
     * The room's transient surfaces, by the marker each one already carries.
     * `[data-room-panel]` is every `RoomPanel`; `.tony-line` is the order pad;
     * `.reveal-rise` is the collectible plate.
     */
    const surfaces = [
      ['panel', '[data-room-panel]'],
      ['tony-line', '.tony-line'],
      ['reveal', '.reveal-rise'],
    ] as const;

    const shown: string[] = [];
    for (const [name, selector] of surfaces) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const box = element.getBoundingClientRect();
        if (box.width < 4 || box.height < 4) continue;

        // Opacity is inherited multiplicatively through ancestors, and the pad
        // yields by setting it on a wrapper rather than on the box itself.
        let opacity = 1;
        for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.visibility === 'hidden' || style.display === 'none') {
            opacity = 0;
            break;
          }
          opacity *= Number(style.opacity);
        }
        if (opacity > 0.05) shown.push(name);
      }
    }
    return shown;
  });

  if (visible.length > 1) {
    fail(
      'one-transient',
      `@${String(width)} ${state} shows ${String(visible.length)} transient surfaces at once ` +
        `(${visible.join(' + ')}). MANDATE §6: the room offers one at a time.`,
    );
  }
}

/**
 * A focused room object is visible — WCAG 2.4.7, and `MANDATE §6`.
 *
 * ## Why this gate did not exist and needed to
 *
 * `.room-shape:focus-visible .door-edge` was how a room object showed keyboard
 * focus. `18 §9.4` withdrew the authored polygons that class was painted on, the
 * selector stopped matching anything, and **nothing else in the stylesheet
 * styled focus** — every room object carries `outline-none`. So tabbing through
 * the parlor moved an invisible cursor.
 *
 * There has been a `keyboard-focus` screenshot state the whole time. It
 * photographed a room with no visible focus and passed, because a screenshot
 * only fails when somebody looks at it. This is the assertion that does not
 * depend on anybody looking.
 */
async function checkFocusVisible(page: Page, width: number): Promise<void> {
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const style = getComputedStyle(active);
    return {
      room: active.classList.contains('room-shape'),
      label: active.getAttribute('aria-label')?.slice(0, 40) ?? active.tagName,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
    };
  });

  if (focused === null) {
    fail('focus-visible', `@${String(width)} nothing is focused after tabbing into the room`);
    return;
  }
  if (!focused.room) {
    // Four tabs is meant to land inside the room. If it does not, this gate is
    // measuring the utility bar and would pass for the wrong reason.
    fail(
      'focus-visible',
      `@${String(width)} tabbing landed on "${focused.label}", which is not a room object`,
    );
    return;
  }

  const transparent = /rgba\([^)]*,\s*0\s*\)/.test(focused.outlineColor);
  if (focused.outlineStyle === 'none' || focused.outlineWidth < 2 || transparent) {
    fail(
      'focus-visible',
      `@${String(width)} the focused room object "${focused.label}" has no visible ring ` +
        `(outline: ${focused.outlineStyle} ${String(focused.outlineWidth)}px ` +
        `${focused.outlineColor}). WCAG 2.4.7.`,
    );
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

/**
 * Nothing a manager can read is set below the type floor.
 *
 * ## Why this is here and not only in the unit test
 *
 * `lib/design/typography.test.ts` is static: it reads the source and refuses a
 * `text-[Npx]` outside the type case. That closes the door somebody would walk
 * through on purpose. It cannot see the other three:
 *
 *   - a size **inherited** from an ancestor that names a role, then re-set
 *     smaller by a stylesheet rule further down `globals.css`
 *   - a size that only exists in **one state** — a disclosure, an error, a panel
 *     that opens — which no static reading of a class string reveals as rendered
 *   - a size that arrives from the **browser**: a form control that Safari
 *     restyles, or a `1rem` floor that resolves differently than assumed
 *
 * This measures the computed size of every text-bearing element that is actually
 * on screen, at every width, on every state. It is the half of the rule that is
 * about what a person sees rather than about what the source says.
 *
 * ## What counts as text
 *
 * An element with a **non-empty text child of its own** — so a wrapper whose
 * text lives three levels down is judged where the words are, and a hidden or
 * zero-area element is not judged at all. `aria-hidden` decoration is included
 * on purpose: a 6px chalk mark is not text, but it also has no text node, so it
 * never reaches this check, while a 9px decorative caption does and should.
 *
 * ## The one declared exemption, and why it is declared rather than inferred
 *
 * Text that is **painted onto the artwork** is sized in the artwork's own units,
 * because a fixed pixel size inside a scaled room drifts off whatever it is
 * drawn on. Today that is exactly one thing: the season year on a champion's
 * pennant, which is capped by an 18 × 15 unit piece of fabric and cannot reach
 * thirteen pixels at any width.
 *
 * It carries `data-environmental-type`, so the exemption is a visible, greppable
 * decision in the markup rather than a shape this gate infers. And the gate
 * **counts the distinct kinds**: a second one is a failure, so the opt-out
 * cannot become the way small type gets past the floor.
 */
async function checkTypeFloor(page: Page, width: number, state: string): Promise<void> {
  const { small, exempt } = await page.evaluate((floor: number) => {
    const out: string[] = [];
    const kinds = new Set<string>();

    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .join('');
      if (own === '') continue;

      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;

      const size = Number.parseFloat(s.fontSize);
      if (Number.isNaN(size) || size >= floor) continue;

      const painted = el.closest<HTMLElement>('[data-environmental-type]');
      if (painted !== null) {
        kinds.add(painted.dataset['environmentalType'] ?? '');
        continue;
      }

      out.push(`${el.tagName.toLowerCase()} at ${size.toFixed(1)}px — "${own.slice(0, 40)}"`);
    }

    // One report per distinct size-and-tag, not one per rendered node: a
    // twenty-four-spot shelf would otherwise print the same defect twenty-four
    // times and bury every other gate in the run.
    return { small: [...new Set(out)], exempt: [...kinds] };
  }, TYPE_FLOOR_PX);

  for (const problem of small) {
    fail('type-floor', `@${String(width)} ${state}: ${problem}`);
  }

  // The opt-out is one thing, by decision. A second kind means somebody used it
  // to get small copy past the floor rather than to paint on the artwork.
  for (const kind of exempt) {
    if (kind !== ENVIRONMENTAL_TYPE) {
      fail(
        'type-floor',
        `@${String(width)} ${state}: undeclared environmental type "${kind}" — ` +
          `only "${ENVIRONMENTAL_TYPE}" is exempt from the ${String(TYPE_FLOOR_PX)}px floor`,
      );
    }
  }
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
  // What every manager sees since the basement shipped: the stairs open, the
  // curtain shut, and the whole locked-door mechanism still exercised by the
  // curtain rather than becoming untested when the stairs opened.
  'back-hall': { rooms: true, underground: false },
  // What setting `rooms` back to `false` produces.
  'back-hall-shut': { rooms: false, underground: false },
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

/**
 * What each press-desk state must actually contain.
 *
 * Written as a table for the same reason `BOARD_EXPECTATIONS` is: the useful
 * question about a publication gate is *"what does this screenshot prove"*, and
 * that is only answerable if every state's claim is in one place.
 *
 * The counts are **at least**, deliberately. Press-desk states are league-scoped
 * and additive — an issue belongs to the league rather than to a seat — so by the
 * time `review-published` runs, the drafts the earlier states made are still
 * waiting. Asserting equality would encode the run order into the gate, and a
 * gate that breaks when states are reordered gets reordered around.
 *
 * `review-empty` is the exception and asserts the marker instead: it is a
 * rendering (`?desk=empty`), and the thing that can silently fail is the
 * parameter not resolving on the server.
 */
const DESK_EXPECTATIONS: Record<
  string,
  {
    readonly desk?: 'empty' | 'live';
    readonly hold?: 'on' | 'off';
    readonly atLeast?: Partial<Record<'waiting' | 'approved' | 'published' | 'refused', number>>;
    /** The detail screen rather than the queue: the version's own status. */
    readonly version?: string;
    /** And whether the validator passed it. */
    readonly publishable?: 'yes' | 'no';
  }
> = {
  'review-empty': { desk: 'empty', hold: 'off', atLeast: { waiting: 0, published: 0 } },
  'review-waiting': { desk: 'live', hold: 'off', atLeast: { waiting: 1 } },
  'review-held': { desk: 'live', hold: 'on', atLeast: { approved: 1 } },
  'review-draft': { version: 'needs_review', publishable: 'yes' },
  // The same draft, lower down. The stamp only exists in this state.
  'review-decision': { version: 'needs_review', publishable: 'yes' },
  // The validator's refusal, on the screen where it is explained rather than on
  // the row where it is only labelled.
  'review-refused': { version: 'needs_review', publishable: 'no' },
  'review-approved': { version: 'approved' },
  'review-published': { version: 'published' },
  /*
   * The draft review, on the desk.
   *
   * Listed here rather than in the preseason table because it *is* a press-desk
   * state — the point of the screenshot is that the special edition arrives in
   * the same queue, on the same screen, needing the same stamp. `publishable:
   * yes` is the assertion that matters: it is the deterministic validator having
   * passed a page whose facts came from a draft rather than from a week.
   */
  'preseason-review': { version: 'needs_review', publishable: 'yes' },
};


/**
 * What each draft-board state must actually contain.
 *
 * The progress count is the whole screen, so it is the whole assertion. An
 * **exact** count rather than an at-least, unlike the press desk's: a review
 * belongs to a `(season, manager)` pair and `writeDemoReviews` clears the rest,
 * so unlike an issue these states do not accumulate — and a board that showed
 * ten under a name claiming four would be the exact false green this file has
 * been bitten by twice.
 */
const DRAFT_BOARD_EXPECTATIONS: Record<
  string,
  {
    readonly reviewed: number;
    readonly total: number;
    /** Is the league in the state a draft review is for? */
    readonly board: 'ready' | 'waiting' | 'none';
    /** The editor screens: has Tony written this one? */
    readonly editor?: 'blank' | 'written';
  }
> = {
  'draft-board-empty': { reviewed: 0, total: 10, board: 'ready' },
  'draft-board-partial': { reviewed: 4, total: 10, board: 'ready' },
  'draft-board-complete': { reviewed: 10, total: 10, board: 'ready' },
  'draft-editor-blank': { reviewed: 4, total: 10, board: 'ready', editor: 'blank' },
  'draft-editor-written': { reviewed: 4, total: 10, board: 'ready', editor: 'written' },
};

/**
 * The gate against a draft-board false green.
 *
 * Three separate things can silently produce a clean screenshot here and each
 * one is checked rather than trusted:
 *
 * - **the 404.** `requireAdmin()` answers `notFound()`, so a seat without the
 *   commissioner's keys photographs a tidy page under this state's name. The
 *   marker is only present on the real screen.
 * - **the wrong count.** `0 of 10` and `4 of 10` differ by two glyphs at
 *   thumbnail size, and three states that all photographed `10 of 10` would look
 *   like three states.
 * - **the wrong row.** The editor states are told apart by whether a take is on
 *   the screen, which is a *presence* rather than a layout — so it is read from
 *   the DOM, not looked for in the picture.
 */
async function checkDraftBoard(page: Page, width: number, state: string): Promise<void> {
  const expected = DRAFT_BOARD_EXPECTATIONS[state];
  if (expected === undefined) return;

  if (expected.editor === undefined) {
    const marker = await page.getAttribute('[data-draft-board]', 'data-draft-board');
    if (marker === null) {
      fail(
        'draft-board',
        `@${String(width)} ${state}: the draft board did not render — most likely a 404 from ` +
          `requireAdmin(), which photographs cleanly and would file under this state's name`,
      );
      return;
    }
    if (marker !== expected.board) {
      fail(
        'draft-board',
        `@${String(width)} ${state}: the board says "${marker}" and the state claims ` +
          `"${expected.board}"`,
      );
    }

    const progress = await page.getAttribute('[data-draft-progress]', 'data-draft-progress');
    const want = `${String(expected.reviewed)}/${String(expected.total)}`;
    if (progress !== want) {
      fail(
        'draft-board',
        `@${String(width)} ${state}: the board reports ${progress ?? 'nothing'} reviewed and the ` +
          `state claims ${want}`,
      );
    }

    /*
     * The print button is present exactly when the board is complete.
     *
     * The negative is the half worth photographing: it is absent at `0 of 10`
     * and at `4 of 10`, which is what makes its presence at `10 of 10` mean
     * *"completeness turned it on"* rather than *"somebody set a flag"*.
     */
    const canPrint = await page
      .locator('form button', { hasText: /Print a draft review/i })
      .count();
    const shouldPrint = expected.reviewed === expected.total;
    if (shouldPrint !== canPrint > 0) {
      fail(
        'draft-board',
        `@${String(width)} ${state}: the print control is ${canPrint > 0 ? 'present' : 'absent'} ` +
          `and ${shouldPrint ? 'should be present' : 'should not be'} at ` +
          `${String(expected.reviewed)} of ${String(expected.total)}`,
      );
    }
    return;
  }

  const editor = await page.getAttribute('[data-draft-editor]', 'data-draft-editor');
  if (editor === null) {
    fail(
      'draft-board',
      `@${String(width)} ${state}: the editor did not render — most likely a 404 from ` +
        `requireAdmin()`,
    );
    return;
  }
  if (editor !== expected.editor) {
    fail(
      'draft-board',
      `@${String(width)} ${state}: the editor is "${editor}" and the state claims ` +
        `"${expected.editor}"`,
    );
  }

  /*
   * The grade grid holds the whole domain, always.
   *
   * Thirteen taps is the reason the grade is not typed, and a grid that silently
   * rendered eleven would still look like a grid. Read from the DOM rather than
   * counted in the picture, because at 360 the fourth column is the one at risk
   * and a missing one is invisible.
   */
  const grades = await page.locator('[data-grade-picker] label').count();
  if (grades !== 13) {
    fail(
      'draft-board',
      `@${String(width)} ${state}: the grade picker offers ${String(grades)} grades, not 13`,
    );
  }

  /* The draft is on the screen the take is written on. That is the whole layout claim. */
  if ((await page.locator('[data-draft-snapshot]').count()) === 0) {
    fail(
      'draft-board',
      `@${String(width)} ${state}: the editor shows no draft snapshot, so a take would be ` +
        `written with nothing to write it about`,
    );
  }
}

/**
 * The states that carry a draft-review issue.
 *
 * Two previews and the published one. `slice-preseason` is deliberately absent:
 * it is the **empty rack** before the season, which is a different state with a
 * different name that happens to share five letters.
 */
const PRESEASON_ISSUE_STATES: ReadonlySet<string> = new Set([
  'slice-preseason-draft-review',
  'slice-preseason-sparse',
  'preseason-teams',
  'preseason-rack',
]);

/**
 * The draft-review issue must actually be a draft review.
 *
 * `?edition=` resolves on the **server** behind the demo guard, so a run without
 * `DEMO_FIXTURES` on the server process answers with the ordinary rack — which
 * photographs cleanly, files under the edition's name and passes. The nine
 * `reveal-*` states cost a milestone to exactly that.
 *
 * So the marker is read, and then the two things that make it *this* issue: ten
 * grades on the board, and a section per manager. A preseason page with nine of
 * ten sections is a page missing a manager, and the missing manager is the one
 * who would notice.
 */
async function checkPreseasonIssue(page: Page, width: number, state: string): Promise<void> {
  if ((await page.locator('[data-preseason-board]').count()) === 0) {
    fail(
      'preseason',
      `@${String(width)} ${state}: no draft board on the page — the issue is not a draft review, ` +
        `most likely because the preview did not resolve on the server`,
    );
    return;
  }

  const grades = await page.locator('[data-preseason-grade]').count();
  const teams = await page.locator('[data-preseason-team]').count();

  if (grades !== teams) {
    fail(
      'preseason',
      `@${String(width)} ${state}: ${String(grades)} grades on the board and ${String(teams)} ` +
        `team sections — every manager on the board must have a section`,
    );
  }

  if (teams < 10) {
    fail(
      'preseason',
      `@${String(width)} ${state}: ${String(teams)} team sections, and the league has ten. A ` +
        `manager missing from their own draft review is the defect this state exists to catch`,
    );
  }

  /*
   * Every section carries a take.
   *
   * The take is the required field, so a section without one is an issue that
   * should never have been publishable — and the packet refuses exactly that,
   * which makes this an assertion about the gate rather than about the page.
   */
  const takes = await page.locator('[data-preseason-take]').count();
  if (takes !== teams) {
    fail(
      'preseason',
      `@${String(width)} ${state}: ${String(takes)} takes across ${String(teams)} sections`,
    );
  }
}

/**
 * The gate against a press-desk false green.
 *
 * `requireAdmin()` answers with `notFound()`, so a demo seat that failed to get
 * the commissioner's keys renders a **404** — which photographs cleanly, files
 * under the state's name, and passes every other gate in this file. The nine
 * `reveal-*` states cost a milestone to exactly that, so the marker is checked
 * rather than the pixels.
 */
/**
 * A score deck breaks between the two teams, never inside one.
 *
 * ## The defect this exists for
 *
 * The deck is one string — `Matty B 164.74 — Nick 130.78` — and set as ordinary
 * text it wraps wherever the line runs out. On 2025 week 7 at 390px that landed
 * between `Nick` and `130.78`, printing a manager on one line and their score on
 * the next. Both lines are grammatical and neither is complete.
 *
 * ## Why this is measured rather than photographed
 *
 * It is invisible in a screenshot review unless the reviewer happens to know
 * what the deck said, and it depends on the **names in that week's fixture** —
 * so it appears and disappears as the demo editions change, which is the worst
 * kind of regression to chase. Client rects are the only honest test: the two
 * halves each occupy one line or the deck occupies one line, and no other
 * arrangement is allowed.
 *
 * Fails on the old build, where the halves were bare text nodes with no
 * `whitespace-nowrap` and a two-line deck put the break inside a team.
 */
async function checkDeckWrap(page: Page, width: number, state: string): Promise<void> {
  const decks = await page.evaluate(() => {
    const out: { text: string; halves: number[]; lines: number }[] = [];

    for (const deck of document.querySelectorAll('[data-slice-deck]')) {
      const text = (deck.textContent ?? '').trim();
      // Only the two-team form is constrained. A deck with no separator is a
      // sentence and wraps as prose, deliberately.
      if (!text.includes(' \u2014 ')) continue;

      /*
       * How many lines the deck occupies, from its own client rects rather than
       * from a height division — a `Range` reports one rect per line box, which
       * is the browser's own answer to "did this wrap".
       */
      const range = document.createRange();
      range.selectNodeContents(deck);
      const lines = new Set(
        [...range.getClientRects()].map((rect) => Math.round(rect.top)),
      ).size;

      // Each half must sit on exactly one line. `inline-block` + nowrap is what
      // makes that true; without it a half is a bare text node that can split.
      const halves = [...deck.querySelectorAll('span')]
        .filter((span) => (span.textContent ?? '').trim() !== '\u2014')
        .map(
          (span) =>
            new Set([...span.getClientRects()].map((rect) => Math.round(rect.top))).size,
        );

      out.push({ text, halves, lines });
    }

    return out;
  });

  for (const deck of decks) {
    if (deck.halves.length !== 2) {
      fail(
        'deck-wrap',
        `@${String(width)} ${state} score deck "${deck.text}" is not split into two ` +
          `unbreakable halves (found ${String(deck.halves.length)}). A deck that is one ` +
          `text node wraps between a manager and their score.`,
      );
      continue;
    }

    const split = deck.halves.find((count) => count > 1);
    if (split !== undefined) {
      fail(
        'deck-wrap',
        `@${String(width)} ${state} score deck "${deck.text}" broke *inside* a team — ` +
          `one half occupies ${String(split)} lines. A score separated from the person ` +
          `who posted it is two incomplete lines, not a smaller version of one.`,
      );
    }
  }
}

/**
 * What each office state must actually contain.
 *
 * **Exact counts, not `atLeast`** — which is the opposite of `DESK_EXPECTATIONS`
 * and is the whole reason the preview parameter exists. The press desk's states
 * are additive and league-scoped, so equality there would encode the run order
 * into the gate. Here the narrowing makes each screen's composition a fact, and
 * a fact is worth pinning: an off-by-one in the filter, a band that stops being
 * produced, or an item leaking between screens are all silent otherwise.
 *
 * `office` is the one a commissioner meets today, and its zeroes are the
 * assertion: the preview resolved on the server, and the empty desk is empty.
 */
const OFFICE_EXPECTATIONS: Record<
  string,
  {
    readonly outstanding: number;
    readonly pending: number;
    /** Exactly which bands are on the screen, in the order they are rendered. */
    readonly bands: readonly string[];
  }
> = {
  office: { outstanding: 0, pending: 0, bands: [] },
  /*
   * **Two ready, and the second one is Tony's draft review.**
   *
   * This row said one until the preseason issue existed. The office queue is
   * deliberately **league-wide and unnarrowed** — `reviewQueue` takes no season
   * and no kind, because *"is there anything for me at all"* is a question that
   * cannot be answered by a filtered list. So the moment a preseason issue is
   * drafted and submitted, it is a decision waiting on the commissioner and the
   * queue is right to show it.
   *
   * It cannot be ordered around. The sweep iterates **width outermost**, and
   * the database is not reset between widths, so a state photographed before
   * `office-*` at 390 is still on the desk when `office-*` runs at 375 and 360.
   * Moving the preseason block after the office block would make 390 correct
   * and the other two wrong — a worse failure than this one, because it would
   * look like a width-dependent bug in the queue.
   *
   * So the expectation follows the desk rather than the desk following the
   * expectation, and the counts stay **exact**: this still fails on an
   * off-by-one, a band that stops being produced, or an item leaking between
   * screens. What it now also photographs is worth having on its own account —
   * the queue holding **both kinds of paper at once**, which is the state a
   * commissioner is actually in on the Tuesday after the draft.
   */
  'office-ready': { outstanding: 2, pending: 2, bands: ['ready', 'ready'] },
  'office-blocked': { outstanding: 1, pending: 1, bands: ['blocked'] },
  /* The weekly issue and the draft review, both printed. See `office-ready`. */
  'office-printed': { outstanding: 0, pending: 0, bands: ['published', 'published'] },
  /*
   * The whole desk: **two** waiting, **two** stamped, one refused, **two**
   * printed — where it was one, two, one, one before the draft review.
   *
   * The order is the queue's priority — a thing you can complete above a thing
   * you cannot — so this row is also the assertion that the ordering rule holds
   * on a real screen rather than only in a unit test.
   *
   * The second `approved` is not a mistake and it is not the applier's. It was
   * written here as one, and the gate said four: `review-approved` and
   * `review-held` each leave a stamped-and-unprinted version on the desk, and
   * `office-queue`'s applier **releases the hold**, so the held one becomes an
   * ordinary approved item rather than disappearing.
   *
   * Corrected here rather than suppressed in the applier, because the desk that
   * would show three is a desk the database does not have — and the pair is
   * worth photographing on its own account: two items in one band is the only
   * state where the recency tie-break inside a band is visible.
   */
  'office-queue': {
    outstanding: 5,
    pending: 5,
    bands: ['ready', 'ready', 'approved', 'approved', 'blocked', 'published', 'published'],
  },
};

/**
 * The gate against an office-queue false green.
 *
 * Two ways this screen can lie, and neither is visible in a screenshot:
 *
 *   1. `requireAdmin()` answers `notFound()`, so a seat that failed to get the
 *      commissioner's keys photographs a **404** that files under the state's
 *      name and passes every pixel gate. That is the failure the nine `reveal-*`
 *      states cost a milestone to.
 *   2. The queue is the surface `16 §9`'s approval gate is *found* through. A
 *      queue that silently showed nothing — a broken filter, a preview
 *      resolving in production, a band that stopped being produced — would look
 *      exactly like a quiet week, which is the ordinary state.
 *
 * So the marker is checked rather than the pixels, and the composition is
 * checked rather than the marker alone.
 */
async function checkOfficeQueue(page: Page, width: number, state: string): Promise<void> {
  const expected = OFFICE_EXPECTATIONS[state];
  if (expected === undefined) {
    fail('office-queue', `@${String(width)} ${state} has no entry in OFFICE_EXPECTATIONS`);
    return;
  }

  const at = `@${String(width)} ${state}`;

  const found = await page.evaluate(() => {
    const queue = document.querySelector('[data-review-queue-pending]');
    return {
      rendered: queue !== null,
      pending: Number(queue?.getAttribute('data-review-queue-pending') ?? '-1'),
      outstanding: Number(queue?.getAttribute('data-review-queue-size') ?? '-1'),
      bands: [...document.querySelectorAll('[data-review-item]')].map(
        (el) => el.getAttribute('data-review-item') ?? '',
      ),
    };
  });

  if (!found.rendered) {
    fail(
      'office-queue',
      `${at} the office queue did not render — is the seat a commissioner? ` +
        'requireAdmin() answers notFound(), which photographs cleanly.',
    );
    return;
  }

  if (found.outstanding !== expected.outstanding) {
    fail(
      'office-queue',
      `${at} shows ${String(found.outstanding)} outstanding item(s), expected ${String(expected.outstanding)}`,
    );
  }

  if (found.pending !== expected.pending) {
    fail(
      'office-queue',
      `${at} counts ${String(found.pending)} as pending, expected ${String(expected.pending)}`,
    );
  }

  if (found.bands.join(',') !== expected.bands.join(',')) {
    fail(
      'office-queue',
      `${at} rendered bands [${found.bands.join(', ')}], expected [${expected.bands.join(', ')}]`,
    );
  }
}

async function checkReviewDesk(page: Page, width: number, state: string): Promise<void> {
  const expected = DESK_EXPECTATIONS[state];
  if (expected === undefined) {
    fail('review-desk', `@${String(width)} ${state} has no entry in DESK_EXPECTATIONS`);
    return;
  }

  const at = `@${String(width)} ${state}`;

  const found = await page.evaluate(() => {
    const queue = document.querySelector('[data-review-queue]');
    const version = document.querySelector('[data-review-version]');
    const sections: Record<string, number> = {};
    for (const el of document.querySelectorAll('[data-review-section]')) {
      sections[el.getAttribute('data-review-section') ?? ''] = Number(
        el.getAttribute('data-review-count') ?? '0',
      );
    }
    return {
      desk: queue?.getAttribute('data-review-queue') ?? null,
      hold: queue?.getAttribute('data-review-hold') ?? null,
      version: version?.getAttribute('data-review-version') ?? null,
      publishable: version?.getAttribute('data-review-publishable') ?? null,
      sections,
    };
  });

  if (expected.version !== undefined) {
    if (found.version !== expected.version) {
      fail(
        'review-desk',
        `${at} expected a draft at "${expected.version}", found ${String(found.version)}`,
      );
    }
    if (expected.publishable !== undefined && found.publishable !== expected.publishable) {
      fail(
        'review-desk',
        `${at} expected the check to have said "${expected.publishable}", found ${String(found.publishable)}`,
      );
    }
    return;
  }

  if (found.desk === null) {
    fail('review-desk', `${at} the press desk did not render — is the seat a commissioner?`);
    return;
  }

  if (expected.desk !== undefined && found.desk !== expected.desk) {
    fail('review-desk', `${at} expected desk "${expected.desk}", found "${found.desk}"`);
  }

  if (expected.hold !== undefined && found.hold !== expected.hold) {
    fail('review-desk', `${at} expected the hold ${expected.hold}, found ${String(found.hold)}`);
  }

  for (const [section, minimum] of Object.entries(expected.atLeast ?? {})) {
    const actual = found.sections[section] ?? 0;
    if (actual < minimum) {
      fail(
        'review-desk',
        `${at} expected at least ${String(minimum)} in "${section}", found ${String(actual)}`,
      );
    }
  }

}

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

/**
 * What each basement state claims to be, checked against what rendered.
 *
 * ## Why this is not "the driver navigated, so it must be right"
 *
 * Every room state builds its own precondition by pressing the room's own
 * controls, and a control that silently did nothing would leave the page
 * looking plausible and the screenshot filed under a name claiming otherwise.
 * That is the false green nine `reveal-*` states shipped and `checkBoard` was
 * written against. So the count of things on show, the theme actually rendered
 * and the presence of the four places are read **out of the DOM**.
 *
 * `filled` is a count rather than a list because which item lands where depends
 * on what the seat happens to own, and that is not a property this gate should
 * pin — it would fail on a rebalanced reward table for no reason.
 */
const ROOM_STATES: Readonly<
  Record<string, { filled: number; theme?: string; panel?: boolean; visiting?: boolean }>
> = {
  room: { filled: 0, theme: 'storeroom' },
  'room-furnished': { filled: 4, theme: 'storeroom' },
  'room-slot': { filled: 4, theme: 'storeroom', panel: true },
  'room-corridor': { filled: 4, theme: 'storeroom', panel: true },
  'room-rec': { filled: 4, theme: 'rec_room' },
  'room-cold': { filled: 4, theme: 'cold_store' },
  // A visited room is somebody else's, so nothing is pinned about its contents.
  'room-visited': { filled: -1, visiting: true },
  // A manager who owns nothing. The four places must still be there and empty.
  'room-empty': { filled: 0 },
};

async function checkRoom(page: Page, width: number, state: string): Promise<void> {
  const expected = ROOM_STATES[state];
  if (expected === undefined) return;

  const at = `@${String(width)} ${state}`;

  const found = await page.evaluate(() => ({
    objects: [...document.querySelectorAll('[data-room-object]')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => el.getAttribute('data-room-object') ?? '')
      .sort(),
    items: document.querySelectorAll('[data-room-item]').length,
    theme: document.querySelector('[data-room-theme]')?.getAttribute('data-room-theme') ?? '',
    shell: document.querySelector('[data-room-shell]')?.getAttribute('data-room-shell') ?? '',
    panels: document.querySelectorAll('[data-room-panel]').length,
    path: window.location.pathname,
  }));

  /*
   * The map, on every room state.
   *
   * Eight objects, the same eight, whether the room is yours or somebody
   * else's. A visited room that quietly dropped an object — or gained one —
   * would be a different room wearing the same geometry, and the whole claim of
   * `/rooms/<manager>` is that it is the *same* room with nothing that writes.
   */
  const wanted = ['bench', 'corridor', 'manager', 'rings', 'shelf_left', 'shelf_right', 'stairs', 'wall'];
  if (found.objects.join(',') !== wanted.join(',')) {
    fail('object-map', `${at} the basement is ${found.objects.join(', ') || 'empty'}, expected ${wanted.join(', ')}`);
    return;
  }

  if (expected.visiting === true) {
    if (!/^\/rooms\/[0-9a-f-]{36}$/.test(found.path)) {
      fail('room', `${at} is on ${found.path}, expected somebody else's room`);
    }
  } else if (found.path !== '/rooms') {
    fail('room', `${at} is on ${found.path}, expected /rooms`);
  }

  if (expected.filled >= 0 && found.items !== expected.filled) {
    fail(
      'room',
      `${at} has ${String(found.items)} thing(s) on show, expected ${String(expected.filled)} — ` +
        'the state builds this by pressing the room\'s own controls, so a mismatch means a control did nothing',
    );
  }

  if (expected.theme !== undefined && found.theme !== expected.theme) {
    fail('room', `${at} is drawn as ${found.theme || 'nothing'}, expected ${expected.theme}`);
  }

  /*
   * **Which half of `manager-room.tsx` rendered.**
   *
   * The room is a painted shell whose art does not exist yet, so today every
   * capture is the drawn stand-in. That is a fact a screenshot cannot carry: a
   * reviewer looking at these files has no way to tell *"this is the room"* from
   * *"this is what stands in for the room"*, and the moment a shell lands for one
   * theme and not another, two of these pictures mean different things under the
   * same naming.
   *
   * So it is read out of the DOM and reported. It is deliberately **not** pinned
   * to `drawn`: the day a shell lands, this gate must go green on the better
   * picture rather than fail for having got what it was waiting for.
   */
  if (found.shell !== 'art' && found.shell !== 'drawn') {
    fail('room', `${at} declares no shell — expected data-room-shell="art" or "drawn"`);
  }

  if (expected.panel === true && found.panels === 0) {
    fail('room', `${at} was meant to have a panel up and has none`);
  }

  await checkManagerBelongsInTheRoom(page, at);

  /*
   * **A visitor has nothing that writes.**
   *
   * Read from the rendered page rather than trusted to the absence of an import:
   * `app/actions/rooms.ts` takes no manager id, so a visitor cannot change
   * anybody's room — and the way that guarantee would be lost is a control
   * appearing on this page, not an action gaining a parameter.
   */
  if (expected.visiting === true) {
    const writable = await page.evaluate(() =>
      [...document.querySelectorAll('[data-room-panel] button')].some((el) =>
        /put .* here|take .* down|move .* here|the (storeroom|rec room|cold store)/i.test(
          el.getAttribute('aria-label') ?? el.textContent ?? '',
        ),
      ),
    );
    if (writable) fail('room', `${at} offers a control that would change somebody else's room`);
  }
}

/**
 * The manager stands in the room at the room's own resolution, and casts a
 * shadow on its floor.
 *
 * **This is the gate for the 2026-08-10 sprite-quality pass**, and it is measured
 * in the browser because the thing it is holding is a *relationship between two
 * pictures* — the painted shell and the sprite standing on it — which neither
 * one's own tests can see.
 *
 * `lib/rooms/objects.test.ts` pins the authored numbers: the manager's rectangle
 * is exactly the sprite canvas, so one sprite pixel is one room unit, the same
 * ratio the shell and every collectible already keep. What that test cannot see
 * is the **rendered** result: a stylesheet that sized the figure by anything but
 * the room's own scale would put it back to being a coarser picture magnified
 * into a finer one, which is the defect the commissioner reported and the
 * arithmetic would still be green.
 *
 * So it compares device pixels per source pixel for the two, and they must
 * match. No integer is required of either — `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md`
 * records that integer scaling is unavailable on these viewports and cannot be
 * bought (`gcd(1080, 1125, 1170) = 45`). Agreement is the whole property.
 */
async function checkManagerBelongsInTheRoom(page: Page, at: string): Promise<void> {
  const seen = await page.evaluate(
    ({ canvasWidth, canvasHeight }) => {
      const room = document.querySelector('[data-room-shell]');
      const figure = document.querySelector('[data-room-character] [data-character-view]');
      const shadow = document.querySelector('[data-room-shadow]');
      if (room === null || figure === null) return null;

      const roomBox = room.getBoundingClientRect();
      const figureBox = figure.getBoundingClientRect();
      return {
        // The room is authored 320 units wide (`lib/parlor/objects.ts`).
        roomScale: roomBox.width / 320,
        spriteScaleX: figureBox.width / canvasWidth,
        spriteScaleY: figureBox.height / canvasHeight,
        /*
         * The rendered width, not the element's existence. The first version of
         * this shadow was a `rounded-[50%] blur-[2px]` span whose arbitrary
         * utilities Tailwind never emitted — the element was in the DOM at every
         * width and drew nothing anybody could see. A gate that asks whether a
         * node exists would have been green on it.
         */
        shadow: shadow === null ? null : shadow.getBoundingClientRect().width,
        shadowAlpha: shadow === null ? '' : getComputedStyle(shadow).backgroundColor,
        feet: figureBox.bottom,
        shadowBottom: shadow?.getBoundingClientRect().bottom ?? 0,
      };
    },
    { canvasWidth: CHARACTER_CANVAS.width, canvasHeight: CHARACTER_CANVAS.height },
  );

  if (seen === null) {
    fail('room', `${at} draws no manager in the room at all`);
    return;
  }

  const drift = Math.abs(seen.spriteScaleX - seen.roomScale) / seen.roomScale;
  if (drift > 0.02) {
    fail(
      'room',
      `${at} draws the manager at ${seen.spriteScaleX.toFixed(3)} CSS px per sprite pixel in a ` +
        `room drawn at ${seen.roomScale.toFixed(3)} per room unit — ${(drift * 100).toFixed(1)}% ` +
        'apart. A figure at a different resolution from the room it stands in reads as pasted on, ' +
        'whatever it is drawn like.',
    );
  }

  if (Math.abs(seen.spriteScaleX - seen.spriteScaleY) > 0.01) {
    fail(
      'room',
      `${at} draws the manager ${seen.spriteScaleX.toFixed(3)} wide by ` +
        `${seen.spriteScaleY.toFixed(3)} tall per sprite pixel. The figure is stretched.`,
    );
  }

  /*
   * The shadow is the difference between standing in a room and being placed on
   * a picture of one, and it is the one cue no work on the sprite itself can
   * supply. Checked for existence and for landing at the feet — a shadow that
   * has drifted up the wall is worse than none.
   */
  const opaque = /rgba?\([^)]*?(?:,\s*([\d.]+))?\)\s*$/.exec(seen.shadowAlpha);
  const alpha = opaque?.[1] === undefined ? 1 : Number(opaque[1]);

  if (seen.shadow === null || seen.shadow < seen.roomScale * 20 || alpha < 0.15) {
    fail(
      'room',
      `${at} draws no shadow under the manager (width ${String(seen.shadow ?? 'absent')}, ` +
        `fill ${seen.shadowAlpha || 'none'}), so the figure floats on the rug`,
    );
  } else if (Math.abs(seen.shadowBottom - seen.feet) > seen.roomScale * 8) {
    fail(
      'room',
      `${at} puts the manager's shadow ${Math.round(seen.shadowBottom - seen.feet)}px from their ` +
        'feet. A shadow that is not at the feet is a smudge.',
    );
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
  /*
   * Measured with **nothing asked for**, which is half of what this gate says.
   *
   * `18 §3` is about the *unprompted* room: a Door glows because it has
   * something to say, and nothing else advertises unasked. The affordance
   * reveal is the other case — somebody asked *"what can I touch"*, or the
   * arrival is answering it for them — and `globals.css` has always drawn the
   * Displays and the Toy their edges under `.showing-taps` for exactly that.
   *
   * The arrival turns that class on at 1600ms and off at 4900ms, and `home()`
   * settles at 2500. So every "idle" room this driver has ever judged was a
   * room mid-reveal, and the gate happened to pass only because the reveal's
   * one rendered effect at the time was a 2px lift on Tony — the defect this
   * session removed. Replacing it with the alpha-derived edge `18 §9.4` asks
   * for made the collision visible immediately.
   *
   * Waiting is the fix rather than an exemption: an exemption would stop the
   * gate noticing a glow that arrives on a Display and *stays*.
   */
  await page
    .waitForFunction(() => document.querySelector('.showing-taps') === null, undefined, {
      timeout: 8000,
    })
    .catch(() => undefined);

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
   * A spare says what it is worth, in tokens, on the plate.
   *
   * The composition differs from every other reveal in exactly one line — the
   * one that would otherwise say "7 of 24 on your shelf", which on a salvage is
   * false because nothing went on the shelf. A plate that lost this line would
   * still show an item, a rarity and an offer, and would look entirely fine.
   */
  if (state === 'reveal-spare' && !/spare/i.test(seen.text)) {
    fail(
      'reveal',
      `@${String(width)} ${state} does not say what happened to the spare. ` +
        'A converted duplicate must never read as an item that was kept.',
    );
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

/**
 * What the key ring is holding, and whether you could tell one key from another.
 *
 * Three assertions, and each is a defect this screen actually had:
 *
 *   1. **The count is the one the state promises.** It used to be whatever the
 *      sweep had accumulated — 1 device at 390, 2 at 375, 3 at 360 — so three
 *      files with one name meant three different screens and a `--state=` run
 *      made a fourth. Both states build their own precondition now; this is what
 *      stops that quietly coming back.
 *   2. **Two devices are two different labels.** `deviceLabel` exists to answer
 *      *"is that my phone?"*, and three identical lines separated only by a date
 *      cannot. A capture of identical rows would have verified the list rendered
 *      and nothing about whether it is usable.
 *   3. **The destructive control appears exactly when it is real, and reads.**
 *      *"Change the locks everywhere"* is the one irreversible action on any
 *      manager-facing page, and it is the only red slab on a cream sheet — the
 *      combination that has produced two accessibility defects here before.
 *      Measured against its own ground rather than assumed.
 */
async function checkDevices(page: Page, width: number, state: string): Promise<void> {
  const expected = state === 'profile' ? 1 : state === 'profile-devices' ? 2 : null;
  if (expected === null) return;

  const seen = await page.evaluate(() => {
    const list = document.querySelector('[data-device-list]');
    const labels = [...document.querySelectorAll('[data-device-label]')].map((el) =>
      (el.textContent ?? '').trim(),
    );
    const button = document.querySelector('[data-sign-out-everywhere]');
    let ground = '';
    let node: Element | null = button;
    for (let depth = 0; depth < 12 && node !== null; depth++) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg !== '' && !bg.includes('rgba(0, 0, 0, 0)')) {
        ground = bg;
        break;
      }
      node = node.parentElement;
    }
    return {
      declared: list === null ? null : Number(list.getAttribute('data-device-list')),
      labels,
      hasButton: button !== null,
      colour: button === null ? '' : getComputedStyle(button).color,
      ground,
      text: button === null ? '' : (button.textContent ?? '').trim(),
    };
  });

  if (seen.declared !== expected) {
    fail(
      'devices',
      `@${String(width)} ${state} shows ${String(seen.declared)} device(s), not ${String(expected)}. ` +
        'The state builds its own precondition, so this is drift rather than a coincidence — ' +
        'a screen whose content depends on what ran before it has one filename and several meanings.',
    );
    return;
  }

  if (expected > 1 && new Set(seen.labels).size !== seen.labels.length) {
    fail(
      'devices',
      `@${String(width)} ${state} lists ${String(seen.labels.length)} devices under ` +
        `${String(new Set(seen.labels).size)} distinct name(s): ${seen.labels.join(', ')}. ` +
        'The label exists to answer "is that my phone?", and it cannot when two rows read alike.',
    );
  }

  // Present exactly when it means something. One key cannot be signed out of
  // "everywhere else", and offering it would be an irreversible control that
  // does nothing.
  const wanted = expected > 1;
  if (seen.hasButton !== wanted) {
    fail(
      'devices',
      `@${String(width)} ${state} ${seen.hasButton ? 'offers' : 'hides'} "change the locks ` +
        `everywhere" with ${String(expected)} device(s), which is backwards.`,
    );
    return;
  }

  if (!seen.hasButton) return;

  const fg = channels(seen.colour);
  const bg = channels(seen.ground);
  if (fg === null || bg === null) return;

  const ratio = contrast(fg, bg);
  if (ratio < AA_CONTRAST) {
    fail(
      'devices',
      `@${String(width)} ${state} "${seen.text}" is ${ratio.toFixed(2)}:1 against its own red ` +
        `ground, under the ${String(AA_CONTRAST)}:1 AA floor. This is the only irreversible ` +
        'control a manager can reach, so it is the last one that may be hard to read.',
    );
  }
}

/**
 * The character, and whether it is actually a character.
 *
 * ## What can go wrong here that a person cannot see
 *
 * A sprite at a fractional scale looks *nearly* right — every edge lands between
 * device pixels and the whole figure goes half a shade soft, which reads as "the
 * art is a bit muddy" rather than as a bug, and which is the exact defect
 * recorded against the clipboard on `/profile` and against the collectibles'
 * 1.4375x resample. So the scale is measured rather than looked at.
 *
 * ## And the one that shipped
 *
 * `character-saved` presses Save. Every character state before it opened the
 * route and photographed it, and **the route was never broken** — the crash was
 * in the action, which Next evaluates only when an action is invoked. A
 * screenshot of a form is not a test of the form.
 */
/**
 * Choose an option in the open category that is **not** the current one.
 *
 * A fixed index is a coin flip. A manager who has never saved gets a character
 * derived from their user id (`defaultCharacterFor`), so whether option 3 is
 * already selected depends on a hash of a uuid the seed regenerates — and
 * choosing what is already chosen leaves the form clean, which leaves Save
 * disabled, which fails as a twenty-second timeout on a button rather than as
 * "nothing changed".
 */
async function pickSomethingElse(page: Page, trait: string): Promise<void> {
  const option = page
    .locator(`[data-trait-options="${trait}"] button[aria-pressed="false"]`)
    .first();
  if ((await option.count()) === 0) {
    throw new Error(`every ${trait} option is already selected, which cannot be true`);
  }
  await option.click();
}

async function checkCharacter(page: Page, width: number, state: string): Promise<void> {
  if (!state.startsWith('character-')) return;

  const seen = await page.evaluate(() => {
    const view = document.querySelector('[data-character-view]');
    if (view === null) return null;

    const box = view.getBoundingClientRect();
    const svg = view.querySelector('svg');
    const drawn = [...(svg?.querySelectorAll('rect') ?? [])];
    const rects = drawn.length;
    const fills = new Set(drawn.map((el) => el.getAttribute('fill') ?? '')).size;
    const viewBox = svg?.getAttribute('viewBox') ?? '';

    const live = document.querySelector('[data-character-customiser] [aria-live="polite"]');

    // Every tappable control inside the customiser, with its rendered box.
    const controls = [...document.querySelectorAll('[data-character-customiser] button')].map(
      (el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, text: (el.textContent ?? '').trim() };
      },
    );

    return {
      w: box.width,
      h: box.height,
      left: box.left,
      right: box.right,
      rects,
      fills,
      viewBox,
      rendering: getComputedStyle(view).imageRendering,
      /*
       * `shape-rendering`, hyphenated — the attribute React emits from the
       * `shapeRendering` prop. The camel-case name reads back empty from the DOM,
       * and the first version of this gate asked for it and failed at all three
       * widths on a page that was rendering correctly.
       */
      shapeRendering: svg?.getAttribute('shape-rendering') ?? '',
      computedShapeRendering: svg === null ? '' : getComputedStyle(svg).shapeRendering,
      status: (live?.textContent ?? '').trim(),
      controls,
      views: document.querySelectorAll('[data-character-view]').length,
    };
  });

  if (seen === null) {
    fail('character', `@${String(width)} ${state} draws no character at all.`);
    return;
  }

  const canvas = `${String(CHARACTER_CANVAS.width)} x ${String(CHARACTER_CANVAS.height)}`;

  if (seen.viewBox !== `0 0 ${String(CHARACTER_CANVAS.width)} ${String(CHARACTER_CANVAS.height)}`) {
    fail(
      'character',
      `@${String(width)} ${state} draws on viewBox "${seen.viewBox}", not the ${canvas} canvas ` +
        'every layer is authored against. A layer resampled to fit is a layer authored wrong.',
    );
  }

  /*
   * The *same* factor in both directions, one of the four the component offers,
   * and a whole number of CSS pixels out of it.
   *
   * This used to demand a whole-number factor, which was the right rule for the
   * old `64 × 96` canvas and is the wrong one for `112 × 168`: at whole
   * multiples only, the smallest avatar the product could draw would be the full
   * canvas, which is a poster rather than a row. What the old rule was protecting
   * is that no edge lands between CSS pixels, and **that** is what is checked
   * here — both canvas dimensions are even, so every offered half-step still
   * lands on a whole pixel.
   *
   * A non-square factor stays forbidden. It is how a sprite ends up subtly
   * stretched, which nobody names and everybody sees.
   */
  const fx = seen.w / CHARACTER_CANVAS.width;
  const fy = seen.h / CHARACTER_CANVAS.height;
  const offered = new Set<number>(Object.values(CHARACTER_SCALES));

  if (fx !== fy || !offered.has(fx)) {
    fail(
      'character',
      `@${String(width)} ${state} draws the ${canvas} canvas at ${String(seen.w)} x ` +
        `${String(seen.h)} — ${fx.toFixed(3)}x by ${fy.toFixed(3)}x, which is not one of the ` +
        `offered scales (${[...offered].join(', ')}).`,
    );
  }

  if (!Number.isInteger(seen.w) || !Number.isInteger(seen.h)) {
    fail(
      'character',
      `@${String(width)} ${state} draws the character at ${seen.w.toFixed(3)} x ` +
        `${seen.h.toFixed(3)} CSS px. A fractional box puts every edge of the sprite between ` +
        'CSS pixels, which is the softening a fixed scale exists to prevent.',
    );
  }

  if (seen.rects < 200) {
    fail(
      'character',
      `@${String(width)} ${state} draws ${String(seen.rects)} rectangles, which is not a figure. ` +
        'An empty or nearly empty composite means a layer resolved to nothing.',
    );
  }

  /*
   * **The figure has tonal structure**, measured on what the browser was
   * actually given rather than on what the compositor believes it emitted.
   *
   * The regression this exists for shipped inside the sprite-quality pass and
   * survived every unit test in the character suite: one transposed index in the
   * shading pass sent every depth back as `1`, the edge test fired on every solid
   * pixel, and the whole figure rendered in its own outline colour. It is drawn,
   * it is in the canvas, it stands on the floor, every colour is legal — and it
   * is a silhouette. Counting distinct fills is what tells the two apart.
   *
   * Five ramps of three steps plus ink is the floor a default character clears
   * comfortably; the broken build produced four.
   */
  if (seen.fills < 8) {
    fail(
      'character',
      `@${String(width)} ${state} draws the whole figure in ${String(seen.fills)} colours. ` +
        'A character with no light and no shade is a silhouette — check that the shading pass ' +
        'is still producing light, base and shade rather than collapsing to outline.',
    );
  }

  /*
   * The attribute *and* what the browser resolved it to. The attribute alone is
   * satisfied by a value the renderer ignored; the computed value alone cannot
   * tell "crispEdges" from a default that happens to match on this engine.
   */
  if (seen.shapeRendering !== 'crispEdges' || seen.computedShapeRendering !== 'crispedges') {
    fail(
      'character',
      `@${String(width)} ${state} draws the sprite with shape-rendering="${seen.shapeRendering}" ` +
        `(computed ${seen.computedShapeRendering}). Anything but crispEdges antialiases a scaled ` +
        'rectangle into a grey seam.',
    );
  }

  if (seen.rendering !== 'pixelated') {
    fail(
      'character',
      `@${String(width)} ${state} sets image-rendering: ${seen.rendering} on the character.`,
    );
  }

  // Fully on screen, horizontally. A clipped character is the one thing this
  // whole screen exists to show.
  if (seen.left < 0 || seen.right > width) {
    fail(
      'character',
      `@${String(width)} ${state} clips the character: ${seen.left.toFixed(1)}..` +
        `${seen.right.toFixed(1)} against a ${String(width)}px viewport.`,
    );
  }

  /*
   * **Save actually saved.**
   *
   * The sentence rather than the absence of an error: a 500 replaces the whole
   * document, so "no error visible" is also true of a page that never submitted.
   */
  if (state === 'character-saved' && !/saved/i.test(seen.status)) {
    fail(
      'character',
      `@${String(width)} ${state} pressed Save and the screen says "${seen.status}". ` +
        'This is the state that exists because saving a character returned a server-side ' +
        'exception in production while every gate was green.',
    );
  }

  if (state === 'character-editing' && !/not saved/i.test(seen.status)) {
    fail(
      'character',
      `@${String(width)} ${state} changed a trait and the screen says "${seen.status}". ` +
        'A screen that can be in a state that is not stored has to say so.',
    );
  }

  /*
   * Tap targets, judged here rather than by `checkTargets` — that gate is about
   * the room's eight objects and their overlaps, and these are a scrolling strip
   * of chips whose only risk is being small.
   */
  const small = seen.controls.filter((control) => control.h < 44 || control.w < 44);
  if (small.length > 0) {
    fail(
      'character',
      `@${String(width)} ${state} has ${String(small.length)} control(s) under 44px: ` +
        small
          .slice(0, 4)
          .map((c) => `"${c.text}" ${c.w.toFixed(0)}x${c.h.toFixed(0)}`)
          .join(', '),
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

/* ------------------------------------------------- hydration attribution -- */

/**
 * What a hydration mismatch looks like, and where it actually happened.
 *
 * Visual debt 12 is one intermittent React `#418` that has now been filed under
 * **four** state names across **three** routes, and every one of those labels
 * was wrong in a different way. The state name was wrong because `capturing` is
 * set before the navigation. Reading `page.url()` in the Node-side console
 * handler was better and is still not right: a Playwright console event is
 * delivered over CDP and handled asynchronously, so under load the URL can
 * already be the *next* document by the time the handler runs. Both attributions
 * are guesses made outside the document that produced the error.
 *
 * This one is made **inside** it. `window` belongs to exactly one document, so a
 * pathname read synchronously in the page, at the moment the message is logged,
 * cannot name a different page than the one that logged it. There is no timing
 * under which it can be wrong.
 *
 * ## It reports rather than gates
 *
 * The Node-side listeners below are untouched and remain the gate — they catch
 * console errors the *browser* emits (a failed request, a CSP refusal) which
 * never pass through the page's own `console.error` and which an in-page hook
 * would silently stop failing on. This is additive evidence, not a replacement,
 * because a diagnostic that quietly narrows a gate is worse than no diagnostic.
 *
 * ## And it carries the evidence the next sighting needs
 *
 * `#418`'s first argument says `text` or `HTML` and nothing else, so the
 * production bundle names no element. What it can still record is the shape of
 * the document: how far loading had got, and whether any Suspense boundary was
 * still unresolved.
 *
 * ## The census is taken after the recovery, and that had to be measured
 *
 * The original note here claimed the census distinguishes *a component that
 * renders differently* from *a boundary spliced in mid-hydration*. **It does
 * not**, and visual debt 16's two sightings are what established it. Compared
 * against ordinary loads of the same routes:
 *
 *     a normal /                      body: div, div, script x10
 *     the sighting on /               body: script x10, div, div
 *
 * The scripts and the divs have swapped ends. That is not a partly-parsed
 * document — parsing is in order — it is the document **after** React discarded
 * the server's tree and re-rendered it: the RSC payload `<script>` tags are
 * server-only artifacts with no client counterpart so they stay put, and the
 * app's `div`s are re-created and appended after them. `#418`'s own text
 * promises exactly that (*"this tree will be regenerated on the client"*), and
 * `console.error` runs after the regeneration rather than before it.
 *
 * So `servedBody` and `servedHead` are taken at **`interactive`** — the moment
 * the parser finishes, before any recovery could have happened — and carried on
 * the sighting. One census is a photograph of the recovery; two is a diff, and a
 * diff is the thing that says *where* the tree changed. It still will not name an
 * element. Only a dev build does that.
 */
interface HydrationSighting {
  readonly path: string;
  readonly text: string;
  readonly readyState: string;
  readonly sinceNavigationMs: number;
  /** Suspense boundaries still pending, and the document's top-level shape. */
  readonly pending: number;
  readonly bodyChildren: string;
  readonly headChildren: string;
  /** The same two, at `interactive` — the parsed document, before any recovery. */
  readonly servedBody: string;
  readonly servedHead: string;
}

/** Messages worth capturing evidence for. Deliberately broad. */
const HYDRATION_SHAPED = /#4(18|19|2[0-5])|hydrat|did not match|server (?:rendered|HTML)/i;

/**
 * Installed into every document before any page script runs.
 *
 * Written as a string rather than a function so the whole thing is obviously
 * page-side: it closes over nothing from this file, and the binding it calls is
 * the only channel back.
 */
const HYDRATION_REPORTER = `(() => {
  const SHAPED = ${String(HYDRATION_SHAPED)};

  const census = () => {
    let pending = 0;
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) {
      // React marks an unresolved Suspense boundary '$?' and a suspended-again
      // one '$~'. A resolved boundary is a bare '$'.
      const data = walker.currentNode.data;
      if (data === '$?' || data === '$~' || data === '$!') pending += 1;
    }
    const names = (parent) =>
      Array.from(parent?.children ?? [])
        .map((el) => el.tagName.toLowerCase())
        .join(',')
        .slice(0, 400);
    return { pending, bodyChildren: names(document.body), headChildren: names(document.head) };
  };

  /*
   * The earliest shape this reporter managed to see.
   *
   * Named 'earliest' rather than 'served' on purpose: one of visual debt 16's
   * two sightings fired while readyState was still 'loading', so there is no
   * moment that is guaranteed to be both after the body exists and before React
   * could have touched it. What is recorded is the first non-empty census plus
   * **when it was taken**, and a reader compares that timestamp against the
   * error's. A sample taken after the error is not evidence and says so.
   *
   * Sampled from three places because each covers a different failure: a
   * MutationObserver catches the first node the parser appends, readystatechange
   * catches a document that was already complete, and the animation frame is the
   * backstop for a browser that fires neither in time.
   */
  let earliest = { bodyChildren: '', headChildren: '', atMs: -1 };
  // On \`document\`, not \`document.documentElement\` — this script runs before any
  // HTML is parsed, so the root element does not exist yet and \`observe\` throws
  // on null. \`document\` is always a Node and subtree covers everything under it.
  const watcher = new MutationObserver(() => { takeEarliest(); });
  const takeEarliest = () => {
    if (earliest.bodyChildren !== '') return;
    const { bodyChildren, headChildren } = census();
    if (bodyChildren === '') return;
    earliest = { bodyChildren, headChildren, atMs: Math.round(performance.now()) };
    /*
     * The instrument stops the moment it has its reading.
     *
     * A whole-document subtree observer left running fires on every node the
     * parser appends and every mutation React makes afterwards, for the life of
     * the page — in a harness whose other gates measure motion frame by frame.
     * The reading is taken once; the cost has to end with it.
     */
    watcher.disconnect();
    document.removeEventListener('readystatechange', takeEarliest);
  };
  watcher.observe(document, { childList: true, subtree: true });
  document.addEventListener('readystatechange', takeEarliest);
  takeEarliest();

  const report = (text) => {
    if (!SHAPED.test(text)) return;
    try {
      window.__qaHydration({
        path: location.pathname + location.search,
        text: text.slice(0, 500),
        readyState: document.readyState,
        sinceNavigationMs: Math.round(performance.now()),
        earliestBody: earliest.bodyChildren,
        earliestHead: earliest.headChildren,
        earliestAtMs: earliest.atMs,
        ...census(),
      });
    } catch {
      // The binding is gone with the document, or the page is being torn down.
      // Losing one report is better than throwing inside console.error.
    }
  };

  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    try {
      report(args.map((a) => String(a && a.message ? a.message : a)).join(' '));
    } catch {
      // As above: never let the diagnostic break the page it is watching.
    }
  };
  window.addEventListener('error', (event) => {
    try {
      report(String(event.message));
    } catch {
      /* as above */
    }
  });
})();`;

/** The sighting whose text matches a gate failure, if the page reported one. */
function sightingFor(text: string, sightings: HydrationSighting[]): HydrationSighting | undefined {
  if (!HYDRATION_SHAPED.test(text)) return undefined;
  // React logs the same message through both channels, so match on a prefix
  // rather than on equality — Playwright's console text and the page's own
  // stringification of the arguments are not character-identical.
  const head = text.slice(0, 60);
  return sightings.find((s) => s.text.startsWith(head) || text.startsWith(s.text.slice(0, 60)));
}

/* -------------------------------------------------------------------- main -- */

async function run(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--state='))?.split('=')[1];
  const states = only === undefined ? ALL_STATES : ALL_STATES.filter((s) => s === only);
  if (states.length === 0) throw new Error(`unknown --state=${String(only)}`);

  /*
   * Before a single pixel. Both of these have already cost a sweep, and both
   * failed in a way that looked like a product defect rather than a harness one
   * — see `scripts/harness.ts`, which is written against those two incidents.
   *
   * The database check comes first because it is the cheaper of the two and
   * because the sweep's *first* action is to shell out to the demo CLI, which
   * writes.
   */
  assertVisualDatabaseIsolated(process.env);
  await assertServerIsOurBuild(BASE);

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
       * Console errors, tagged with the state **and the route** that produced
       * them.
       *
       * They used to be collected into one bare list and reported as
       * `@375 <message>`. That is a true statement and an unusable one, so the
       * gate started recording where it was standing when the error arrived.
       *
       * ## The state name alone is not where the error came from
       *
       * `capturing` is set **before** the navigation, so an error thrown by the
       * *previous* page's late hydration lands under the *next* state's name.
       * That is not hypothetical: the intermittent React #418 in visual debt 12
       * has now been filed under three unrelated states — `slice-blowout` on
       * CI, `demo-collection-empty` on a sweep of unmodified `main`, and
       * `tray-owned-box` here — whose predecessors are three different routes
       * as well. Three names for one defect is a measurement problem, not three
       * defects.
       *
       * `page.url()` is read **at the moment the error arrives**, so it names
       * the document that was actually loaded. It is the one attribution the
       * state label cannot give, and it is visual debt 12's own recorded next
       * step: *"the next instance should be attributed by origin."*
       */
      const errors: { state: string; url: string; text: string }[] = [];
      let capturing = 'sign-in';
      const note = (text: string): void => {
        errors.push({ state: capturing, url: new URL(page.url()).pathname, text });
      };
      page.on('console', (m) => {
        if (m.type() === 'error') note(m.text());
      });
      page.on('pageerror', (e) => { note(e.message); });

      /*
       * The same errors, attributed from inside the document that produced them.
       * See `HYDRATION_REPORTER` — this adds evidence and gates nothing.
       */
      await ctx.exposeBinding('__qaHydration', (_source, sighting: HydrationSighting) => {
        sightings.push({ ...sighting, state: capturing, width });
      });
      await ctx.addInitScript(HYDRATION_REPORTER);

      /*
       * **Signed in lazily**, because three states need the opposite.
       *
       * This used to sign in unconditionally before the loop. The door states
       * are what an unauthenticated visitor sees, so a session is the one thing
       * they must not have — and `--state=door` on its own would otherwise have
       * signed in, redirected to the parlor, and photographed the room.
       */
      let signedIn = false;

      for (const state of states) {
        capturing = state;
        if (!SIGNED_OUT.has(state) && !signedIn) {
          await signIn(page);
          signedIn = true;
        }
        const demoKey = DEMO_BACKED[state];
        if (demoKey === undefined) await reach(page, state);
        else await reachDemo(page, state, demoKey);

        await page.waitForTimeout(300);
        /*
         * `caret: 'initial'` — **the instrument must not edit the page it is
         * measuring**, and until this line it did.
         *
         * Playwright's screenshot defaults to `caret: 'hide'`, and the way it
         * hides a text caret is to write `caret-color: transparent !important`
         * into the **inline style of every element** and then take it away
         * again. Measured directly, with a MutationObserver on one `<input>`:
         *
         *     default (caret: hide)  -> ["caret-color: transparent !important;", ""]
         *     caret: 'initial'       -> []
         *
         * If a capture lands while React is hydrating, React compares the DOM it
         * finds against the DOM the server sent, finds a `style` attribute
         * nobody rendered, and reports a mismatch. That is visual debt 12, and
         * it was never a defect in this product: a dev sweep named the element,
         * and it was `<input name="note">` with `style={{caret-color:
         * "transparent"}}` on a screen whose own code never sets a caret colour.
         *
         * It also explains the one thing about debt 12 that never made sense —
         * that **144 targeted document loads could not reproduce what a sweep
         * hit every 209 captures**. Those probes loaded pages; they did not
         * photograph them. The error needed the camera.
         *
         * The cost is that a *focused* text field may show its caret in a
         * screenshot. Nothing the driver focuses is a text field — `keyboard-focus`
         * focuses room objects — so in practice nothing changes, and a visible
         * caret would be the truth about a focused input anyway.
         */
        await page.screenshot({ ...CAPTURE, path: path.join(OUT, `${String(width)}-${state}.png`) });

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
        // The type floor is an everywhere gate for the same reason: the two
        // smallest things this product has ever rendered were on a door sign and
        // a showcase picker, neither of which is the homepage.
        await checkTypeFloor(page, width, state);
        // Everywhere, like the two above: a rarity word can appear on any
        // surface, and the defect this catches was on the one surface nobody
        // thought to check.
        await checkRarityContrast(page, width, state);
        // The key ring, on the two states that make a promise about it.
        await checkDevices(page, width, state);
        /*
         * Every `character-*` state, including the two that press a button.
         *
         * Everywhere rather than on one designed state, for the reason the
         * colour and type gates are: the character is drawn on `/profile` too,
         * and the crash this feature was rebuilt around was reachable from a
         * control every one of these screens carries.
         */
        await checkCharacter(page, width, state);
        /*
         * One transient at a time, everywhere — not just on the state built to
         * catch it. `MANDATE §6` is a property of the room rather than of a
         * screenshot, and the version of this defect that shipped was invisible
         * precisely because only the state designed around it was ever checked.
         */
        await checkOneTransient(page, width, state);
        /*
         * Everywhere, not only on `slice-*`. The Slice's paper is also rendered
         * on the review desk's "as it will print" preview, and that is a
         * different route with the same defect available to it.
         */
        await checkDeckWrap(page, width, state);
        if (state === 'keyboard-focus') await checkFocusVisible(page, width);

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
           * The timed passes. They navigate on their own — a first visit twice,
           * out to the counter and back — so they run last for their state and
           * leave the page on the homepage for the next one.
           */
          if (state === 'tony-steady') {
            await checkTonySteady(page, width);
            await checkGlowLeavesTonyAlone(page, width);
          }

          if (state === 'reduced-motion') await checkStillUnderReducedMotion(page, width);

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

          /*
           * The basement's own map, and whether the room matches the state's
           * name. The targets are judged on the two states where every object
           * is simultaneously live and nothing is over them.
           */
          if (state.startsWith('room')) {
            await checkRoom(page, width, state);
            if (state === 'room' || state === 'room-furnished') await checkTargets(page, width);
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

          // Every press-desk state must actually be that desk.
          if (state.startsWith('review-')) {
            await checkReviewDesk(page, width, state);
          }

          // Every office state must actually be the queue it claims to be.
          if (state === 'office' || state.startsWith('office-')) {
            await checkOfficeQueue(page, width, state);
          }

          // Every draft-board state must actually be that board.
          if (state.startsWith('draft-')) {
            await checkDraftBoard(page, width, state);
            // The board and the editor are both forms under a thumb.
            await checkTargets(page, width);
          }

          /*
           * Every draft-review issue must actually be one — whether it arrived
           * as a server-resolved preview or off the rack through the approval
           * chain.
           *
           * Named rather than prefixed, and the prefix is why: `slice-preseason`
           * is a **different** state that predates this one — the rack in the
           * weeks before the season, carrying nothing at all — and
           * `startsWith('slice-preseason')` swept it in and failed it for having
           * no draft board, which is exactly what an empty rack should not have.
           */
          if (PRESEASON_ISSUE_STATES.has(state)) {
            await checkPreseasonIssue(page, width, state);
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
        /*
         * Where the page says it happened beats where the harness thinks it was
         * standing. When the two disagree, both are printed: the disagreement is
         * itself the measurement this defect kept producing, and hiding it would
         * throw away the reason the in-page reporter exists.
         */
        const seen = sightingFor(e.text, sightings);
        const where =
          seen === undefined
            ? e.url
            : seen.path === e.url
              ? seen.path
              : `${seen.path} (the harness said ${e.url})`;
        const evidence =
          seen === undefined
            ? ''
            : ` [readyState=${seen.readyState}, ${String(seen.sinceNavigationMs)}ms in, ` +
              `${String(seen.pending)} pending Suspense boundar${seen.pending === 1 ? 'y' : 'ies'}]`;
        const detail = `@${String(width)} on ${where} during "${e.state}" — ${e.text}${evidence}`;

        /*
         * A known defect is counted rather than fired, and the count is still a
         * gate — see `visual-qa-quarantine.ts`. Anything that is not the exact
         * quarantined shape fails on sight, including the dev build's message,
         * which is the one that would finally name the element.
         */
        const known = quarantineFor(e.text);
        if (known === undefined) fail('console', detail);
        else quarantined.push({ debt: known.debt, why: known.why, detail });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  /*
   * The quarantine's ceiling, evaluated once the whole sweep is in.
   *
   * This is the half that keeps it a gate rather than a mute. A deterministic
   * structural mismatch fires on every capture of the state it affects — three
   * widths, so at least three — and clears a ceiling of two the first time it
   * appears. The background rate of visual debt 12 does not: five sweeps of one
   * build produced 2, 1, 1, 1 and 1.
   */
  if (quarantined.length > QUARANTINE_CEILING) {
    fail(
      'console',
      `${String(quarantined.length)} quarantined hydration errors in one sweep, ` +
        `which is over the ceiling of ${String(QUARANTINE_CEILING)} — this is no longer ` +
        `background noise. See scripts/visual-qa-quarantine.ts.`,
    );
    for (const q of quarantined) fail('console', q.detail);
  }

  const report = {
    base: BASE,
    widths: WIDTHS,
    states,
    failures,
    /*
     * Known-defect sightings that did not fail the run, kept in the artifact so
     * a tolerated error is still a recorded one. A quarantine nobody can count
     * afterwards is indistinguishable from a gate that was deleted.
     */
    quarantined,
    quarantineCeiling: QUARANTINE_CEILING,
    /*
     * Every hydration message the pages reported, whether or not it failed a
     * gate. The artifact is the only durable record of a defect that has never
     * reproduced on demand, so a run that saw one and recovered still says so.
     */
    hydration: sightings,
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

  /*
   * A tolerated error is still printed. The whole hazard of a quarantine is that
   * it becomes invisible and then permanent, so a green run that swallowed one
   * has to say so on the way past.
   */
  for (const q of quarantined) {
    console.warn(`  [quarantined · visual debt ${String(q.debt)}] ${q.detail}`);
  }
  if (quarantined.length > 0) {
    console.warn(
      `\n${String(quarantined.length)} known-defect error(s) tolerated, ceiling ${String(QUARANTINE_CEILING)}. ` +
        `${quarantined[0]?.why ?? ''}\n`,
    );
  }

  console.log(
    `Visual QA passed — ${String(states.length)} states x ${String(WIDTHS.length)} widths, artifacts in ${OUT}/`,
  );
}

try {
  await run();
} catch (error: unknown) {
  /*
   * A refusal is a message to a person, not a crash. Printing a stack above it
   * buries the one line that says what to do — and these two refusals exist
   * precisely because the previous failures were hard to read.
   */
  if (error instanceof HarnessRefusal) {
    console.error(`\nVisual QA refused to start.\n\n  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
