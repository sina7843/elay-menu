// Seeds clearly labelled development demo data (isDemo: true). Safe to re-run.
// Usage (Docker): docker compose exec api node dist/cli/seed-demo.js --allow-production-demo
import { loadConfig } from '../config.js';
import { connect, migrate } from '../db.js';
import { seedDemo } from '../seed/demo.js';

const config = loadConfig();
if (config.NODE_ENV === 'production' && !process.argv.includes('--allow-production-demo')) {
  console.error('Refusing to seed demo data with NODE_ENV=production. Pass --allow-production-demo for a local demo stack.');
  process.exit(1);
}
const { client, db } = await connect(config.MONGODB_URI);
try {
  await migrate(db);
  const result = await seedDemo(db, config.MEDIA_DIR);
  console.log(`Demo data ensured: ${result.categories} categories, ${result.stalls} stalls, ${result.foods} foods (no accounts).`);
} finally {
  await client.close();
}
