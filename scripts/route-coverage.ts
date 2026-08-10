import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The routes this product serves, and which of them the visual gate reaches.
 *
 * Separate from its test so both halves are readable: the *rule* is in
 * `route-coverage.test.ts`, and this is the two mechanical questions it needs
 * answered — what routes exist, and what the driver visits.
 */

const APP = path.join(process.cwd(), 'app');

/** Every `page.tsx` under `app/`, as the path a browser would ask for. */
function collect(dir: string, prefix: string, into: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === 'page.tsx') into.push(prefix === '' ? '/' : prefix);
      continue;
    }
    /*
     * `api/` serves no pages and `actions/` serves no routes at all. Route
     * groups — `(name)` — and parallel segments do not appear in the URL, and
     * this product uses neither today; a directory shaped like one would be
     * silently mis-mapped, so it is left to fail loudly as an unphotographed
     * route rather than quietly stripped.
     */
    if (entry === 'api' || entry === 'actions') continue;
    collect(full, `${prefix}/${entry}`, into);
  }
}

function allRoutes(): readonly string[] {
  const found: string[] = [];
  collect(APP, '', found);
  return [...found].sort();
}

export const ROUTES: readonly string[] = allRoutes();

/**
 * Routes with no visual state, and the reason each one has none.
 *
 * The reason is the point. A route that lands here without one is the omission
 * this mechanism exists to catch, wearing the mechanism's own clothes.
 */
export const EXEMPT: Readonly<Record<string, string>> = {
  '/dev/assets': [
    'The asset registry contact sheet — a developer surface, not a place in the',
    'parlor. It is deliberately excluded from the product gates for the same',
    'reason it has no in-world entrance: nobody in the league can reach it, and',
    'holding it to the room’s typography would be holding a tool to a standard',
    'written for a pizza shop.',
  ].join(' '),
};

/**
 * Every route the driver navigates to, read out of its source.
 *
 * Read rather than imported, for the reason the three `driver-coverage` tests
 * give: the driver is an `.mts` script with top-level side effects, and a test
 * that imported it would run a sweep. It is the same trade — a regex over source
 * is cruder than a symbol, and it is the only version of this check that can
 * exist at all.
 *
 * Two shapes count as reaching a route, and both are real in the driver today:
 * an explicit `${BASE}/…` navigation, and a `DEMO_BACKED` state whose demo
 * declares a `route`. Dynamic segments are matched by their **shape** — the
 * driver navigates to a real UUID and the route table holds `[versionId]` — so a
 * literal comparison would report every dynamic route as uncovered.
 */
export function driverRoutes(source: string): ReadonlySet<string> {
  const seen = new Set<string>();

  for (const match of source.matchAll(/\$\{BASE\}(\/[A-Za-z0-9\-_/[\]${}.]*)/g)) {
    const raw = match[1] ?? '';
    // `${BASE}/counter/collection?rarity=…` and template holes both stop a path.
    const clean = raw.split('?')[0]!.replace(/\$\{[^}]*\}/g, '*').replace(/\/+$/, '');
    seen.add(clean === '' ? '/' : clean);
  }

  /*
   * `/door/<uuid>` and `/admin/slice/<uuid>` are reached by clicking a link and
   * asserted by `waitForURL`, so the URL never appears as a `${BASE}` literal.
   * The waits are the evidence, and they are read here rather than assumed.
   */
  for (const match of source.matchAll(/waitForURL\(\/\\\/([a-z-]+)\\\/\[/g)) {
    seen.add(`/${match[1]!}/*`);
  }
  if (/\/admin\\\/slice\\\/\[0-9a-f-\]/.test(source) || source.includes("'review-draft'")) {
    seen.add('/admin/slice/*');
  }
  /*
   * `/admin/slice/draft/<uuid>` is reached the same way — the driver opens a row
   * on the board rather than a URL it built, because the user id is a uuid it has
   * no business knowing. The wait on the editor's own marker is the evidence, and
   * it is read here rather than assumed.
   */
  if (source.includes("'draft-editor-blank'") && source.includes('data-draft-editor')) {
    seen.add('/admin/slice/draft/*');
  }

  // A dynamic segment in the route table matches a driver path that reached
  // *some* value for it. `/door/[userId]` is covered by `/door/*`.
  const expanded = new Set<string>();
  for (const route of seen) expanded.add(route);
  return {
    has: (route: string) => expanded.has(route.replace(/\[[^\]]+\]/g, '*')),
    // Exposed so a test can print what was found when it fails.
    get size() {
      return expanded.size;
    },
    [Symbol.iterator]: () => expanded[Symbol.iterator](),
    keys: () => expanded.keys(),
    values: () => expanded.values(),
    entries: () => expanded.entries(),
    forEach: (fn: (v: string, v2: string, set: ReadonlySet<string>) => void) => {
      expanded.forEach((v, v2) => {
        fn(v, v2, expanded);
      });
    },
  } as ReadonlySet<string>;
}

/** Convenience for a script or a failing message: the driver source. */
export function readDriver(): string {
  return readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');
}
