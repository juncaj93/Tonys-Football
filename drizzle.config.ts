import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  // Migrations are reviewed in pull requests, never pushed straight to a
  // database. `db:push` is deliberately not exposed as a script.
  strict: true,
  verbose: true,
});
