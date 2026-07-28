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
    },
  },
});
