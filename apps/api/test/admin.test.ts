// Stall-admin and super-admin API. Clock: Sunday 2026-10-04 13:30 Tehran.
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { AdminFoodSchema, AdminStallSchema, ApiErrorSchema } from '@elay/shared';
import { resumeStallDeletions } from '../src/admin/delete-stall.js';
import { collections } from '../src/db.js';
import { authed, createAccount, login, setup, type Session, type TestEnv } from './helpers.js';

const NOW = new Date('2026-10-04T10:00:00Z');
const clock = { now: NOW };
let t: TestEnv;
let c: ReturnType<typeof collections>;
let root: Session;

type Res = { statusCode: number; json: () => any; body: string };
const call = (s: Session | null, method: string, url: string, payload?: unknown) =>
  t.app.inject({ method: method as 'GET', url, headers: s ? authed(s) : {}, ...(payload === undefined ? {} : { payload: payload as object }) }) as Promise<Res>;
const ok = async (p: Promise<Res>, status = 200) => {
  const res = await p;
  expect(res.statusCode, res.body).toBe(status);
  return res.statusCode === 204 ? null : res.json();
};
const fails = async (p: Promise<Res>, status: number, code: string) => {
  const res = await p;
  expect(res.statusCode, res.body).toBe(status);
  expect(ApiErrorSchema.parse(res.json()).error.code).toBe(code);
  return res.json();
};
const png = (w: number, h = w) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 80, b: 40, alpha: 0.5 } } }).png().toBuffer();
const upload = async (s: Session, url: string, body: Buffer, type = 'image/png') =>
  t.app.inject({ method: 'POST', url, headers: { ...authed(s), 'content-type': type }, payload: body }) as Promise<Res>;

let pizzaCat: string;
let burgerCat: string;

async function newStall(name: string, username: string) {
  const res = await ok(call(root, 'POST', '/api/admin/stalls', { name, logo: null, visible: true, adminUsername: username }), 201);
  AdminStallSchema.parse(res.stall);
  const s = await login(t.app, username, res.credentials.temporaryPassword);
  return { id: res.stall.id as string, s, password: res.credentials.temporaryPassword as string };
}

const foodBody = (stallCategoryId: string, extra: object = {}) => ({
  name: 'پیتزا پپرونی',
  description: 'پپرونی و موتزارلا',
  price: 385_000,
  image: null,
  tint: 'food-tint-1',
  categoryId: pizzaCat,
  stallCategoryId,
  available: true,
  discount: null,
  ...extra,
});

beforeAll(async () => {
  t = await setup({ LOGIN_RATE_LIMIT_PER_15M: '1000' }, clock);
  c = collections(t.db);
  await createAccount(t.db, 'root', 'rootpass1', 'super_admin');
  root = await login(t.app, 'root', 'rootpass1');
  pizzaCat = (await ok(call(root, 'POST', '/api/admin/categories', { name: 'پیتزا', icon: 'pizza' }), 201)).id;
  burgerCat = (await ok(call(root, 'POST', '/api/admin/categories', { name: 'برگر', icon: 'burger' }), 201)).id;
});
afterAll(() => t?.close());

describe('stall creation and accounts', () => {
  it('creates stall + manager with a one-time temporary password; duplicates conflict without orphans', async () => {
    const a = await newStall('غرفه الف', 'alef');
    const me = await ok(call(a.s, 'GET', '/api/auth/me'));
    expect(me.account).toMatchObject({ role: 'stall_admin', stallId: a.id });
    const before = await c.stalls.countDocuments();
    await fails(call(root, 'POST', '/api/admin/stalls', { name: 'x', logo: null, visible: true, adminUsername: 'ALEF' }), 409, 'CONFLICT');
    expect(await c.stalls.countDocuments()).toBe(before);
    const stall = await ok(call(root, 'GET', `/api/admin/stalls/${a.id}`));
    expect(stall).toMatchObject({ adminUsername: 'alef', foodCount: 0, intro: '' });
    expect(JSON.stringify(stall)).not.toContain(a.password);
  });

  it('reset password returns a new temporary password, revokes sessions and the old password', async () => {
    const b = await newStall('غرفه ب', 'beh');
    const raw = await call(root, 'POST', `/api/admin/stalls/${b.id}/account/reset-password`);
    expect((raw as unknown as { headers: Record<string, string> }).headers['cache-control']).toBe('no-store');
    const res = raw.json();
    expect(res.username).toBe('beh');
    expect(res.temporaryPassword).not.toBe(b.password);
    await fails(call(b.s, 'GET', '/api/auth/me'), 401, 'UNAUTHENTICATED');
    await expect(login(t.app, 'beh', b.password)).rejects.toThrow();
    await login(t.app, 'beh', res.temporaryPassword);
  });

  it('renames the manager username with uniqueness enforced', async () => {
    const d = await newStall('غرفه د', 'dal');
    await ok(call(root, 'PUT', `/api/admin/stalls/${d.id}/account`, { username: 'dal2' }));
    await fails(call(root, 'PUT', `/api/admin/stalls/${d.id}/account`, { username: 'alef' }), 409, 'CONFLICT');
    await login(t.app, 'dal2', d.password);
  });
});

