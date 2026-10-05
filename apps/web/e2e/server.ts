// Browser-test backend: the real API (apps/api) on an in-memory MongoDB with the labelled demo seed,
// plus a separate control port used only by the tests (clock, availability, closure). Test code only.
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildApp } from '../../api/src/app.js';
import { loadConfig } from '../../api/src/config.js';
import { collections, migrate } from '../../api/src/db.js';
import { seedDemo } from '../../api/src/seed/demo.js';
import { hashPassword } from '../../api/src/auth/password.js';
import { DEFAULT_WEEKLY_HOURS } from '@elay/shared';

export const API_PORT = 5310;
export const CONTROL_PORT = 5311;
const START = '2026-10-04T10:00:00Z'; // Sunday 13:30 Tehran: every demo stall open except هارمونی (18:00–02:00)

// In-memory mongod by default; MONGODB_TEST_URI (e.g. a local container) when the binary cannot be downloaded.
const uri = process.env.MONGODB_TEST_URI ?? (await MongoMemoryServer.create()).getUri();
const client = await MongoClient.connect(uri);
const db = client.db('elay_e2e');
const c = collections(db);
const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'elay-e2e-media-'));
const clock = { now: new Date(START) };

async function reset() {
  await db.dropDatabase();
  await migrate(db);
  clock.now = new Date(START);
  await seedDemo(db, mediaDir, clock.now);
}
await reset();

// Many sign-ins per test run from one address: the login limit itself is covered by the API tests.
const config = loadConfig({ NODE_ENV: 'test', MONGODB_URI: uri, MEDIA_DIR: mediaDir, COOKIE_SECURE: 'false', LOGIN_RATE_LIMIT_PER_15M: '1000' });
const app = await buildApp(config, db, false, () => clock.now);
await app.listen({ host: '127.0.0.1', port: API_PORT });

type Op =
  | { op: 'reset' }
  | { op: 'clock'; iso: string }
  | { op: 'available'; food: string; value: boolean }
  | { op: 'deleteFood'; food: string }
  | { op: 'menu'; open: boolean; message?: string }
  | { op: 'adds'; food: string; count: number }
  | { op: 'stallAdmin'; stall: string; username: string; password: string }
  | { op: 'emptyStall'; name: string; username: string; password: string }
  | { op: 'superAdmin'; username: string; password: string };

async function account(stallId: ObjectId, username: string, password: string) {
  const now = new Date();
  await c.accounts.insertOne({ _id: new ObjectId(), username, passwordHash: await hashPassword(password), role: 'stall_admin', stallId, createdAt: now, passwordChangedAt: now });
}

const food = async (key: string) => (await c.foods.findOne({ seedKey: `demo:food:${key}` }))!;

async function handle(body: Op) {
  switch (body.op) {
    case 'reset':
      return reset();
    case 'clock':
      clock.now = new Date(body.iso);
      return;
    case 'available':
      await c.foods.updateOne({ _id: (await food(body.food))._id }, { $set: { available: body.value } });
      return;
    case 'deleteFood':
      await c.foods.deleteOne({ _id: (await food(body.food))._id });
      return;
    case 'menu':
      await c.foodcourt.updateOne({ _id: 'foodcourt' }, { $set: { menuOpen: body.open, closedMessage: body.message ?? '' } });
      return;
    case 'stallAdmin': {
      const stall = (await c.stalls.findOne({ seedKey: `demo:stall:${body.stall}` }))!;
      await account(stall._id, body.username, body.password);
      return { stallId: stall._id.toHexString() };
    }
    case 'emptyStall': {
      const _id = new ObjectId();
      const now = new Date();
      await c.stalls.insertOne({ _id, name: body.name, intro: '', logo: null, weeklyHours: DEFAULT_WEEKLY_HOURS, manualOverride: null, sortOrder: 99, visible: true, isDemo: false, createdAt: now, updatedAt: now });
      await account(_id, body.username, body.password);
      return { stallId: _id.toHexString() };
    }
    case 'superAdmin': {
      const now = new Date();
      await c.accounts.insertOne({ _id: new ObjectId(), username: body.username, passwordHash: await hashPassword(body.password), role: 'super_admin', stallId: null, createdAt: now, passwordChangedAt: now });
      return;
    }
    case 'adds': {
      const f = await food(body.food);
      await c.popularityCounters.insertOne({ _id: new ObjectId(), foodId: f._id, day: '2026-10-04', count: body.count, expiresAt: new Date('2027-01-01') });
      return;
    }
  }
}

createServer((req, res) => {
  if (req.method === 'GET') return void res.end('ok');
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', async () => {
    try {
      const result = await handle(JSON.parse(raw) as Op);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result ?? { ok: true }));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  });
}).listen(CONTROL_PORT, '127.0.0.1');
console.log(`e2e api on ${API_PORT}, control on ${CONTROL_PORT}`);
