/**
 * Does Tony's *rendering* change when his glow ends?
 *
 * ## Why a pixel probe rather than another geometry sample
 *
 * `checkTonySteady` samples `getBoundingClientRect` on the sprite and on the
 * counter layer every animation frame. That is the right gate for the defect it
 * was built for — the entrance keyframe dropping him 62px behind the counter —
 * and it is **structurally incapable** of seeing the commissioner's new report.
 * A rect does not change when a rasterizer rounds differently.
 *
 * So this reads the glass. It photographs the sprite's own rectangle across the
 * moment `.showing-taps` is removed and compares the pixels **inside his alpha**,
 * where the glow never reaches. The halo lives outside his silhouette by
 * construction (`drop-shadow` on the overlay's own alpha), so any difference
 * inside it is the sprite itself being drawn differently.
 *
 *   npx tsx scripts/tony-glow-probe.mts            # 390, 375, 360
 *   npx tsx scripts/tony-glow-probe.mts --width=390
 *
 * Writes frames and a diff map to `visual-qa/glow-probe/`.
 */
import { mkdir, writeFile } from 'node:fs/promises';

import { chromium, type Page } from 'playwright';
import { demoPin } from '../lib/demo/seat.ts';

const BASE = process.env['VISUAL_QA_BASE'] ?? 'http://localhost:3111';
const OUT = 'visual-qa/glow-probe';
const PIN = process.env['VISUAL_QA_PIN'] ?? demoPin();

const widthArg = process.argv.find((a) => a.startsWith('--width='));
const WIDTHS = widthArg === undefined ? [390, 375, 360] : [Number(widthArg.split('=')[1])];

/**
 * The arrival's schedule, from `arrival.tsx`, duplicated on purpose — a probe
 * that imported them could not notice them moving.
 */
const REVEAL_AT = 1600;
const REVEAL_FOR = 3300;
/** `transition: filter 260ms ease-out` on `.tony-mark`. */
const RAMP = 260;

interface Shot {
  readonly label: string;
  readonly t: number;
  readonly revealed: boolean;
  readonly png: Buffer;
}

/**
 * Alex, through the front door.
 *
 * The same two fields and the same submit `visual-qa.mts` uses. The first visit
 * to a seat *claims* it, which asks for the PIN twice; every later visit signs
 * in, which asks once. Both are handled by filling `confirm` only when it is
 * there, which is what the driver does and why this is a copy of it rather than
 * a second opinion about the door.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/door`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Alex/ }).first().click();
  await page.waitForURL(/\/door\/[0-9a-f-]{36}/, { timeout: 20_000 });

  const door = page.url();
  const submit = async (): Promise<boolean> => {
    await page.fill('input[name="pin"]', PIN);
    if ((await page.locator('input[name="confirm"]').count()) > 0) {
      await page.fill('input[name="confirm"]', PIN);
    }
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
      return true;
    } catch {
      return false;
    }
  };

  if (await submit()) return;

  // Already claimed on an earlier run: the same form is now sign-in.
  await page.goto(door, { waitUntil: 'networkidle' });
  if (await submit()) return;

  throw new Error(`could not sign in at ${door}; stuck at ${page.url()}`);
}

/** The sprite's rectangle in viewport coordinates, plus the counter's top edge. */
async function geometry(page: Page): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
  counterTop: number;
} | null> {
  return page.evaluate(() => {
    const mark = document.querySelector('.tony-mark');
    const counter = document.querySelector('[data-room-layer="counter-front"]');
    if (mark === null || counter === null) return null;
    const drawn = mark.querySelector('img') ?? mark;
    const b = drawn.getBoundingClientRect();
    const c = counter.getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height, counterTop: c.top };
  });
}

