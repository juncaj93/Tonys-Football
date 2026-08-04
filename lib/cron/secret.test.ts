import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { cronAuthorized, cronJson, cronNotFound } from './secret';

/**
 * The door, and the schedule behind it.
 *
 * Two things are asserted here that nothing else in the build can assert, and
 * both of them are architecture rather than behaviour:
 *
 * 1. **`CRON_SECRET` unset leaves every scheduled route inert.** Not "runs
 *    unprotected in development" — a job that quietly works without its secret
 *    is a job whose missing secret nobody notices until it has closed a week it
 *    should not have.
 * 2. **There are exactly two crons, and there is no third.** `16 §4.3` allows
 *    two and now spends both. A third entry is an architecture change, and it
 *    should have to delete a test that says so.
 *
 * `docs/SUNDAY_SNAPSHOT_BOUNDARY.md §3` and `§7` are the prose; this is the
 * enforcement.
 */

const ROOT = process.cwd();

function request(header?: string): Request {
  return new Request('https://example.test/api/cron/sunday', {
    headers: header === undefined ? {} : { authorization: header },
  });
}

const env = (secret?: string): NodeJS.ProcessEnv =>
  (secret === undefined ? {} : { CRON_SECRET: secret }) as NodeJS.ProcessEnv;

describe('the shared cron door', () => {
  const SECRET = 'a-long-enough-shared-secret-value';

  it('refuses everything when the secret is unset', () => {
    /*
     * **The guarantee the commissioner asked for by name.** Until `CRON_SECRET`
     * exists in Vercel production, both jobs are scheduled and inert — the
     * scheduler's own request is refused along with everybody else's.
     */
    expect(cronAuthorized(request(`Bearer ${SECRET}`), env())).toBe(false);
    expect(cronAuthorized(request(), env())).toBe(false);
    // An empty string is unset, not a secret that happens to be empty.
    expect(cronAuthorized(request('Bearer '), env(''))).toBe(false);
  });

  it('admits the scheduler when the secret matches', () => {
    expect(cronAuthorized(request(`Bearer ${SECRET}`), env(SECRET))).toBe(true);
  });

  it('refuses a wrong secret, a wrong scheme and a prefix of the right one', () => {
    expect(cronAuthorized(request(`Bearer ${SECRET}x`), env(SECRET))).toBe(false);
    expect(cronAuthorized(request(`Bearer ${SECRET.slice(0, -1)}`), env(SECRET))).toBe(false);
    expect(cronAuthorized(request(`Basic ${SECRET}`), env(SECRET))).toBe(false);
    expect(cronAuthorized(request(SECRET), env(SECRET))).toBe(false);
  });

  it('says nothing at all to an unauthorized caller', () => {
    /*
     * 404 rather than 401, the same reasoning as `requireAdmin()`: a 401
     * confirms the route exists and is worth attacking.
     */
    expect(cronNotFound().status).toBe(404);
  });

  it('never lets a job response be cached', () => {
    // A cached cron response is a job that appears to run and does not.
    const response = cronJson({ ran: true }, 200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});

/** `55 4 * * 1` → `{ minute: 55, hour: 4, dow: 1 }`. */
function parse(schedule: string): { minute: number; hour: number; dow: string } {
  const [minute, hour, , , dow] = schedule.split(' ');
  return { minute: Number(minute), hour: Number(hour), dow: dow ?? '' };
}

/**
 * Where a UTC cron hour lands in the league's own day.
 *
 * Vercel runs crons in UTC (`docs/DEPLOYMENT.md`); the league's day is Eastern
 * (`lib/parlor/season.ts`). EDT is UTC−4 and EST is UTC−5, and the NFL season
 * crosses the change in November — so every schedule has two local times and
 * both of them have to be acceptable.
 */
function eastern(hour: number, minute: number, offset: 4 | 5): { dayShift: number; hour: number } {
  const shifted = hour - offset;
  return shifted < 0
    ? { dayShift: -1, hour: shifted + 24 }
    : { dayShift: 0, hour: shifted };
}

describe('the schedule', () => {
  const config = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
    crons?: readonly { path: string; schedule: string }[];
  };
  const crons = config.crons ?? [];

  it('declares exactly two jobs, and there is no third', () => {
    /*
     * `16 §4.3`: two cron jobs, no more. Both now exist, so the next person to
     * add one has to delete this line — which is the point of it.
     */
    expect(crons).toHaveLength(2);
    expect(crons.map((cron) => cron.path).sort()).toEqual([
      '/api/cron/sunday',
      '/api/cron/tuesday',
    ]);
  });

  it('points every job at a route that exists', () => {
    /*
     * The reason the Sunday entry was deliberately absent until this session: a
     * cron pointed at a route that does not exist is a scheduled 404 — an error
     * every week that means nothing, which is worse than no job at all.
     */
    for (const cron of crons) {
      const route = path.join(ROOT, 'app', ...cron.path.split('/').filter(Boolean), 'route.ts');
      expect(existsSync(route), `${cron.path} has no route.ts`).toBe(true);
    }
  });

  it('takes the Sunday photograph after Sunday night football, in both offsets', () => {
    /*
     * **The one real decision in this slice.** `16 §4.3` asks for *"Sunday
     * ~11:55pm ET"*. A single UTC schedule cannot be that all season.
     *
     * `55 4 * * 1` is Monday 00:55 ET on EDT and Sunday 23:55 ET on EST. Both
     * are after the Sunday night game ends (~11:30pm ET) and before any Monday
     * game starts. The obvious `55 3 * * 1` is **10:55pm ET during EST — inside
     * the Sunday night game** for half the season, which would photograph a
     * week mid-flight and produce comeback claims that include Sunday scoring
     * still to come.
     */
    const sunday = crons.find((cron) => cron.path === '/api/cron/sunday');
    expect(sunday?.schedule).toBe('55 4 * * 1');

    const { minute, hour, dow } = parse(sunday!.schedule);
    // Monday, in UTC. The Eastern day is Sunday for half the season.
    expect(dow).toBe('1');

    const edt = eastern(hour, minute, 4);
    const est = eastern(hour, minute, 5);

    // EDT: still Monday locally, and in the small hours — after the late game.
    expect(edt).toEqual({ dayShift: 0, hour: 0 });
    // EST: Sunday locally, at 23:55 — `16 §4.3`'s stated time exactly.
    expect(est).toEqual({ dayShift: -1, hour: 23 });

    // The rule both of those satisfy, stated once: never before 23:00 Sunday ET
    // and never after 06:00 Monday ET.
    for (const local of [edt, est]) {
      const minutesIntoMondayEt = local.dayShift * 24 * 60 + local.hour * 60 + minute;
      expect(minutesIntoMondayEt).toBeGreaterThanOrEqual(-60);
      expect(minutesIntoMondayEt).toBeLessThan(6 * 60);
    }
  });

  it('closes the week on Tuesday morning, before the shop opens', () => {
    const tuesday = crons.find((cron) => cron.path === '/api/cron/tuesday');
    expect(tuesday?.schedule).toBe('0 9 * * 2');

    const { hour, dow } = parse(tuesday!.schedule);
    expect(dow).toBe('2');
    // 5am ET on EDT, 4am on EST. `16 §4.3` asks for ~5am; an hour either side is
    // before anybody is awake, which is why this one did not need a decision.
    expect(eastern(hour, 0, 4).hour).toBe(5);
    expect(eastern(hour, 0, 5).hour).toBe(4);
  });
});

describe('both doors are the same door', () => {
  const routes = ['sunday', 'tuesday'].map((day) => ({
    day,
    source: readFileSync(path.join(ROOT, 'app', 'api', 'cron', day, 'route.ts'), 'utf8'),
  }));

  it('guards every scheduled route with the shared check', () => {
    for (const route of routes) {
      expect(route.source, `${route.day} does not import the shared door`).toContain(
        "from '@/lib/cron/secret'",
      );
      expect(route.source, `${route.day} does not call it`).toContain(
        'if (!cronAuthorized(request, process.env)) return cronNotFound();',
      );
    }
  });

  it('refuses before it reaches the database', () => {
    /*
     * The guard is the first statement of the handler, not somewhere inside it.
     * A route that opens a connection and then decides whether it was allowed to
     * is a route one refactor away from doing the work first.
     */
    for (const route of routes) {
      const guard = route.source.indexOf('cronAuthorized');
      const db = route.source.indexOf('getDb()');
      expect(guard, `${route.day} has no guard`).toBeGreaterThan(-1);
      expect(guard, `${route.day} touches the database before its guard`).toBeLessThan(db);
    }
  });

  it('has no second copy of the comparison', () => {
    /*
     * The defect this file was extracted to prevent: two implementations of one
     * security check is a fix applied to one door and not the other.
     */
    for (const route of routes) {
      // The *read* of the secret, not the word — both routes name it in prose,
      // and a comment explaining the shared door is the opposite of the defect.
      expect(route.source, `${route.day} reads the secret itself`).not.toMatch(
        /env\[['"]CRON_SECRET/,
      );
      expect(route.source, `${route.day} has its own guard`).not.toMatch(
        /function\s+\w*[Aa]uthorized/,
      );
    }
  });
});
