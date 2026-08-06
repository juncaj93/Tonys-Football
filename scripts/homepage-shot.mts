/**
 * The homepage, whole, at the three supported widths.
 *
 *   npx tsx scripts/homepage-shot.mts <outDir> [label] [route]
 *
 * The visual driver photographs states; this photographs the **composition**,
 * which is what the 2026-08-06 fidelity ruling asks to be judged: *"inspect the
 * homepage as one composition rather than only isolated asset crops."* A crop of
 * the ceiling cannot answer whether Tony belongs in the room he is standing in.
 *
 * Two captures per width, for the same reason the driver takes more than one:
 *
 *   - `<width>.png` — the room at device resolution, which is what a phone draws
 *   - `<width>-1to1.png` — the same frame at 1 CSS pixel per image pixel, which
 *     is what a reviewer's eye is actually at arm's length from
 *
 * It writes nothing to the database and reads nothing from it beyond signing in,
 * so it can be run against any local server, before and after a change, without
 * resetting anything.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env['VISUAL_QA_BASE'] ?? 'http://localhost:3111';
const PIN = process.env['VISUAL_QA_PIN'] ?? '461902';
const WIDTHS = [390, 375, 360];

const out = process.argv[2];
if (out === undefined) throw new Error('usage: homepage-shot.mts <outDir> [label]');
const label = process.argv[3] ?? '';
/*
 * The route, because a slice's evidence is of whatever surface it touched.
 *
 * Defaults to the homepage, which is what this was written for. `/timeline` was
 * the first caller to need anything else, and hard-coding `/` had quietly made
 * "capture the page at three widths" a homepage-only capability.
 */
const route = process.argv[4] ?? '/';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  ...(process.env['PLAYWRIGHT_CHROMIUM'] !== undefined
    ? { executablePath: process.env['PLAYWRIGHT_CHROMIUM'] }
    : {}),
  args: ['--no-sandbox'],
});

try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 780 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/door`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: /Alex/ }).first().click();
    await page.waitForURL(/\/door\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await page.fill('input[name="pin"]', PIN);
    if ((await page.locator('input[name="confirm"]').count()) > 0) {
      await page.fill('input[name="confirm"]', PIN);
    }
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 });

    /*
     * Long enough for the arrival to finish and the affordance reveal to come
     * and go. A homepage photographed mid-entrance is a picture of an animation,
     * not of the room, and the fidelity question is about the room.
     */
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    // Long enough for the homepage's arrival to finish. A static page is settled
    // far sooner and pays only the wait.
    await page.waitForTimeout(route === '/' ? 6000 : 800);

    const name = label === '' ? String(width) : `${String(width)}-${label}`;
    const file = path.join(out, `${name}.png`);
    // `caret: 'initial'` for the reason in `scripts/visual-qa-capture.ts`: the
    // instrument must not edit the page it is measuring.
    await page.screenshot({ path: file, caret: 'initial', fullPage: false });

    const meta = await sharp(file).metadata();
    await sharp(file)
      .resize(width, Math.round(((meta.height ?? 0) / (meta.width ?? 1)) * width), {
        kernel: 'lanczos3',
      })
      .png()
      .toFile(path.join(out, `${name}-1to1.png`));

    console.log(`${name}: ${String(meta.width)}x${String(meta.height)} device px`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
