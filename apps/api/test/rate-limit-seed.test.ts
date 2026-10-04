import { readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collections, migrate } from '../src/db.js';
import { seedDemo } from '../src/seed/demo.js';
import { setup, type TestEnv } from './helpers.js';

let t: TestEnv;
beforeAll(async () => {
  t = await setup({ LOGIN_RATE_LIMIT_PER_15M: '3' });
});
afterAll(() => t?.close());

describe('login rate limiting', () => {
  it('returns RATE_LIMITED after the configured number of attempts', async () => {
    const attempt = () => t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'x', password: 'y' } });
    for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(401);
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    // Another username from the same IP (shared food-court Wi-Fi) is not locked out.
    const other = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'z', password: 'y' } });
    expect(other.statusCode).toBe(401);
  });
});

describe('migrations and demo seed', () => {
  it('migrations are recorded and re-running is a no-op', async () => {
    expect(await migrate(t.db)).toEqual([]);
    expect(await collections(t.db).foodcourt.countDocuments()).toBe(1);
  });

  it('demo seed is idempotent, labelled, and copies media', async () => {
    const first = await seedDemo(t.db, t.config.MEDIA_DIR);
    const c = collections(t.db);
    await c.stalls.updateOne({ seedKey: 'demo:stall:hayat' }, { $set: { intro: 'edited' } });
    const second = await seedDemo(t.db, t.config.MEDIA_DIR);
    expect(second).toEqual(first);
    expect(await c.stalls.countDocuments()).toBe(7);
    expect(await c.categories.countDocuments()).toBe(8);
    expect(await c.foods.countDocuments()).toBe(first.foods);
    expect(await c.stalls.countDocuments({ isDemo: { $ne: true } })).toBe(0);
    expect(await c.foods.countDocuments({ isDemo: { $ne: true } })).toBe(0);
    expect(await c.accounts.countDocuments()).toBe(0); // no fixed credentials
    expect((await c.stalls.findOne({ seedKey: 'demo:stall:hayat' }))?.intro).toBe('edited'); // edits preserved
    const files = await readdir(t.config.MEDIA_DIR);
    expect(files).toContain('demo-blu-burger.svg');
    expect(files).toContain('demo-pizza.webp');
    const logo = await t.app.inject('/api/media/demo-cheezo.png');
    expect(logo.statusCode).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
  });
});