async function run(width: number): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 3,
    // A phone. The rasterization question is about device pixels, so the ratio
    // is part of the measurement rather than a detail.
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await signIn(page);

  /*
   * The glow is **session-latched**, and getting that wrong makes the whole
   * probe measure nothing.
   *
   * `arrival.tsx` writes `PLAYED_KEY` into `sessionStorage` on the first
   * homepage of a session and returns early forever after, so a "returning
   * user" reload shows no reveal at all. Clearing the key is what puts the room
   * back into the state the commissioner is describing — and it is the same
   * latch `visual-qa.mts`'s own `FORGET_ARRIVAL` clears, for the same reason.
   */
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    try {
      window.sessionStorage.removeItem('tonys:arrived');
    } catch {
      /* private browsing */
    }
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  /*
   * Put Tony's line away before anything is measured.
   *
   * `.speaking .tony-mark` runs `tony-talks`, which steps him **one whole
   * pixel** on `steps(2, end)` for as long as the greeting is typing — and
   * `globals.css` is explicit that this one is deliberate and safe, because it
   * is two integer positions rather than a fraction between them.
   *
   * The first version of this probe left it running, and the fade window landed
   * inside it: every frame traced his edges at delta 225, which reads exactly
   * like a sprite shifting under a filter and is in fact a sprite doing the
   * thing it was designed to do. Measuring the glow means the glow has to be
   * the only thing moving.
   */
  const pad = page.getByRole('button', { name: /Dismiss what Tony said/i });
  if ((await pad.count()) > 0) await pad.click({ force: true });
  await page.waitForTimeout(400);

  const geo = await geometry(page);
  if (geo === null) throw new Error('the homepage has no .tony-mark or counter layer');

  /*
   * The clip is the sprite's own rectangle, widened by the glow's reach so the
   * halo is inside the photograph rather than cut off by it — the comparison
   * masks it out afterwards, and a mask needs something to mask.
   */
  const margin = 16;
  const clip = {
    x: Math.max(0, Math.floor(geo.x - margin)),
    y: Math.max(0, Math.floor(geo.y - margin)),
    width: Math.ceil(geo.width + margin * 2),
    height: Math.ceil(geo.height + margin * 2),
  };

  const shots: Shot[] = [];
  const shoot = async (label: string): Promise<void> => {
    const state = await page.evaluate(() => ({
      t: Math.round(performance.now()),
      revealed: document.querySelector('.showing-taps') !== null,
    }));
    shots.push({ label, ...state, png: await page.screenshot({ clip, caret: 'initial' }) });
  };

  /*
   * Anchored to the frame the glow is first seen in, never to a page time.
   *
   * `arrival.tsx` has two branches — entrance-then-reveal at 1600ms, and reveal
   * immediately at hydration when the room is stale or motion is reduced — and
   * every one of its timers starts from a `useEffect`. So the only reliable
   * anchor is the class itself. `REVEAL_AT` survives as the timeout bound.
   */
  await shoot('1-before-glow');

  await page.waitForSelector('.showing-taps', { timeout: REVEAL_AT + 4000 });
  const lit = (await page.evaluate('performance.now()')) as number;

  const waitUntilPageTime = async (target: number): Promise<void> => {
    const now = (await page.evaluate('performance.now()')) as number;
    if (target > now) await page.waitForTimeout(target - now);
  };

  await waitUntilPageTime(lit + RAMP + 200);
  await shoot('2-full-glow');

  /*
   * The fade itself, frame by frame, off the compositor.
   *
   * Five stills cannot answer *"inspect every frame around the moment the glow
   * disappears"* — the ramp is 260ms, which is about sixteen frames, and a
   * `page.screenshot()` loop samples maybe six of them. `Page.startScreencast`
   * is fed by the compositor, so it sees the frames the glass saw.
   *
   * Started **before** the glow ends and stopped well after, so the window
   * contains the last glowing frame, the whole ramp, the frame the class is
   * removed on, and the settled room.
   */
  const cdp = await page.context().newCDPSession(page);
  const cast: { data: string; t: number }[] = [];
  cdp.on('Page.screencastFrame', (frame) => {
    cast.push({ data: frame.data, t: frame.metadata.timestamp ?? 0 });
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
  });

  await waitUntilPageTime(lit + REVEAL_FOR - 400);
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await waitUntilPageTime(lit + REVEAL_FOR + RAMP + 400);
  await cdp.send('Page.stopScreencast');

  await waitUntilPageTime(lit + REVEAL_FOR + RAMP + 500);
  await shoot('5-stable-post-glow');

  await mkdir(`${OUT}/cast-${String(width)}`, { recursive: true });
  for (const [i, frame] of cast.entries()) {
    await writeFile(
      `${OUT}/cast-${String(width)}/${String(i).padStart(3, '0')}.png`,
      Buffer.from(frame.data, 'base64'),
    );
  }
  console.log(`  @${String(width)} ${String(cast.length)} screencast frames across the fade`);

  await mkdir(OUT, { recursive: true });
  for (const shot of shots) {
    await writeFile(`${OUT}/${String(width)}-${shot.label}.png`, shot.png);
  }

  const report = {
    width,
    deviceScaleFactor: 3,
    sprite: geo,
    clip,
    shots: shots.map(({ label, t, revealed }) => ({ label, t, revealed })),
  };
  await writeFile(`${OUT}/${String(width)}-report.json`, JSON.stringify(report, null, 2));

  console.log(`  @${String(width)} five frames written to ${OUT}`);
  for (const shot of shots) {
    console.log(`    ${shot.label.padEnd(22)} t=${String(shot.t).padStart(5)}ms  glow=${String(shot.revealed)}`);
  }

  await browser.close();
}

for (const width of WIDTHS) {
  await run(width);
}
