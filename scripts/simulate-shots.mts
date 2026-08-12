/**
 * Photograph the three simulated Slices, at the three phone widths.
 *
 *   npm run simulate:shots
 *   npm run simulate:shots -- week-8
 *
 * ## Why this is separate from `npm run visual:qa`
 *
 * **The sweep and the lab must not share a database, and it is not a
 * preference.** `scripts/visual-qa.mts` applies its states in sequence against
 * one database and loops widths on the outside, so a scenario that played
 * sixteen weeks of 2026 into it would leave sixteen closed weeks, forty-odd
 * rewards and a published issue behind — and every state photographed after it
 * would be photographed against a league that had been somewhere. That is not a
 * regression the gate would catch; it is a regression the gate would *become*.
 *
 * So the lab keeps its own database (`tonys_sim`), its own server and its own
 * output directory, and adds nothing to `ALL_STATES`.
 *
 * ## What it photographs
 *
 * `/slice` — the rack, holding the issue this scenario's cron drafted and a
 * named person approved and published. Not a preview parameter and not a
 * fixture: the real route, reading the real published version, signed in as a
 * real manager through the real door.
 *
 * ## It refuses a hosted database, and refuses the other two
 *
 * `tonys_dev` and `tonys_test` are the vitest suite's and `tonys_visual` is the
 * sweep's. Pointing this at any of them would be the *"two harnesses, one
 * database"* incident `scripts/harness.ts` was written about, from the third
 * direction.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';

import { assertServerIsOurBuild, databaseName } from './harness.js';

const WIDTHS = [390, 375, 360] as const;
const HEIGHT = 844;
const PORT = Number(process.env['SIM_SHOTS_PORT'] ?? 3122);
const BASE = `http://127.0.0.1:${String(PORT)}`;
const OUT = process.env['SIM_SHOTS_OUT'] ?? path.join('docs', 'evidence', 'slice-simulation');
const PIN = '424242';

/**
 * Where the photograph pass's own reports go — deliberately not the evidence
 * directory. They are written by a `--no-retrospective` run and would otherwise
 * overwrite the fuller ones `npm run simulate -- all` produces.
 */
const SCRATCH = path.join('.simulate-shots');

const SCENARIOS = ['preseason', 'week-4', 'week-8', 'week-16'] as const;
type Scenario = (typeof SCENARIOS)[number];

/** Databases this must never touch. See the header. */
const RESERVED = new Set(['tonys_dev', 'tonys_test', 'tonys_visual']);

function assertDatabase(url: string): void {
  if (/neon\.tech|vercel|supabase|amazonaws|\.cloud/.test(url)) {
    throw new Error(`REFUSED: DATABASE_URL looks hosted (${url}). This truncates every table.`);
  }
  const name = databaseName(url);
  if (name === undefined) throw new Error(`REFUSED: cannot read a database name out of ${url}`);
  if (RESERVED.has(name)) {
    throw new Error(
      `REFUSED: ${name} belongs to another harness. The simulation lab uses its own ` +
        'database so a sixteen-week season cannot leak into the visual sweep. ' +
        'Try DB_NAME=tonys_sim bash scripts/dev-db.sh reset.',
    );
  }
}

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv): void {
  execFileSync(command, [...args], { stdio: 'inherit', env });
}

/**
 * Wait for a server, and then prove it is **ours**.
 *
 * ## Readiness is not identity, and this script learned that the hard way
 *
 * The first version returned as soon as `/door` answered at all. An orphaned
 * `next-server` from the previous scenario was still holding the port, the
 * replacement died on `EADDRINUSE`, the probe got its 200 from the **old
 * build**, and three scenarios were photographed against stale code and filed
 * under the new one. The screenshots looked completely plausible; only a string
 * that had changed in the same session gave it away.
 *
 * `scripts/harness.ts` documents that exact incident from the visual sweep and
 * exports the check for it, so this calls the check rather than repeating the
 * mistake in a second place: it fetches an asset whose URL contains **this
 * tree's** `BUILD_ID`, which a stale server answers 404 for while still
 * answering 200 on every page.
 */
async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/door`, { redirect: 'manual' });
      if (response.status > 0) {
        await assertServerIsOurBuild(BASE);
        return;
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`the server never answered on ${BASE}`);
}

/**
 * Stop a server, and everything it started.
 *
 * `npx next start` is a wrapper: the process that actually holds the port is a
 * grandchild called `next-server`. Signalling the wrapper leaves that
 * grandchild running, which is how the port came to be occupied by a previous
 * scenario's build. So the whole **process group** is signalled, which is what
 * `detached: true` on the spawn exists to make possible, and the port is then
 * waited on until it is genuinely free.
 */
async function stopServer(server: ChildProcess | null): Promise<void> {
  if (server?.pid === undefined) return;

  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${BASE}/door`, { redirect: 'manual', signal: AbortSignal.timeout(1000) });
    } catch {
      return; // Nothing answering: the port is free.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `a server is still holding ${BASE} after SIGTERM. Photographing now would ` +
      'capture the previous scenario\'s build.',
  );
}

