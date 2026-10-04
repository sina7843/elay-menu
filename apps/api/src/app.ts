import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Db } from 'mongodb';
import { stallRoutes } from './admin/stall-routes.js';
import { superRoutes } from './admin/super-routes.js';
import { checkOrigin } from './auth/guards.js';
import { authRoutes } from './auth/routes.js';
import type { Config } from './config.js';
import { collections, type Collections } from './db.js';
import { installErrorHandling } from './errors.js';
import { MAX_UPLOAD_BYTES, mediaRoutes } from './media.js';
import { publicRoutes } from './menu/public.js';

export interface Ctx {
  config: Config;
  db: Db;
  c: Collections;
  /** Clock; injectable for tests. */
  now: () => Date;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: Ctx;
  }
}

export async function buildApp(
  config: Config,
  db: Db,
  logger: FastifyServerOptions['logger'] = true,
  now: () => Date = () => new Date(),
) {
  const app = Fastify({
    logger: logger && {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Never log credentials or session material.
      redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
    },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
  });
  app.decorate('ctx', { config, db, c: collections(db), now });
  // Uploads are sent as the raw image body; only upload routes accept it (others fail schema validation).
  app.addContentTypeParser(
    ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
    (_req, body, done) => done(null, body),
  );
  installErrorHandling(app);

  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req) => checkOrigin(req));
  // Admin/auth responses can carry one-time temporary passwords and private data: never cache them.
  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/admin/') || req.url.startsWith('/api/auth/')) reply.header('cache-control', 'no-store');
  });

  app.get('/health/live', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await db.command({ ping: 1 }, { timeoutMS: 2000 });
      return { status: 'ready', db: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable', db: 'unreachable' });
    }
  });

  await app.register(authRoutes);
  await app.register(publicRoutes);
  await app.register(stallRoutes);
  await app.register(superRoutes);
  await app.register(mediaRoutes);
  return app;
}
