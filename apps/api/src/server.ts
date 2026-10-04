import { mkdir } from 'node:fs/promises';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connect, migrate } from './db.js';

const config = loadConfig();
const { client, db } = await connect(config.MONGODB_URI);
await migrate(db);
await mkdir(config.MEDIA_DIR, { recursive: true });

const app = await buildApp(config, db);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await client.close();
    process.exit(0);
  });
}
await app.listen({ host: config.API_HOST, port: config.API_PORT });
