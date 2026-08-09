import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RoomPanel } from './room-panel';

/**
 * Visual debts 3, 4 and 10, and the reason they are one test file.
 *
 * They were filed as three cosmetic items on three different surfaces. They are
 * one fact: **the room had no owner for its transient state.** Five surfaces —
 * three `RoomDisplay` panels, the champion panel, Tony's order pad, the shut
 * door's line and the reveal plate — each held its own `useState` and none could
 * see any of the others.
 *
 *   - **debt 4** — a panel and the pad could be up together, because nothing
 *     arbitrated
 *   - **debt 3** — the pad's timing was never reviewed against the reveal's,
 *     because nothing owned both
 *   - **debt 10** — the affordance vocabulary was replaced by `18 §9.4` and the
 *     old CSS was orphaned, because nothing owned *"show me what I can touch"*
 *
 * Each assertion below fails on the pre-pass build, which is the only reason to
 * write it down.
 */

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
const SCENE = path.join(ROOT, 'components', 'scene');

function sceneSources(): { name: string; text: string }[] {
  return readdirSync(SCENE)
    .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
    .map((name) => ({ name, text: readFileSync(path.join(SCENE, name), 'utf8') }));
}

/* ------------------------------------------------- debt 4 · one transient -- */

describe('visual debt 4 — only one transient surface is ever up', () => {
  it('makes the ambient room yield to any surface, not just the reveal', () => {
    /*
     * The selector was `body[data-parlor-focus='reveal']`, because the box
     * opening was the only thing that ever claimed the attribute. A **panel**
     * claims it too, and with the value pinned the pad stayed up behind the
     * panel's scrim — dimmed, not overlapping, and still a second transient.
     *
     * Matching the attribute's presence is what closes it, and is also what lets
     * a surface added later yield without editing the rule.
     */
    expect(CSS).toContain('body[data-parlor-focus] .tony-line');
    expect(CSS).not.toContain("body[data-parlor-focus='reveal']");
  });

  it('stops the yielded pad taking a tap it cannot be seen to take', () => {
    /*
     * `pointer-events: none` on the wrapper is not sufficient on its own: the
     * pad sets `pointer-events: auto` on the box so it can be dismissed, and a
     * child re-enabling them overrides the parent. An invisible dismiss button
     * was hit-testable across the bottom of the room for the whole reveal — the
     * plate is `z-26` inside the room and the pad is `z-40` fixed, so they are
     * not in the same stacking context and the pad wins.
     */
    expect(CSS).toContain('body[data-parlor-focus] .tony-line * {');
  });

  it('leaves no scene component holding its own panel state', () => {
    /*
     * The structural half. A behavioural test only ever opens the panels it
     * knows about; this fails the day a sixth surface is added with its own
     * `useState` instead of the stage — which is exactly how the first five
     * happened.
     */
    const dialogs = sceneSources()
      .filter(({ text }) => text.includes('role="dialog"'))
      .map(({ name }) => name);

    // Exactly one file builds a dialog. Everything else asks it to.
    expect(dialogs).toEqual(['room-panel.tsx']);

    const holdouts = sceneSources()
      .filter(({ name }) => name !== 'room-panel.tsx')
      .filter(({ text }) => /useState<\s*number \| null\s*>|const \[open, setOpen\]/.test(text))
      .map(({ name }) => name);

    expect(holdouts).toEqual([]);
  });
});

/* --------------------------------------------------- debt 3 · the timing -- */

