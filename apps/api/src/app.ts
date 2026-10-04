import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Db } from 'mongodb';
import { adminRoutes } from './admin/routes.js';
import { checkOrigin } from './auth/guards.js';
import { authRoutes } from './auth/routes.js';
import type { Config } from './config.js';
import { collections, type Collections } from './db.js';
import { installErrorHandling } from './errors.js';
import { mediaRoutes } from './media.js';

export interface Ctx {
  config: Config;
  db: Db;
  c: Collections;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: Ctx;
  }
}

export async function buildApp(config: Config, db: Db, logger: FastifyServerOptions['logger'] = true) {
  const app = Fastify({
    logger: logger && {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Never log credentials or session material.
      redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
    },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
  });
  app.decorate('ctx', { config, db, c: collections(db) });
  installErrorHandling(app);

  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req) => checkOrigin(req));

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
  await app.register(adminRoutes);
  await app.register(mediaRoutes);
  return app;
}
