import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A `'use server'` file may export **async functions and nothing else**.
 *
 * ## This is a crash, not a style rule
 *
 * Next.js compiles every `'use server'` module with an injected call to
 * `ensureServerEntryExports([...every runtime export])`. It throws
 *
 *   A "use server" file can only export async functions, found object.
 *
 * carrying `__NEXT_ERROR_CODE = "E352"`, which is what puts the `@E352` suffix on
 * the digest a manager sees.
 *
 * ## Why every existing gate was green while it was broken
 *
 * `app/actions/character.ts` exported `const CUSTOMISER_SLOTS = WEARABLE_SLOTS`
 * — a frozen array, with **no consumer anywhere in the product** — from #48
 * (2026-07-31). Every attempt to save a character in production failed with a
 * server-side exception for as long as it was there, and:
 *
 * - **`next build` passed.** The check is deliberately runtime-only; the loader's
 *   own comment says *"here we can only check that they are functions"*.
 * - **`npm run test` passed.** No test loads a compiled `'use server'` module
 *   through the flight loader.
 * - **`npm run visual:qa` passed.** It opens `/profile/character` and photographs
 *   it, and photographing a form does not submit it. The module is evaluated when
 *   an action is **invoked**, not when the page renders — which is exactly why
 *   the route loaded perfectly and only Save was broken.
 *
 * So the gate has to be the *shape of the file*, checked without running Next.
 * Reading the AST rather than matching text: `export const` inside a comment, a
 * string, or a nested function is not an export, and a regular expression cannot
 * tell the difference.
 *
 * `export type` and `export interface` are fine — they are erased before any of
 * this happens, which is why `SaveCharacterResult` and friends may stay.
 */

const ROOTS = ['app', 'lib', 'components'];

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

/** Is `'use server'` the module's own directive, rather than an inline one? */
function isUseServerModule(source: ts.SourceFile): boolean {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement)) return false;
    const { expression } = statement;
    if (!ts.isStringLiteral(expression) && !ts.isNoSubstitutionTemplateLiteral(expression)) {
      return false;
    }
    if (expression.text === 'use server') return true;
  }
  return false;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
    : false;
}

const isExported = (node: ts.Node) => hasModifier(node, ts.SyntaxKind.ExportKeyword);
const isAsync = (node: ts.Node) => hasModifier(node, ts.SyntaxKind.AsyncKeyword);

/** Every export in this file that Next will hand to `ensureServerEntryExports`. */
function offendingExports(source: ts.SourceFile): string[] {
  const problems: string[] = [];

  for (const statement of source.statements) {
    // Erased before the bundler ever sees them.
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;

    if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      if (!isAsync(statement)) {
        problems.push(`${statement.name?.text ?? '(default)'} — exported function is not async`);
      }
      continue;
    }

    if (ts.isClassDeclaration(statement) && isExported(statement)) {
      problems.push(`${statement.name?.text ?? '(default)'} — a class is not an async function`);
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText(source);
        const value = declaration.initializer;
        const isAsyncFunctionValue =
          value !== undefined &&
          (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) &&
          isAsync(value);

        if (!isAsyncFunctionValue) {
          problems.push(`${name} — exported value is not an async function`);
        }
      }
      continue;
    }

    /*
     * A re-export cannot be resolved from this file alone, and a `'use server'`
     * file has no reason to have one: it would republish somebody else's module
     * under an action's identity. `export type { … }` is erased and allowed.
     */
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const clause = statement.exportClause;
      const named =
        clause !== undefined && ts.isNamedExports(clause)
          ? clause.elements.filter((element) => !element.isTypeOnly)
          : [];
      if (clause === undefined || named.length > 0) {
        problems.push(`${statement.getText(source)} — re-export`);
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      problems.push('export default — not an async function declaration');
    }
  }

  return problems;
}

const USE_SERVER_FILES = ROOTS.flatMap((root) => walk(root))
  .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
  .map((path) => ({
    path,
    source: ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.ESNext,
      /* setParentNodes */ true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  }))
  .filter((file) => isUseServerModule(file.source));

describe("'use server' modules", () => {
  /*
   * If this ever finds nothing, the scan is broken rather than the product
   * clean — and a gate that passes because it looked nowhere is worse than no
   * gate. Six files carry the directive today.
   */
  it('are actually found by the scan', () => {
    expect(USE_SERVER_FILES.length).toBeGreaterThanOrEqual(6);
    expect(USE_SERVER_FILES.map((file) => file.path)).toContain(
      join('app', 'actions', 'character.ts'),
    );
  });

  it.each(USE_SERVER_FILES.map((file) => file.path))('%s exports only async functions', (path) => {
    const file = USE_SERVER_FILES.find((candidate) => candidate.path === path);
    expect(file).toBeDefined();
    expect(offendingExports(file!.source)).toEqual([]);
  });

  /**
   * The check catches the exact thing that shipped.
   *
   * Without this, a scan that silently stopped recognising `export const` would
   * report every file clean and read as a pass.
   */
  it('catches the export that broke every character save in production', () => {
    const source = ts.createSourceFile(
      'offender.ts',
      [
        "'use server';",
        'export async function saveCharacterAction() { return null; }',
        "export const CUSTOMISER_SLOTS = ['body', 'face', 'head', 'hand'];",
      ].join('\n'),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TS,
    );

    expect(isUseServerModule(source)).toBe(true);
    expect(offendingExports(source)).toEqual([
      'CUSTOMISER_SLOTS — exported value is not an async function',
    ]);
  });

  it('leaves type-only exports alone', () => {
    const source = ts.createSourceFile(
      'fine.ts',
      [
        "'use server';",
        'export type SaveResult = { ok: boolean };',
        'export interface Input { body: number }',
        'export async function act() { return null; }',
      ].join('\n'),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TS,
    );

    expect(offendingExports(source)).toEqual([]);
  });
});
