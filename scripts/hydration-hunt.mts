/**
 * Visual debt 16 — capture a real sighting, in a build that names the element.
 *
 * ## Why this exists rather than another production sweep
 *
 * The production bundle logs `Minified React error #418; …args[]=HTML`. That
 * says *a structural mismatch happened* and nothing whatever about where. The
 * visual driver's census cannot close the gap either: it is taken when
 * `console.error` fires, which is **after** React has discarded the server tree
 * and re-rendered it, so it photographs the recovery rather than the fault.
 *
 * A **development** build prints the un-minified message, the offending element,
 * and a server-versus-client diff. That sighting has never been had, and it is
 * the entire remaining route to a cause. So this drives `next dev`.
 *
 * It became worth building when the defect was shown to reproduce **locally** —
 * two sightings in one 267-capture sweep on a healthy server. Before that it was
 * believed to need a hosted runner, which put a dev-mode hunt out of reach.
 *
 * ## What it refuses to count
 *
 * Every navigation's status is asserted. An earlier attempt at this measurement
 * produced fourteen "sightings" that were all worthless: a concurrent build had
 * rewritten `.next` under the running server, every response was a 500, and
 * Next.js's own error page hydrates with a mismatch. **A harness that cannot
 * tell a defect from its own wreckage is worse than no harness.**
 *
 * For the same reason: never run a build, another server, or another sweep while
 * this is running. It is the only thing that should be touching the app.
 *
 * ## What it preserves at every sighting
 *
 * Route, viewport, wall-clock, the full console payload with every argument, the
 * element React named, the **served** DOM census taken at `interactive` (before
 * any recovery), the **recovered** census taken when the error fired, the raw
 * server HTML fetched with the same session, and a screenshot. One JSON file per
 * sighting, written as it happens, so a long run can be read while it is still
 * going.
 *
 * Usage — the wrapper resets and seeds the database first:
 *   bash scripts/hydration-hunt.sh <iterations>
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { now } from '../lib/clock.ts';

const BASE = process.env['HUNT_BASE'] ?? 'http://localhost:3222';
const OUT = process.env['HUNT_OUT'] ?? 'hydration-hunt';
const ITERATIONS = Number(process.env['HUNT_ITERATIONS'] ?? '40');
const WIDTHS = [390, 375, 360];

/**
 * Routes the defect has actually been seen on, plus the rest of the room's
 * ordinary reach. Every one of these is a cold document — a client-side
 * navigation never hydrates, so it could not produce this error.
 */
const ROUTES = ['/', '/timeline', '/slice', '/counter', '/back-hall'];

/** Anything hydration-shaped. Deliberately broad; the dev message is the prize. */
const SHAPED =
  /#4(18|19|2[0-5])|hydrat|did not match|didn't match|server (?:rendered|HTML)|tree will be regenerated/i;

interface Census {
  readonly body: string;
  readonly head: string;
  readonly atMs: number;
  readonly readyState: string;
}

interface Sighting {
  readonly route: string;
  readonly width: number;
  readonly iteration: number;
  readonly wallClock: string;
  readonly text: string;
  readonly args: string[];
  readonly served: Census;
  readonly recovered: Census;
}

/**
 * Installed before any page script runs.
 *
 * A string rather than a function so it is obviously page-side: it closes over
 * nothing from this module and the exposed binding is its only channel back.
 */
const REPORTER = `(() => {
  const shape = (node) => node
    ? Array.from(node.children).map((c) => {
        const id = c.id ? '#' + c.id : '';
        const cls = typeof c.className === 'string' && c.className ? '.' + c.className.trim().split(/\\s+/)[0] : '';
        return c.tagName.toLowerCase() + id + cls;
      }).join(',')
    : '';

  let served = null;
  const takeServed = () => {
    if (served !== null) return;
    if (document.readyState === 'loading') return;
    served = {
      body: shape(document.body),
      head: shape(document.head),
      atMs: Math.round(performance.now()),
      readyState: document.readyState,
    };
  };
  document.addEventListener('readystatechange', takeServed);
  takeServed();

  const SHAPED = ${String(SHAPED)};
  const original = console.error.bind(console);
  console.error = (...args) => {
    try {
      const text = args.map((a) => (a && a.message) ? a.message : String(a)).join(' ');
      if (SHAPED.test(text) && window.__hydrationSighting) {
        window.__hydrationSighting({
          text,
          args: args.map((a) => {
            if (a && a.stack) return String(a.stack);
            if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
            return String(a);
          }),
          served: served ?? { body: '', head: '', atMs: -1, readyState: 'unknown' },
          recovered: {
            body: shape(document.body),
            head: shape(document.head),
            atMs: Math.round(performance.now()),
            readyState: document.readyState,
          },
        });
      }
    } catch { /* a diagnostic must never break the page it watches */ }
    original(...args);
  };
})()`;