/** Sign in as Alex, through the real door. Found by name — uuids move on reseed. */
async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/door`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Alex/ }).first().click();
  await page.waitForURL(/\/door\/[0-9a-f-]{36}/, { timeout: 20_000 });

  await page.fill('input[name="pin"]', PIN);
  const confirm = page.locator('input[name="confirm"]');
  if ((await confirm.count()) > 0) await confirm.fill(PIN);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/door'), { timeout: 20_000 });
}

interface Shot {
  readonly width: number;
  /** The whole issue, top to bottom. */
  readonly full: string;
  /** What the phone shows before anybody scrolls. */
  readonly fold: string;
  /** How tall the page is, in CSS pixels. Screens of scrolling, in one number. */
  readonly pageHeight: number;
  /** The preseason board with one manager's review open. Absent on a weekly issue. */
  readonly opened?: { readonly file: string; readonly pageHeight: number };
}

async function photograph(browser: Browser, scenario: Scenario): Promise<readonly Shot[]> {
  const written: Shot[] = [];

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: HEIGHT },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();
    await signIn(page);
    await page.goto(`${BASE}/slice`, { waitUntil: 'networkidle' });

    /*
     * The paper has to actually be on the rack. A screenshot of an empty rack
     * filed under a scenario's name is the false green this repository has paid
     * for twice — so it is asserted here rather than left to whoever looks.
     */
    const paper = page.locator('[data-slice-paper]');
    if ((await paper.count()) === 0) {
      throw new Error(`${scenario} at ${String(width)}: the rack rendered no paper`);
    }

    mkdirSync(OUT, { recursive: true });

    /*
     * Two photographs, and the second one is the honest one.
     *
     * A full-page capture of a ten-section draft review is eight thousand CSS
     * pixels tall, which renders as a thumbnail nobody can read and hides the
     * only question a phone actually asks: **what is on the screen before
     * anybody scrolls.** So the fold is captured at real size beside it, and the
     * height is recorded as a number rather than left to be inferred from an
     * image's aspect ratio.
     */
    const full = path.join(OUT, `${scenario}-slice-${String(width)}.png`);
    await page.screenshot({ path: full, fullPage: true });

    const fold = path.join(OUT, `${scenario}-slice-${String(width)}-fold.png`);
    await page.screenshot({ path: fold, fullPage: false });

    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    /*
     * The preseason board opened, which is the feature rather than a variant.
     *
     * *"Streamline the issue, and let each owner read their detailed one"* is
     * two states, and a photograph of only the collapsed one shows the half that
     * is easy. The first row is opened through the element's own disclosure —
     * no script of ours toggles anything — and the height is recorded again, so
     * *"what does it cost to open one"* is a number.
     */
    let opened: Shot['opened'];
    const rows = page.locator('details[data-preseason-team]');
    if ((await rows.count()) > 0) {
      await rows.first().locator('summary').click();
      await page.waitForTimeout(150);

      const file = path.join(OUT, `${scenario}-slice-${String(width)}-open.png`);
      await page.screenshot({ path: file, fullPage: true });
      opened = {
        file,
        pageHeight: await page.evaluate(() => document.documentElement.scrollHeight),
      };
    }

    written.push({ width, full, fold, pageHeight, ...(opened === undefined ? {} : { opened }) });

    await context.close();
  }

  return written;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const only = SCENARIOS.find((key) => args.includes(key));
  const wanted = only === undefined ? SCENARIOS : [only];

  const url = process.env['DATABASE_URL'] ?? '';
  if (url === '') throw new Error('DATABASE_URL must be set.');
  assertDatabase(url);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DEMO_PIN: PIN,
    PORT: String(PORT),
    NEXT_TELEMETRY_DISABLED: '1',
  };

  console.log('Building once — every scenario is photographed against the same build.');
  run('npm', ['run', 'build'], env);

  /*
   * An explicit binary, when the environment has one Playwright did not install.
   *
   * `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` environments ship a Chromium at a fixed
   * path whose build number will not match whatever `@playwright/test` was
   * pinned to. Falling back to the default launch when the variable is unset
   * keeps CI and a normal laptop untouched.
   */
  const executablePath = process.env['SIM_SHOTS_CHROMIUM'];
  const browser = await chromium.launch(
    executablePath === undefined || executablePath === '' ? {} : { executablePath },
  );
  const manifest: { scenario: string; shots: readonly Shot[] }[] = [];

  let server: ChildProcess | null = null;
  try {
    for (const scenario of wanted) {
      console.log(`\n${scenario}`);
      /*
       * `--no-retrospective`, and it is load-bearing rather than a speed-up.
       *
       * Week 16's record plays the season out to the final so the report can
       * show what became sayable a week later. That moves `currentWeekOf` on,
       * and the stakes band under the paper reads it — so a photograph taken
       * afterwards showed week 16's issue beside **week 18's** call. The shot
       * has to stop where the Tuesday morning stops.
       *
       * The reports are written by `npm run simulate -- all`, which does run it.
       */
      run(
        'npx',
        ['tsx', 'scripts/simulate.ts', scenario, '--no-retrospective', '--out', SCRATCH],
        env,
      );

      /*
       * The server is restarted per scenario rather than kept alive, because
       * `resetDatabase` truncates underneath it and Next caches nothing that
       * survives a restart. Cheaper to be sure than to explain a stale render.
       */
      server = spawn('npx', ['next', 'start', '--port', String(PORT)], {
        env,
        stdio: 'ignore',
        // Its own process group, so `stopServer` can signal the `next-server`
        // grandchild that actually holds the port.
        detached: true,
      });
      await waitForServer();

      const shots = await photograph(browser, scenario);
      manifest.push({ scenario, shots });
      for (const shot of shots) {
        console.log(
          `  ${String(shot.width)}px · page ${String(shot.pageHeight)}px · ` +
            `${String(Math.round((shot.pageHeight / HEIGHT) * 10) / 10)} screens` +
            (shot.opened === undefined
              ? ''
              : ` · one open ${String(shot.opened.pageHeight)}px`),
        );
      }

      await stopServer(server);
      server = null;
    }
  } finally {
    await stopServer(server).catch(() => undefined);
    await browser.close();
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    path.join(OUT, 'shots.json'),
    `${JSON.stringify({ widths: WIDTHS, route: '/slice', scenarios: manifest }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\nWrote ${path.join(OUT, 'shots.json')}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
