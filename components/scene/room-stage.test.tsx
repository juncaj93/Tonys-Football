import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NOTHING, RoomStage, afterDismiss, afterPresent, useRoomStage } from './room-stage';

/**
 * The room's transient rule, asserted rather than intended.
 *
 * `MANDATE §6` forbids two transient surfaces competing, and the parlor had five
 * of them with five private owners and nothing arbitrating — which is what
 * visual debts 3, 4 and 10 are, seen from three angles. `RoomStage` is the
 * arbiter, so *"only one thing is ever up"* stops being a convention every
 * future surface has to remember and becomes something the build checks.
 */

describe('the one-transient rule', () => {
  it('starts with nothing up', () => {
    expect(NOTHING).toEqual({ surface: null, blocking: false });
  });

  it('replaces the surface that is up rather than stacking a second one', () => {
    const first = afterPresent(NOTHING, 'receipt', false);
    expect(first.surface).toBe('receipt');

    const second = afterPresent(first, 'tonight', false);
    // The rule in one assertion: presenting does not add, it replaces.
    expect(second.surface).toBe('tonight');
  });

  it('lets the surface that is up take itself down', () => {
    const up = afterPresent(NOTHING, 'receipt', false);
    expect(afterDismiss(up, 'receipt')).toEqual(NOTHING);
  });

  it('ignores a dismissal from a surface that has already been replaced', () => {
    /*
     * A real sequence: the receipt is open, the manager taps the board, and the
     * receipt's own close handler fires late — from a focus restore, an effect
     * cleanup, an Escape that was already in flight. It must not take down the
     * board that replaced it.
     */
    const board = afterPresent(afterPresent(NOTHING, 'receipt', false), 'tonight', false);
    expect(afterDismiss(board, 'receipt').surface).toBe('tonight');
  });

  it('refuses to replace a blocking surface', () => {
    /*
     * The collectible reveal. A panel is something you opened and can replace by
     * opening another; the reveal is a recorded, once-only moment at the tray,
     * and a manager who taps the receipt halfway through must not be able to
     * make it disappear.
     */
    const reveal = afterPresent(NOTHING, 'reveal', true);
    expect(afterPresent(reveal, 'receipt', false).surface).toBe('reveal');
    expect(afterPresent(reveal, 'tonight', false)).toBe(reveal);
  });

  it('lets a blocking surface re-present itself without deadlocking', () => {
    // Its claim comes from an effect, which may re-fire. Refusing itself would
    // be a room that can never be released.
    const reveal = afterPresent(NOTHING, 'reveal', true);
    expect(afterPresent(reveal, 'reveal', true).surface).toBe('reveal');
  });

  it('releases the room when the blocking surface lets go', () => {
    const reveal = afterPresent(NOTHING, 'reveal', true);
    const cleared = afterDismiss(reveal, 'reveal');
    expect(cleared).toEqual(NOTHING);
    expect(afterPresent(cleared, 'receipt', false).surface).toBe('receipt');
  });
});

describe('RoomStage', () => {
  it('renders no DOM of its own', () => {
    /*
     * Load-bearing. The room's object map, hit regions and z-order are measured
     * against the shell's own coordinate space, and the parlor's intermittent
     * hydration mismatch is still open as visual debt 12 — a wrapper element in
     * the middle of that is a hazard for no benefit.
     */
    expect(
      renderToStaticMarkup(
        <RoomStage>
          <span>the room</span>
        </RoomStage>,
      ),
    ).toBe('<span>the room</span>');
  });

  it('serves a room at rest, so the server and the client agree', () => {
    function Probe() {
      const stage = useRoomStage();
      return <i data-showing={String(stage.showing)} data-blocked={String(stage.blocked)} />;
    }
    expect(
      renderToStaticMarkup(
        <RoomStage>
          <Probe />
        </RoomStage>,
      ),
    ).toBe('<i data-showing="null" data-blocked="false"></i>');
  });

  it('is inert outside a provider rather than throwing', () => {
    /*
     * These components are also rendered by tests and by screens that are not
     * rooms. A presentation primitive must never be the reason a page fails to
     * render, so the default context is a room at rest.
     */
    function Alone() {
      const stage = useRoomStage();
      stage.present('receipt');
      return <span>{String(stage.showing)}</span>;
    }
    expect(renderToStaticMarkup(<Alone />)).toBe('<span>null</span>');
  });
});

describe('the room-wide focus attribute', () => {
  const scene = path.join(process.cwd(), 'components', 'scene');

  it('is written from exactly one place', () => {
    /*
     * `CounterTray` used to set `data-parlor-focus` on `document.body` itself,
     * with a comment explaining that the room is a server component and the two
     * siblings had no common client ancestor — *"adding a provider around it to
     * carry one boolean would be a larger change than the defect"*. That
     * provider now exists, so the attribute has one writer. A second one
     * appearing is how the room quietly gets two sources of truth again.
     */
    const writers = readdirSync(scene)
      .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
      .filter((name) => readFileSync(path.join(scene, name), 'utf8').includes('parlorFocus'));

    expect(writers).toEqual(['room-stage.tsx']);
  });
});