describe('visual debt 3 — the pad and the reveal are sequential', () => {
  /** `.arriving .tony-line { animation: line-arrives <dur> ease-out <delay> both }` */
  function padArrival(): { duration: number; delay: number } {
    const rule = /\.arriving \.tony-line \{\s*animation: line-arrives (\d+)ms [^;]*?(\d+)ms both;/.exec(
      CSS,
    );
    if (rule === null) throw new Error('could not find `.arriving .tony-line` in globals.css');
    return { duration: Number(rule[1]), delay: Number(rule[2]) };
  }

  /** `const REVEAL_AT_MS = 1600;` in `arrival.tsx`. */
  function revealAt(): number {
    const source = readFileSync(path.join(SCENE, 'arrival.tsx'), 'utf8');
    const found = /const REVEAL_AT_MS = (\d+);/.exec(source);
    if (found === null) throw new Error('could not find REVEAL_AT_MS in arrival.tsx');
    return Number(found[1]);
  }

  it('finishes putting the pad down before the reveal starts', () => {
    /*
     * The review debt 3 asked for, done as arithmetic rather than as an opinion.
     * Both numbers are read from the files that own them, so moving either one
     * without moving the other fails the build — which is the part a one-off
     * inspection could never leave behind.
     *
     * Measured today: the pad lands at 980 + 260 = 1240ms and the reveal begins
     * at 1600ms. They are 360ms apart and never overlap.
     */
    const pad = padArrival();
    expect(pad.delay + pad.duration).toBeLessThan(revealAt());
  });

  it('leaves enough of a gap that they read as two beats rather than one', () => {
    // 200ms is about the shortest interval at which two events read as
    // sequential rather than simultaneous. Below it they compete, which is what
    // `MANDATE §6` forbids, even though neither overlaps the other.
    const pad = padArrival();
    expect(revealAt() - (pad.delay + pad.duration)).toBeGreaterThanOrEqual(200);
  });
});

/* ------------------------------------------------ debt 10 · the dead CSS -- */

describe('visual debt 10 — the withdrawn affordance vocabulary is gone', () => {
  const WITHDRAWN = ['.door-edge', '.door-wash', '.door-shadow', '.affordance-on-request'];

  it('no longer defines the classes the SVG-polygon mechanism needed', () => {
    /*
     * `18 §9.4` replaced authored silhouettes with `drop-shadow()` on the
     * overlay's own alpha. The polygons went; about ninety lines of `stroke` and
     * `fill` meant to be painted along them stayed, with zero consumers.
     */
    for (const dead of WITHDRAWN) {
      expect(CSS.includes(`${dead} {`), `${dead} is still defined`).toBe(false);
      expect(CSS.includes(`${dead},`), `${dead} is still in a selector list`).toBe(false);
    }
  });

  it('has no component rendering them either', () => {
    const app = path.join(ROOT, 'app');
    const files = [
      ...sceneSources().map(({ name, text }) => ({ name, text })),
      ...readdirSync(app)
        .filter((name) => name.endsWith('.tsx'))
        .map((name) => ({ name, text: readFileSync(path.join(app, name), 'utf8') })),
    ];
    for (const dead of WITHDRAWN) {
      const users = files.filter(({ text }) => text.includes(dead)).map(({ name }) => name);
      expect(users, `${dead} is rendered by ${users.join(', ')}`).toEqual([]);
    }
  });

  it('gives a focused room object a visible ring again', () => {
    /*
     * The half of debt 10 the entry did not name. `.room-shape:focus-visible
     * .door-edge` was how a room object showed keyboard focus; with the polygons
     * gone it matched nothing, every room object carries `outline-none`, and
     * nothing else in the stylesheet styled focus — so tabbing through the
     * parlor moved an invisible cursor. There is a `keyboard-focus` screenshot
     * state, and it had been photographing that for as long as it existed.
     *
     * WCAG 2.4.7, and `MANDATE §6`'s *"focus states stay usable, appear only
     * during relevant interaction, and stay pixel-aligned"*.
     */
    const rule = /\.room-shape:focus-visible \{([^}]*)\}/.exec(CSS);
    expect(rule, 'no :focus-visible rule for room objects').not.toBeNull();
    expect(rule?.[1]).toMatch(/outline:\s*2px solid/);
    // Whole pixels, drawn inside the hit region so it lands on the grid.
    expect(rule?.[1]).toMatch(/outline-offset:\s*-2px/);
  });
});

/* --------------------------------------------- the panel's own contract -- */

describe('RoomPanel', () => {
  const render = (extra?: { actions?: React.ReactNode; material?: 'paper' | 'enamel' }) =>
    renderToStaticMarkup(
      <RoomPanel title="Your record" onClose={() => undefined} {...extra}>
        <p>Alex</p>
      </RoomPanel>,
    );

  it('names itself with its own title', () => {
    const markup = render();
    const heading = /<h2 id="([^"]+)"/.exec(markup)?.[1];
    expect(heading).toBeDefined();
    expect(markup).toContain(`aria-labelledby="${String(heading)}"`);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
  });

  it('renders both materials from one implementation', () => {
    expect(render({ material: 'paper' })).toContain('data-room-panel="paper"');
    expect(render({ material: 'enamel' })).toContain('data-room-panel="enamel"');
  });

  it('places both materials identically', () => {
    /*
     * The defect this primitive exists for. `Sheet` and `ChampionPanel` were
     * written a milestone apart and disagreed on the scrim's opacity, the outer
     * padding, the maximum width and the close control — none of which was a
     * decision. Two panels a manager opens in sequence must land in the same
     * place.
     */
    /*
     * Colour is stripped; everything left is geometry.
     *
     * `on-paper` is on that list and is the one entry that is not obviously a
     * colour from its name. It re-points the rarity ink variables at values
     * mixed for a light ground (`globals.css`, Rarity) — it declares *which
     * inks apply*, exactly as `text-*` does, and it moves nothing. It arrived on
     * the paper material when the basement's slot panel became the first paper
     * panel to print a rarity word, at 1.54:1 against cream.
     */
    const geometry = (markup: string): string[] =>
      [...markup.matchAll(/class="([^"]*)"/g)]
        .map((m) => m[1] ?? '')
        .filter((c) => /fixed inset-0|max-w-|px-3\.5/.test(c))
        .map((c) => c.replace(/border-\S+|bg-\S+|text-\S+|\bon-paper\b/g, '').trim());

    expect(geometry(render({ material: 'paper' }))).toEqual(
      geometry(render({ material: 'enamel' })),
    );
  });

  it('renders the actions slot only when it is given one', () => {
    expect(render()).not.toContain('View season');
    expect(render({ actions: <a href="/timeline">View season</a> })).toContain('View season');
  });

  it('knows nothing about the domain', () => {
    /*
     * The separation the pass exists to establish: presentation and layout here,
     * everything else outside. A panel that learned about seasons, tokens or
     * ownership would have to be rebuilt when the room's art is, which is the
     * whole thing this is meant to prevent.
     */
    const source = readFileSync(path.join(SCENE, 'room-panel.tsx'), 'utf8');
    for (const forbidden of [
      '@/lib/parlor',
      '@/lib/counter',
      '@/lib/stats',
      '@/lib/slice',
      '@/lib/db',
      '@/lib/auth',
      'next/link',
      'next/navigation',
    ]) {
      expect(source.includes(forbidden), `room-panel.tsx imports ${forbidden}`).toBe(false);
    }
  });
});
