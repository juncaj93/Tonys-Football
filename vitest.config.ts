import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],

    /**
     * Test files run one at a time.
     *
     * The integration tests share a single Postgres and each truncates the
     * tables it uses to start from a known state. Run in parallel, one file's
     * truncation lands in the middle of another's transaction and both fail
     * for reasons that have nothing to do with the code under test.
     *
     * The alternative — a separate database or schema per file — is more
     * machinery than a 157-test suite that finishes in about two seconds
     * deserves. Revisit if the suite ever gets slow enough to notice.
     */
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),

      /**
       * `server-only` is a build-time marker, and here it is a wall.
       *
       * The package's whole implementation is a file that throws unless the
       * bundler resolved it under React's `react-server` condition. Vitest does
       * not set that condition, so **importing any module that carries the
       * marker fails at collection** — which quietly made a small set of
       * modules untestable, and they are exactly the ones worth testing:
       * `lib/cron/secret.ts` is the door on both scheduled jobs.
       *
       * Aliasing it to an empty module restores the marker's real meaning here.
       * It protects the *client bundle*, and a unit test is not a client
       * bundle — Next.js still enforces it at build time, which is where the
       * protection was ever coming from.
       */
      'server-only': fileURLToPath(new URL('./lib/testing/server-only-stub.ts', import.meta.url)),
    },
  },
});
