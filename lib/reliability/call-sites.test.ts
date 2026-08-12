import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A client component may not `await` a server action bare.
 *
 * ## What this gate is for
 *
 * Every mutation surface in this product was written the same way, and every one
 * of them took the whole application down when the request failed to land:
 *
 * ```ts
 * startTransition(async () => {
 *   const result = await setThemeAction(theme);   // <- rejects if the phone is
 *   if (!result.ok) { ... }                       //    in a tunnel
 * });
 * ```
 *
 * Nothing catches the rejection, React re-throws it during render, and the tree
 * unmounts — taking a half-finished character with it. `lib/reliability/attempt.ts`
 * is the repair; this is what stops the tenth surface being written the old way.
 *
 * ## Why the AST rather than a grep
 *
 * `await someAction()` appears in comments, in strings, and in `.test.tsx` files
 * that call actions directly with no browser to lose. A regular expression
 * cannot tell those apart from the real thing, and a gate with false positives
 * gets an ignore comment within a month.
 *
 * ## The rule, precisely
 *
 * In a file carrying `'use client'`, an `await` whose operand is a **call to an
 * identifier ending in `Action`** must not appear unless it is inside a call to
 * `attempt`. `attempt(() => setThemeAction(x))` passes because the call sits in
 * an arrow function argument to `attempt`, not under an `await`.
 *
 * Server components and server actions are untouched: there is no client tree to
 * unmount there, and a throw is caught by the route's error boundary.
 */

const ROOTS = ['app', 'components', 'lib'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path, out);
      continue;
    }
    if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/** Is `'use client'` the module's own directive? */
function isUseClientModule(source: ts.SourceFile): boolean {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement)) return false;
    const { expression } = statement;
    if (!ts.isStringLiteral(expression) && !ts.isNoSubstitutionTemplateLiteral(expression)) {
      return false;
    }
    if (expression.text === 'use client') return true;
  }
  return false;
}

/** `foo()` where `foo` is a plain identifier ending in `Action`. */
function isActionCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text.endsWith('Action')
  );
}

/** Bare `await someAction(...)` expressions, by the name they call. */
export function bareAwaitedActions(source: ts.SourceFile): string[] {
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isAwaitExpression(node)) {
      /*
       * `await a ? b() : c()` and `await (x())` both wrap the call, so the
       * operand is unwrapped rather than compared directly — the room's slot
       * used a conditional and would otherwise have slipped through.
       */
      for (const call of unwrapCalls(node.expression)) {
        if (isActionCall(call)) found.push(call.expression.getText(source));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

/** Every call expression reachable from an operand without passing a function boundary. */
function unwrapCalls(node: ts.Expression): ts.CallExpression[] {
  if (ts.isParenthesizedExpression(node)) return unwrapCalls(node.expression);
  if (ts.isConditionalExpression(node)) {
    return [...unwrapCalls(node.whenTrue), ...unwrapCalls(node.whenFalse)];
  }
  if (ts.isCallExpression(node)) {
    // `attempt(() => act())` — the inner call is behind a function boundary and
    // is therefore never awaited bare.
    return [node];
  }
  return [];
}

const CLIENT_FILES = ROOTS.flatMap((root) => walk(root))
  .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
  .map((path) => ({
    path,
    source: ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.ESNext,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  }))
  .filter((file) => isUseClientModule(file.source));

describe('client components calling server actions', () => {
  /*
   * A scan that finds nothing passes vacuously, which is how the `unsupported`
   * registry's first matcher shipped broken. Eight client components call an
   * action today.
   */
  it('are actually found by the scan', () => {
    expect(CLIENT_FILES.length).toBeGreaterThanOrEqual(8);
    expect(CLIENT_FILES.map((file) => file.path)).toContain(
      join('components', 'character', 'customiser.tsx'),
    );
  });

  it.each(CLIENT_FILES.map((file) => file.path))('%s never awaits an action bare', (path) => {
    const file = CLIENT_FILES.find((candidate) => candidate.path === path);
    expect(file).toBeDefined();
    expect(bareAwaitedActions(file!.source)).toEqual([]);
  });

  /**
   * The check catches the exact shape that blanked the application.
   *
   * Without this, a scan that stopped recognising `await` would report every
   * file clean and read as a pass.
   */
  it('catches the bare await that destroyed a half-finished character', () => {
    const source = ts.createSourceFile(
      'offender.tsx',
      [
        "'use client';",
        'async function save() {',
        '  const result = await saveCharacterAction({});',
        '  return result;',
        '}',
      ].join('\n'),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );

    expect(isUseClientModule(source)).toBe(true);
    expect(bareAwaitedActions(source)).toEqual(['saveCharacterAction']);
  });

  /** The room's slot chose between two actions with a conditional. */
  it('sees through a conditional operand', () => {
    const source = ts.createSourceFile(
      'offender.tsx',
      [
        "'use client';",
        'async function put(clearing: boolean) {',
        '  return clearing ? await clearSlotAction("shelf") : await placeInSlotAction("shelf", "x");',
        '}',
        'async function put2(clearing: boolean) {',
        '  return await (clearing ? clearSlotAction("shelf") : placeInSlotAction("shelf", "x"));',
        '}',
      ].join('\n'),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );

    expect(bareAwaitedActions(source).sort()).toEqual([
      'clearSlotAction',
      'clearSlotAction',
      'placeInSlotAction',
      'placeInSlotAction',
    ]);
  });

  it('accepts a call wrapped in attempt', () => {
    const source = ts.createSourceFile(
      'fine.tsx',
      [
        "'use client';",
        'async function save() {',
        '  const outcome = await attempt(() => saveCharacterAction({}));',
        '  return outcome;',
        '}',
      ].join('\n'),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );

    expect(bareAwaitedActions(source)).toEqual([]);
  });
});
