import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@elay/shared';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadConfig, type Config } from '../src/config.js';
import { collections, migrate } from '../src/db.js';

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  config: Config;
  close: () => Promise<void>;
}

/** Fresh database per suite: in-memory mongod, or MONGODB_TEST_URI when provided (e.g. CI with a mongo service). */
export async function setup(env: Record<string, string> = {}): Promise<TestEnv> {
  const mem = process.env.MONGODB_TEST_URI ? null : await MongoMemoryServer.create();
  const base = process.env.MONGODB_TEST_URI ?? mem!.getUri();
  const client = await MongoClient.connect(base);
  const db = client.db(`elay_test_${new ObjectId().toHexString()}`);
  await migrate(db);
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: base,
    MEDIA_DIR: await mkdtemp(path.join(os.tmpdir(), 'elay-media-')),
    ...env,
  });
  const app = await buildApp(config, db, false);
  return {
    app,
    db,
    config,
    close: async () => {
      await app.close();
      await db.dropDatabase();
      await client.close();
      await mem?.stop();
    },
  };
}

export async function createAccount(db: Db, username: string, password: string, role: Role, stallId: ObjectId | null = null) {
  const now = new Date();
  const _id = new ObjectId();
  await collections(db).accounts.insertOne({
    _id, username, passwordHash: await hashPassword(password), role, stallId, createdAt: now, passwordChangedAt: now,
  });
  return _id;
}

export async function createStall(db: Db, name: string) {
  const _id = new ObjectId();
  const now = new Date();
  await collections(db).stalls.insertOne({
    _id, name, intro: '', logo: null, sortOrder: 0, visible: true, isDemo: false, manualOverride: null, createdAt: now, updatedAt: now,
    weeklyHours: Array.from({ length: 7 }, () => ({ closed: false, open: '12:00', close: '23:00' })),
  });
  return _id;
}

export interface Session {
  cookie: string;
  csrf: string;
}

export async function login(app: FastifyInstance, username: string, password: string): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const setCookie = String(res.headers['set-cookie']);
  return { cookie: setCookie.split(';')[0]!, csrf: res.json().csrfToken };
}

export const authed = (s: Session, withCsrf = true) => ({
  cookie: s.cookie,
  ...(withCsrf ? { 'x-csrf-token': s.csrf } : {}),
});
