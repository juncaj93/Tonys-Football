import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';

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