describe('tenant isolation', () => {
  it('a stall admin cannot read or change another stall, its children, or super-admin resources', async () => {
    const a = await newStall('ایزوله الف', 'iso-a');
    const b = await newStall('ایزوله ب', 'iso-b');
    const scB = (await ok(call(b.s, 'POST', `/api/admin/stalls/${b.id}/categories`, { name: 'ب' }), 201)).id;
    const foodB = (await ok(call(b.s, 'POST', `/api/admin/stalls/${b.id}/foods`, foodBody(scB)), 201)).id;
    const scA = (await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/categories`, { name: 'الف' }), 201)).id;

    for (const [m, u, p] of [
      ['GET', `/api/admin/stalls/${b.id}`],
      ['GET', `/api/admin/stalls/${b.id}/foods`],
      ['POST', `/api/admin/stalls/${b.id}/foods`, foodBody(scB)],
      ['PUT', `/api/admin/stalls/${b.id}/foods/${foodB}/availability`, { available: false }],
      ['DELETE', `/api/admin/stalls/${b.id}/foods/${foodB}`],
      ['DELETE', `/api/admin/stalls/${b.id}/categories/${scB}`],
      ['PUT', `/api/admin/stalls/${b.id}/profile`, { intro: 'x', weeklyHours: Array(7).fill({ closed: true, open: '10:00', close: '11:00' }) }],
      ['PUT', `/api/admin/stalls/${b.id}/manual-status`, { isOpen: false }],
      ['GET', '/api/admin/stalls'],
      ['PATCH', `/api/admin/stalls/${a.id}`, { name: 'x', logo: null, visible: false }],
      ['DELETE', `/api/admin/stalls/${a.id}`],
      ['POST', `/api/admin/stalls/${a.id}/account/reset-password`],
      ['POST', '/api/admin/categories', { name: 'x', icon: 'pizza' }],
      ['PUT', '/api/admin/foodcourt', { name: 'x', logo: null, menuOpen: false, closedMessage: '' }],
    ] as const) {
      await fails(call(a.s, m, u, p), 403, 'FORBIDDEN');
    }
    // Child ids from another stall under one's own stall path are simply not found.
    await fails(call(a.s, 'GET', `/api/admin/stalls/${a.id}/foods/${foodB}`), 404, 'NOT_FOUND');
    await fails(call(a.s, 'PATCH', `/api/admin/stalls/${a.id}/categories/${scB}`, { name: 'x' }), 404, 'NOT_FOUND');
    // Another stall's menu category cannot be referenced.
    const bad = await fails(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(scB)), 400, 'VALIDATION_ERROR');
    expect(bad.error.details[0].path).toBe('stallCategoryId');
    // Another stall's uploaded image cannot be attached.
    const imgB = (await ok(upload(b.s, `/api/admin/stalls/${b.id}/media/food-image`, await png(300)), 201)).name;
    const stolen = await fails(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(scA, { image: imgB })), 400, 'VALIDATION_ERROR');
    expect(stolen.error.details[0].path).toBe('image');
    // Unchanged for B.
    expect((await c.foods.findOne({ _id: new ObjectId(foodB) }))!.available).toBe(true);
  });
});

describe('stall menu management', () => {
  it('food CRUD, availability switch, discounts and validation', async () => {
    const a = await newStall('غذا', 'food-a');
    const sc = (await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/categories`, { name: 'پیتزا آمریکایی' }), 201)).id;
    const created = AdminFoodSchema.parse(
      await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc, { discount: { percent: 15, startDate: '2026-10-01', endDate: '2026-10-04' } })), 201),
    );
    expect([created.finalPrice, created.discountActive]).toEqual([327_000, true]); // 327,250 → 327,000
    const off = await ok(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/foods/${created.id}/availability`, { available: false }));
    expect(off.available).toBe(false);
    const updated = await ok(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/foods/${created.id}`, foodBody(sc, { name: 'پیتزا مخصوص', categoryId: burgerCat })));
    expect([updated.name, updated.categoryId, updated.discount]).toEqual(['پیتزا مخصوص', burgerCat, null]);

    const v = await fails(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc, { price: -1, tint: 'red', size: 'L' })), 400, 'VALIDATION_ERROR');
    expect(v.error.details.length).toBeGreaterThan(0);
    await fails(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc, { discount: { percent: 91, startDate: '2026-10-01', endDate: '2026-10-02' } })), 400, 'VALIDATION_ERROR');
    await fails(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc, { discount: { percent: 10, startDate: '2026-10-05', endDate: '2026-10-02' } })), 400, 'VALIDATION_ERROR');
    const cat = await fails(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc, { categoryId: new ObjectId().toHexString() })), 400, 'VALIDATION_ERROR');
    expect(cat.error.details[0].path).toBe('categoryId');
    await fails(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc, { name: 'x'.repeat(61) })), 400, 'VALIDATION_ERROR');

    await ok(call(a.s, 'DELETE', `/api/admin/stalls/${a.id}/foods/${created.id}`), 204);
    await fails(call(a.s, 'GET', `/api/admin/stalls/${a.id}/foods/${created.id}`), 404, 'NOT_FOUND');
  });

  it('refuses to delete used categories and reorders by full id list', async () => {
    const a = await newStall('دسته', 'cat-a');
    const sc1 = (await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/categories`, { name: 'یک' }), 201)).id;
    const sc2 = (await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/categories`, { name: 'دو' }), 201)).id;
    const food = (await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc1, { categoryId: burgerCat })), 201)).id;

    await fails(call(a.s, 'DELETE', `/api/admin/stalls/${a.id}/categories/${sc1}`), 409, 'CONFLICT');
    await fails(call(root, 'DELETE', `/api/admin/categories/${burgerCat}`), 409, 'CONFLICT');
    const unused = (await ok(call(root, 'POST', '/api/admin/categories', { name: 'دسر', icon: 'dessert' }), 201)).id;
    await ok(call(root, 'DELETE', `/api/admin/categories/${unused}`), 204);

    await fails(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/categories/order`, { ids: [sc2] }), 400, 'VALIDATION_ERROR');
    await fails(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/categories/order`, { ids: [sc2, sc2] }), 400, 'VALIDATION_ERROR');
    await ok(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/categories/order`, { ids: [sc2, sc1] }));
    const list = await ok(call(a.s, 'GET', `/api/admin/stalls/${a.id}/categories`));
    expect(list.map((x: { id: string; foodCount: number }) => [x.id, x.foodCount])).toEqual([[sc2, 0], [sc1, 1]]);

    await ok(call(a.s, 'DELETE', `/api/admin/stalls/${a.id}/foods/${food}`), 204);
    await ok(call(a.s, 'DELETE', `/api/admin/stalls/${a.id}/categories/${sc1}`), 204);

    const cats = await ok(call(a.s, 'GET', '/api/admin/categories')); // readable by stall admins for CategoryPicker
    await ok(call(root, 'PUT', '/api/admin/categories/order', { ids: cats.map((x: { id: string }) => x.id).reverse() }));
  });

  it('weekly hours, intro and the manual open switch that expires at the next opening', async () => {
    const a = await newStall('ساعت', 'hours-a');
    const hours = Array.from({ length: 7 }, () => ({ closed: false, open: '18:00', close: '02:00' }));
    const p = await ok(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/profile`, { intro: 'شب‌ها باز', weeklyHours: hours }));
    expect([p.intro, p.isOpen, p.opensAt]).toEqual(['شب‌ها باز', false, '2026-10-04T14:30:00.000Z']);
    await fails(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/profile`, { intro: 'x'.repeat(41), weeklyHours: hours }), 400, 'VALIDATION_ERROR');
    await fails(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/profile`, { intro: '', weeklyHours: hours.slice(1) }), 400, 'VALIDATION_ERROR');

    const opened = await ok(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/manual-status`, { isOpen: true }));
    expect(opened.isOpen).toBe(true);
    expect(opened.manualOverride).toEqual({ state: 'open', until: '2026-10-04T14:30:00.000Z' });
    clock.now = new Date('2026-10-04T14:29:00Z');
    expect((await ok(call(a.s, 'GET', `/api/admin/stalls/${a.id}`))).isOpen).toBe(true);
    clock.now = new Date('2026-10-04T23:00:00Z'); // 02:30 Monday: past the override and the overnight close
    const later = await ok(call(a.s, 'GET', `/api/admin/stalls/${a.id}`));
    expect(later.isOpen).toBe(false);
    clock.now = NOW;
    const cleared = await ok(call(a.s, 'PUT', `/api/admin/stalls/${a.id}/manual-status`, { isOpen: false }));
    expect(cleared.manualOverride).toBeNull(); // already closed by schedule
  });
});

describe('super admin settings', () => {
  it('updates foodcourt settings; the public menu URL stays read-only configuration', async () => {
    const fc = await ok(call(root, 'PUT', '/api/admin/foodcourt', { name: 'ال‌آی', logo: null, menuOpen: false, closedMessage: 'تعطیل' }));
    expect(fc).toMatchObject({ menuOpen: false, closedMessage: 'تعطیل', publicMenuUrl: null });
    await fails(call(root, 'PUT', '/api/admin/foodcourt', { name: 'ال‌آی', logo: null, menuOpen: true, closedMessage: '', publicMenuUrl: 'https://x' }), 400, 'VALIDATION_ERROR');
    await ok(call(root, 'PUT', '/api/admin/foodcourt', { name: 'ال‌آی', logo: null, menuOpen: true, closedMessage: '' }));
  });

  it('stall list, update and ordering', async () => {
    const list = await ok(call(root, 'GET', '/api/admin/stalls'));
    expect(list.length).toBeGreaterThan(2);
    const ids = list.map((s: { id: string }) => s.id);
    await ok(call(root, 'PUT', '/api/admin/stalls/order', { ids: [...ids].reverse() }));
    expect((await ok(call(root, 'GET', '/api/admin/stalls')))[0].id).toBe(ids.at(-1));
    const patched = await ok(call(root, 'PATCH', `/api/admin/stalls/${ids[0]}`, { name: 'نام تازه', logo: null, visible: false }));
    expect([patched.name, patched.visible]).toEqual(['نام تازه', false]);
  });
});

describe('stall deletion cascade', () => {
  it('removes foods, categories, counters, account, sessions and media', async () => {
    const a = await newStall('حذفی', 'del-a');
    const sc = (await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/categories`, { name: 'x' }), 201)).id;
    const img = (await ok(upload(a.s, `/api/admin/stalls/${a.id}/media/food-image`, await png(400)), 201)).name;
    const unattached = (await ok(upload(a.s, `/api/admin/stalls/${a.id}/media/food-image`, await png(400)), 201)).name;
    const food = (await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc, { image: img })), 201)).id;
    await c.popularityCounters.insertOne({ _id: new ObjectId(), foodId: new ObjectId(food), day: '2026-10-04', count: 4, expiresAt: NOW });

    await ok(call(root, 'DELETE', `/api/admin/stalls/${a.id}`), 204);
    const stallId = new ObjectId(a.id);
    expect(await c.stalls.countDocuments({ _id: stallId })).toBe(0);
    expect(await c.foods.countDocuments({ stallId })).toBe(0);
    expect(await c.stallCategories.countDocuments({ stallId })).toBe(0);
    expect(await c.popularityCounters.countDocuments({ foodId: new ObjectId(food) })).toBe(0);
    expect(await c.accounts.countDocuments({ stallId })).toBe(0);
    await fails(call(a.s, 'GET', '/api/auth/me'), 401, 'UNAUTHENTICATED');
    for (const name of [img, unattached]) expect(existsSync(path.join(t.config.MEDIA_DIR, name))).toBe(false);
    await fails(call(root, 'DELETE', `/api/admin/stalls/${a.id}`), 404, 'NOT_FOUND');
  });

  it('an interrupted delete exposes nothing and completes on retry or restart', async () => {
    const a = await newStall('نیمه‌کاره', 'half-a');
    const sc = (await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/categories`, { name: 'x' }), 201)).id;
    await ok(call(a.s, 'POST', `/api/admin/stalls/${a.id}/foods`, foodBody(sc, { name: 'غذای نیمه‌کاره' })), 201);
    // Simulate a crash after step 2: stall marked, account gone, foods still present.
    const stallId = new ObjectId(a.id);
    await c.stalls.updateOne({ _id: stallId }, { $set: { deleting: true } });
    await c.accounts.deleteOne({ stallId });

    const menu = await ok(call(null, 'GET', '/api/public/menu'));
    expect(JSON.stringify(menu)).not.toContain('نیمه‌کاره');
    await fails(call(root, 'GET', `/api/admin/stalls/${a.id}`), 404, 'NOT_FOUND');
    expect((await ok(call(root, 'GET', '/api/admin/stalls'))).some((s: { id: string }) => s.id === a.id)).toBe(false);

    await resumeStallDeletions(t.app.ctx); // what server start does
    expect(await c.foods.countDocuments({ stallId })).toBe(0);
    expect(await c.stalls.countDocuments({ _id: stallId })).toBe(0);
  });
});
