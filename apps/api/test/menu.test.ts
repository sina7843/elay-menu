// Public menu, search, promotions, popularity and closure. Clock: Sunday 2026-10-04 13:30 Tehran.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { PublicMenuSchema, PublicSearchResponseSchema, addDays, type PublicMenu } from '@elay/shared';
import { collections } from '../src/db.js';
import { seedDemo } from '../src/seed/demo.js';
import { authed, createAccount, login, setup, type TestEnv } from './helpers.js';

const NOW = new Date('2026-10-04T10:00:00Z');
const clock = { now: NOW };
let t: TestEnv;
let c: ReturnType<typeof collections>;

const food = async (seedKey: string) => (await c.foods.findOne({ seedKey }))!;
const stall = async (key: string) => (await c.stalls.findOne({ seedKey: `demo:stall:${key}` }))!;
const menu = async (): Promise<PublicMenu> => {
  const res = await t.app.inject('/api/public/menu');
  expect(res.statusCode).toBe(200);
  return PublicMenuSchema.parse(res.json()); // strict: no internal fields leak
};
const search = async (qs: string) => {
  const res = await t.app.inject(`/api/public/search?${qs}`);
  expect(res.statusCode).toBe(200);
  return PublicSearchResponseSchema.parse(res.json());
};
const plus = (foodId: string) => t.app.inject({ method: 'POST', url: '/api/public/popularity', payload: { foodId } });

beforeAll(async () => {
  t = await setup({}, clock);
  c = collections(t.db);
});
afterAll(() => t?.close());
beforeEach(async () => {
  clock.now = NOW;
  for (const name of ['stalls', 'categories', 'stallCategories', 'foods', 'popularityCounters'] as const) await c[name].deleteMany({});
  await c.foodcourt.updateOne({ _id: 'foodcourt' }, { $set: { menuOpen: true, closedMessage: '' } });
  await seedDemo(t.db, t.config.MEDIA_DIR, NOW);
});

describe('public menu', () => {
  it('returns the visible menu with safe fields, open/closed status and deals', async () => {
    const m = await menu();
    expect(m.stalls).toHaveLength(7);
    expect(m.foods).toHaveLength(9);
    expect(m.categories.map((x) => x.foodCount)).toEqual([2, 1, 1, 1, 1, 1, 1, 1]);
    const harmony = m.stalls.find((s) => s.name === 'هارمونی')!;
    expect(harmony.isOpen).toBe(false); // 18:00–02:00
    expect(harmony.opensAt).toBe('2026-10-04T14:30:00.000Z'); // 18:00 Tehran
    expect(m.stalls.find((s) => s.name === 'پیتزا چیزو')!.isOpen).toBe(true);
    const grill = m.foods.find((f) => f.name === 'میکس گریل دو نفره')!;
    expect([grill.price, grill.finalPrice, grill.discountPercent]).toEqual([890_000, 712_000, 20]);
    expect(m.dealIds).toHaveLength(4);
    expect(m.popularIds).toEqual([]);
  });

  it('keeps sold-out foods in lists but not in deals', async () => {
    const baklava = await food('demo:food:dokhan-dokan:baklava');
    await c.foods.updateOne({ _id: baklava._id }, { $set: { available: false } });
    const m = await menu();
    expect(m.foods.find((f) => f.id === baklava._id.toHexString())!.available).toBe(false);
    expect(m.dealIds).not.toContain(baklava._id.toHexString());
  });

  it('hides invisible, empty and being-deleted stalls together with their foods', async () => {
    await c.stalls.updateOne({ seedKey: 'demo:stall:hayat' }, { $set: { visible: false } });
    await c.stalls.updateOne({ seedKey: 'demo:stall:khoroos' }, { $set: { deleting: true } });
    const empty = await stall('blu-burger');
    await c.foods.deleteMany({ stallId: empty._id });
    const m = await menu();
    expect(m.stalls.map((s) => s.name).sort()).toEqual(['پیتزا چیزو', 'گریل‌آپ', 'هارمونی', 'دوخان دکان'].sort());
    expect(m.foods).toHaveLength(6);
    expect(m.categories.find((x) => x.icon === 'sandwich')!.foodCount).toBe(0);
    expect(JSON.stringify(m)).not.toMatch(/حیاط|بروستد|بلو برگر/);
    expect((await search('q=ساندویچ')).foods).toHaveLength(0);
    const hidden = await food('demo:food:hayat:special');
    expect((await plus(hidden._id.toHexString())).statusCode).toBe(404);
  });

  it('applies discounts by Tehran calendar day, inclusive of the last day', async () => {
    const grill = await food('demo:food:grill-up:mix-grill');
    await c.foods.updateOne({ _id: grill._id }, { $set: { 'discount.endDate': '2026-10-04' } });
    clock.now = new Date('2026-10-04T20:29:00Z'); // 23:59 Tehran
    expect((await menu()).foods.find((f) => f.id === grill._id.toHexString())!.finalPrice).toBe(712_000);
    clock.now = new Date('2026-10-04T20:30:00Z'); // 00:00 next day
    const m = await menu();
    expect(m.foods.find((f) => f.id === grill._id.toHexString())!.finalPrice).toBe(890_000);
    expect(m.dealIds).not.toContain(grill._id.toHexString());
  });
});

