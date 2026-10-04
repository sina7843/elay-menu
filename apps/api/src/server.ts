import { mkdir } from 'node:fs/promises';
import { resumeStallDeletions } from './admin/delete-stall.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connect, migrate } from './db.js';
import { sweepOrphanMedia } from './media.js';

const config = loadConfig();
const { client, db } = await connect(config.MONGODB_URI);
await migrate(db);
await mkdir(config.MEDIA_DIR, { recursive: true });

const app = await buildApp(config, db);
// A stuck deletion must not keep the API down; it is retried on the next start or DELETE.
await resumeStallDeletions(app.ctx).catch((err) => app.log.error({ err }, 'resuming stall deletions failed'));
const sweep = () => sweepOrphanMedia(app.ctx).catch((err) => app.log.error({ err }, 'media sweep failed'));
await sweep();
setInterval(sweep, 6 * 3600_000).unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await client.close();
    process.exit(0);
  });
}
await app.listen({ host: config.API_HOST, port: config.API_PORT });
