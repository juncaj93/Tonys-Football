/**
 * Applies pending migrations.
 *
 * Used locally and in CI. Deliberately a script rather than `drizzle-kit push`:
 * migrations are generated, committed, and reviewed in a pull request, so the
 * SQL that runs against a database is always the SQL someone read.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    console.error(
      'DATABASE_URL is not set.\n' +
        'Start local Postgres with `npm run db:up`, then export it, e.g.\n' +
        '  export DATABASE_URL=postgres://tonys:local_dev_only@localhost:5432/tonys_dev',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
