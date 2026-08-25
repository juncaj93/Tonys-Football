import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import tsParser from '@typescript-eslint/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * The application clock must be injected, never read directly.
 *
 * The time machine in `09 §7` requires that admins can simulate any point in a
 * season, and `16 §14` requires a full synthetic-season replay. Both depend on
 * there being exactly one place where wall-clock time enters the system.
 *
 * This rule exists now, before there is anything to fix. Retrofitting it later
 * means auditing every file in the project.
 */
const clockEnforcement = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message:
        'Use now() from @/lib/clock instead of new Date(). The time machine and season replay depend on a single injected clock.',
    },
    {
      selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
      message:
        'Use now().getTime() from @/lib/clock instead of Date.now(). The time machine and season replay depend on a single injected clock.',
    },
    /*
     * The same rule, for the same reason, applied to the other half of it.
     *
     * "Randomness only via `lib/counter/rng.ts`" has been a standing constraint
     * since M2 and was written down in the checkpoint beside the clock — but
     * only the clock half was ever enforced, and `lib/content/select.ts`
     * defaulted its draw to `Math.random` for four milestones without anything
     * noticing.
     *
     * That is not a style point. Content selection runs **inside a server
     * render**, so an unseeded draw is a sentence that can differ between the
     * HTML the server sent and the tree the browser builds from it — which
     * React reports as a hydration mismatch on the product's first screen.
     *
     * Two sanctioned sources, both injectable and both replayable: `rollBelow`
     * for an event with an outcome worth recording, `seededDraw` for anything
     * chosen during a render.
     */
    {
      selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
      message:
        'Use rollBelow() from @/lib/counter/rng for an event, or seededDraw() from @/lib/content/draw for anything chosen during a render. Math.random inside a render is a hydration mismatch waiting to happen.',
    },
  ],
};

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'next-env.d.ts',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  /*
   * NodeNext utility modules intentionally use `.mts`. `eslint-config-next`
   * configures TypeScript for the app's `.ts`/`.tsx` surface but does not claim
   * `.mts`, so CI had been parsing the visual-audit driver as plain JavaScript.
   * Keep it checked with the TypeScript parser; ignoring a release gate would
   * turn the parse failure into a silent visual-QA blind spot.
   */
  {
    files: ['**/*.mts'],
    languageOptions: { parser: tsParser },
  },

  {
    rules: {
      ...clockEnforcement,
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // The clock's own test needs real time to prove that `now()` returns it.
    //
    // `lib/clock.ts` is deliberately NOT exempted here. It carries a single
    // inline disable on the one sanctioned line, so any other wall-clock read
    // added to that file later still fails the build.
    files: ['lib/clock.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];

export default eslintConfig;