describe('global closure', () => {
  it('blocks every customer endpoint while admins keep access', async () => {
    await c.foodcourt.updateOne({ _id: 'foodcourt' }, { $set: { menuOpen: false, closedMessage: 'تا ساعت ۱۸ بسته‌ایم' } });
    const m = await menu();
    expect(m.foodcourt).toMatchObject({ menuOpen: false, closedMessage: 'تا ساعت ۱۸ بسته‌ایم' });
    expect([m.stalls, m.foods, m.categories, m.stallCategories, m.dealIds, m.popularIds].every((l) => l.length === 0)).toBe(true);
    expect((await t.app.inject('/api/public/search?q=پیتزا')).json().error.code).toBe('MENU_CLOSED');
    const pizza = await food('demo:food:cheezo:pepperoni');
    expect((await plus(pizza._id.toHexString())).json().error.code).toBe('MENU_CLOSED');

    await createAccount(t.db, 'closedroot', 'closedroot1', 'super_admin').catch(() => undefined);
    const root = await login(t.app, 'closedroot', 'closedroot1');
    expect((await t.app.inject({ url: '/api/admin/stalls', headers: authed(root) })).statusCode).toBe(200);
  });
});

describe('popularity', () => {
  it('counts "+" per Tehran day and ranks the last 7 days, ties by id, max five, no sold-out', async () => {
    const all = (await c.foods.find().toArray()).sort((a, b) => a._id.toHexString().localeCompare(b._id.toHexString()));
    const today = '2026-10-04';
    const put = (f: (typeof all)[number], day: string, count: number) =>
      c.popularityCounters.insertOne({ _id: new ObjectId(), foodId: f._id, day, count, expiresAt: new Date('2027-01-01') });
    await put(all[0]!, today, 3);
    await put(all[1]!, addDays(today, -6), 3); // edge of window, ties with all[0]
    await put(all[2]!, addDays(today, -7), 50); // outside window
    await put(all[3]!, today, 9);
    await put(all[4]!, today, 1);
    await put(all[5]!, today, 2);
    await put(all[6]!, today, 1);
    await put(all[7]!, today, 99);
    await c.foods.updateOne({ _id: all[7]!._id }, { $set: { available: false } });
    const ids = (await menu()).popularIds;
    const hex = (i: number) => all[i]!._id.toHexString();
    expect(ids).toEqual([hex(3), hex(0), hex(1), hex(5), hex(4)]); // 9, 3, 3 (id order), 2, then 1 (lower id of the two 1s)
    const ranked = (await search('sort=popular')).foods.map((f) => f.id);
    expect(ranked[0]).toBe(hex(7)); // sold-out still listed in ordinary search results
  });

  it('increment endpoint validates, refuses closed stalls and sold-out foods, and uses the Tehran day', async () => {
    const pizza = await food('demo:food:cheezo:pepperoni');
    const sushi = await food('demo:food:harmony:california');
    expect((await plus(pizza._id.toHexString())).statusCode).toBe(204);
    expect((await plus(pizza._id.toHexString())).statusCode).toBe(204);
    expect((await c.popularityCounters.findOne({ foodId: pizza._id }))!).toMatchObject({ day: '2026-10-04', count: 2 });
    expect((await plus(sushi._id.toHexString())).json().error.code).toBe('STALL_CLOSED');
    await c.foods.updateOne({ _id: pizza._id }, { $set: { available: false } });
    expect((await plus(pizza._id.toHexString())).statusCode).toBe(409);
    expect((await plus('nope')).statusCode).toBe(400);
    expect((await plus(new ObjectId().toHexString())).statusCode).toBe(404);
    const extra = await t.app.inject({ method: 'POST', url: '/api/public/popularity', payload: { foodId: pizza._id.toHexString(), ip: 'x' } });
    expect(extra.statusCode).toBe(400);

    await c.foods.updateOne({ _id: pizza._id }, { $set: { available: true } });
    clock.now = new Date('2026-10-04T20:31:00Z'); // 00:01 Monday Tehran; cheezo open until 24:00 Sunday → now closed
    await c.stalls.updateOne({ _id: pizza.stallId }, { $set: { manualOverride: { state: 'open', until: null } } });
    expect((await plus(pizza._id.toHexString())).statusCode).toBe(204);
    expect(await c.popularityCounters.findOne({ foodId: pizza._id, day: '2026-10-05' })).toMatchObject({ count: 1 });
    const doc = await c.popularityCounters.findOne({ foodId: pizza._id });
    expect(Object.keys(doc!).sort()).toEqual(['_id', 'count', 'day', 'expiresAt', 'foodId']); // anonymous
  });

  it('rate-limits increments', async () => {
    const pizza = (await food('demo:food:cheezo:pepperoni'))._id.toHexString();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await plus(pizza)).statusCode;
    expect(last).toBe(429);
  });
});

