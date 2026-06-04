// One-off helper to set up a local DB for ML training.
// Runs ensureDatabase + creates schemas + applies all migrations.
// Usage: DB_HOST=... DB_PASSWORD=... npx ts-node src/scripts/init-local-db.ts

import { initDatabase, db } from '../config/database';

async function main() {
  await initDatabase();
  console.log('Migrations applied. Tables:');
  const rows = await db.raw(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('market','recommendations') ORDER BY 1,2"
  );
  for (const r of rows.rows) console.log(`  ${r.table_schema}.${r.table_name}`);
  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
