// Installs the food court's eight categories (پیتزا … دسر) with their icons. Real data, safe in production
// and safe to re-run: existing categories (by icon key) are left as the super admin edited them.
// Usage (Docker / Coolify): node dist/cli/seed-categories.js
import { loadConfig } from '../config.js';
import { connect, migrate } from '../db.js';
import { ensureCategories } from '../seed/categories.js';

const config = loadConfig();
const { client, db } = await connect(config.MONGODB_URI);
try {
  await migrate(db);
  const ids = await ensureCategories(db);
  console.log(`Foodcourt categories ensured: ${ids.size}.`);
} finally {
  await client.close();
}