const sightings: Sighting[] = [];

/** The element React named, dug out of the dev build's message. */
function namedElement(text: string): string {
  const tag = /<([a-zA-Z][\w-]*)(\s[^>]*)?>/.exec(text);
  return tag?.[0] ?? '(none named)';
}

async function main(): Promise<void> {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const executablePath = process.env['PLAYWRIGHT_CHROMIUM'];
  const browser: Browser = await chromium.launch({
    ...(existsSync(executablePath ?? '') ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });

  let captures = 0;
  let pending: Omit<Sighting, 'route' | 'width' | 'iteration' | 'wallClock'> | null = null;

  for (const width of WIDTHS) {
    const ctx: BrowserContext = await browser.newContext({
      viewport: { width, height: 664 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    await ctx.exposeBinding(
      '__hydrationSighting',
      (_source, s: Omit<Sighting, 'route' | 'width' | 'iteration' | 'wallClock'>) => {
        pending = s;
      },
    );
    await ctx.addInitScript(REPORTER);

    await signIn(ctx);

    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      for (const route of ROUTES) {
        pending = null;
        const page = await ctx.newPage();

        const response = await page.goto(`${BASE}${route}`, {
          waitUntil: 'load',
          timeout: 120_000,
        });
        const status = response?.status() ?? 0;
        if (status !== 200) {
          process.stdout.write(`\nABORT — ${route} answered ${String(status)}, not 200.\n`);
          await page.close();
          await ctx.close();
          await browser.close();
          process.exit(3);
        }

        // Hydration continues past `load`; dev compiles on first hit of a route.
        await page.waitForTimeout(3_500);
        captures += 1;

        if (pending !== null) await preserve(ctx, page, pending, route, width, iteration);
        await page.close();
      }
      process.stdout.write(
        `w${String(width)} iter ${String(iteration)}/${String(ITERATIONS)} — ` +
          `${String(captures)} captures, ${String(sightings.length)} sighting(s)\n`,
      );
    }
    await ctx.close();
  }

  await browser.close();
  writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ captures, sightings }, null, 2));
  process.stdout.write(
    `\n=== ${String(captures)} dev captures, ${String(sightings.length)} sighting(s) ===\n`,
  );
  process.exit(sightings.length > 0 ? 2 : 0);
}

/** Claim a manager and set a PIN, so every route below is reachable. */
async function signIn(ctx: BrowserContext): Promise<void> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/door`, { waitUntil: 'load', timeout: 120_000 });
  const first = page.locator('a[href^="/door/"]').first();
  if ((await first.count()) > 0) {
    await first.click();
    await page.waitForLoadState('load');
    const pin = page.locator('input[name="pin"]').first();
    if ((await pin.count()) > 0) {
      await pin.fill('123456');
      const confirm = page.locator('input[name="confirm"]').first();
      if ((await confirm.count()) > 0) await confirm.fill('123456');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(2_500);
    }
  }
  await page.close();
}

/** Everything the ruling asks be preserved, written before the page is closed. */
async function preserve(
  ctx: BrowserContext,
  page: Page,
  found: Omit<Sighting, 'route' | 'width' | 'iteration' | 'wallClock'>,
  route: string,
  width: number,
  iteration: number,
): Promise<void> {
  /*
   * The product's injected clock, not a raw `new Date()`. Nothing here replays a
   * season, but there is exactly one sanctioned read of the wall clock in this
   * repository and a diagnostic is not a reason to open a second.
   */
  const wallClock = now().toISOString();
  const record: Sighting = { ...found, route, width, iteration, wallClock };
  sightings.push(record);

  const slug = `${String(sightings.length).padStart(3, '0')}-w${String(width)}-${route.replace(/\W+/g, '_')}`;

  // The raw server render, fetched with the same session — the other half of the
  // diff, and the only copy of what the server actually sent.
  let serverHtml = '';
  try {
    const res = await ctx.request.get(`${BASE}${route}`);
    serverHtml = await res.text();
  } catch (error) {
    serverHtml = `(fetch failed: ${String(error)})`;
  }

  writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(record, null, 2));
  writeFileSync(path.join(OUT, `${slug}.server.html`), serverHtml);
  writeFileSync(path.join(OUT, `${slug}.client.html`), await page.content());
  await page.screenshot({ path: path.join(OUT, `${slug}.png`), caret: 'initial' }).catch(() => {});

  process.stdout.write(
    `\nSIGHTING ${slug}\n` +
      `  element : ${namedElement(record.text)}\n` +
      `  at      : ${String(record.recovered.atMs)}ms (${record.recovered.readyState})\n` +
      `  served  : ${record.served.body}\n` +
      `  recovered: ${record.recovered.body}\n` +
      `  ${record.text.slice(0, 400)}\n\n`,
  );
}

await main();
