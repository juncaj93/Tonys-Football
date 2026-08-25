Warning: truncated output (original token count: 63352)
Total output lines: 5997

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
   * The all-play ledger, reached from the history wall.
   *
   * It has its own capture because the FRAUD ALERT stamp, three-column record
   * row, and explanatory disclaimer all have to remain readable on a phone.
   */
  | 'fraud-check'
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
  | 'underground'
  /** Both dedicated casino game scenes need their own captures. The room alone
   * cannot catch a generic-card regression in the actual games. */
  | 'underground-slots'
  | 'underground-blackjack'
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
     * depends on what ran before this in the sweep, and a h…43352 tokens truncated…n option in the open category that is **not** the current one.
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

          if (state === 'underground') await checkTargets(page, width);

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