describe('search', () => {
  it('normalises Persian letters and spans food, description, stall and category', async () => {
    expect((await search('q=كباب')).foods.map((f) => f.name)).toEqual(['کباب کوبیده']);
    expect((await search('q=زعفرانی')).foods.map((f) => f.name)).toEqual(['کباب کوبیده']);
    const byStall = await search('q=چیزو');
    expect(byStall.stalls.map((s) => s.name)).toEqual(['پیتزا چیزو']);
    expect(byStall.foods).toHaveLength(2);
    expect((await search('q=سوخاری')).foods.map((f) => f.name)).toEqual(['بروستد چهار تکه']);
    expect((await search(`q=${encodeURIComponent('سوشی ۸')}`)).foods).toHaveLength(1);
  });

  it('filters by open stalls, discounts, price band, stall and category, and sorts', async () => {
    expect((await search('onlyOpen=true')).foods.some((f) => f.name.includes('سوشی'))).toBe(false);
    expect((await search('onlyDiscounted=true')).foods).toHaveLength(4);
    const band = await search('minPrice=200000&maxPrice=400000');
    expect(band.foods.every((f) => f.finalPrice >= 200_000 && f.finalPrice <= 400_000)).toBe(true);
    expect(band.foods.map((f) => f.name)).toContain('پیتزا مخصوص چیزو'); // 425,000 → 361,000 after discount
    const cheap = (await search('sort=cheapest')).foods.map((f) => f.finalPrice);
    expect(cheap).toEqual([...cheap].sort((a, b) => a - b));
    const s = await stall('dokhan-dokan');
    expect((await search(`stallId=${s._id}`)).foods).toHaveLength(2);
    const pizzaCat = (await c.categories.findOne({ icon: 'pizza' }))!;
    expect((await search(`categoryId=${pizzaCat._id}`)).foods).toHaveLength(2);
    for (const bad of ['sort=random', 'minPrice=', 'minPrice=1e3', 'minPrice=500000&maxPrice=100000']) {
      expect((await t.app.inject(`/api/public/search?${bad}`)).statusCode, bad).toBe(400);
    }
  });
});
