import { ObjectId } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import {
  PopularityEventSchema,
  SearchQuerySchema,
  addDays,
  matchesTokens,
  searchTokens,
  tehranDate,
  tehranInstant,
  type PublicMenu,
  type PublicSearchResponse,
} from '@elay/shared';
import { AppError, notFound, parse } from '../errors.js';
import { mediaUrl } from '../media.js';
import { loadMenu, pricing, statusOf, toPublicFood, toPublicStall, topFive, type Menu } from './views.js';

const menuClosed = () => new AppError(403, 'MENU_CLOSED', 'منو الان در دسترس نیست.');

export async function publicRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  async function foodcourt() {
    const f = await ctx.c.foodcourt.findOne({ _id: 'foodcourt' });
    if (!f) throw notFound();
    return { name: f.name, logoUrl: mediaUrl(f.logo), menuOpen: f.menuOpen, closedMessage: f.closedMessage };
  }

  const stallFoodCounts = (menu: Menu) => {
    const n = new Map<string, number>();
    for (const f of menu.foods) n.set(f.stallId.toHexString(), (n.get(f.stallId.toHexString()) ?? 0) + 1);
    return n;
  };

  // The whole customer menu. While the super admin has closed the menu only the foodcourt block is returned.
  app.get('/api/public/menu', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    const fc = await foodcourt();
    const generatedAt = ctx.now().toISOString();
    if (!fc.menuOpen) {
      return { foodcourt: fc, categories: [], stalls: [], stallCategories: [], foods: [], dealIds: [], popularIds: [], generatedAt } satisfies PublicMenu;
    }
    const menu = await loadMenu(ctx);
    const perStall = stallFoodCounts(menu);
    const perCategory = new Map<string, number>();
    for (const f of menu.foods) perCategory.set(f.categoryId.toHexString(), (perCategory.get(f.categoryId.toHexString()) ?? 0) + 1);
    return {
      foodcourt: fc,
      categories: menu.categories.map((c) => ({
        id: c._id.toHexString(),
        name: c.name,
        icon: c.icon as PublicMenu['categories'][number]['icon'],
        sortOrder: c.sortOrder,
        foodCount: perCategory.get(c._id.toHexString()) ?? 0,
      })),
      stalls: menu.stalls.map((s) => toPublicStall(s, perStall.get(s._id.toHexString()) ?? 0)),
      stallCategories: menu.stallCategories.map((sc) => ({
        id: sc._id.toHexString(),
        stallId: sc.stallId.toHexString(),
        name: sc.name,
        sortOrder: sc.sortOrder,
      })),
      foods: menu.foods.map((f) => toPublicFood(f, menu.today)),
      dealIds: menu.foods
        .filter((f) => f.available && pricing(f, menu.today).discountPercent !== null)
        .map((f) => f._id.toHexString()),
      popularIds: topFive(menu).map((f) => f._id.toHexString()),
      generatedAt,
    } satisfies PublicMenu;
  });

  // Server-side search and filters (FilterSheet, category page stall chips).
  app.get('/api/public/search', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const q = parse(SearchQuerySchema, req.query);
    if (!(await foodcourt()).menuOpen) throw menuClosed();
    const menu = await loadMenu(ctx);
    const tokens = searchTokens(q.q ?? '');
    const stallById = new Map(menu.stalls.map((s) => [s._id.toHexString(), s]));
    const catName = new Map(menu.categories.map((c) => [c._id.toHexString(), c.name]));

    const foods = menu.foods.filter((f) => {
      const stall = stallById.get(f.stallId.toHexString())!;
      const price = pricing(f, menu.today);
      return (
        (!q.stallId || q.stallId === f.stallId.toHexString()) &&
        (!q.categoryId || q.categoryId === f.categoryId.toHexString()) &&
        (!q.onlyOpen || stall.status.isOpen) &&
        (!q.onlyDiscounted || price.discountPercent !== null) &&
        (q.minPrice === undefined || price.finalPrice >= q.minPrice) &&
        (q.maxPrice === undefined || price.finalPrice <= q.maxPrice) &&
        matchesTokens(tokens, f.name, f.description, stall.name, catName.get(f.categoryId.toHexString()) ?? '')
      );
    });
    const final = (f: (typeof foods)[number]) => pricing(f, menu.today).finalPrice;
    const adds = (f: (typeof foods)[number]) => menu.adds.get(f._id.toHexString()) ?? 0;
    // Array.prototype.sort is stable, so ties keep menu order.
    if (q.sort === 'cheapest') foods.sort((a, b) => final(a) - final(b));
    if (q.sort === 'priciest') foods.sort((a, b) => final(b) - final(a));
    if (q.sort === 'popular') foods.sort((a, b) => adds(b) - adds(a));

    const perStall = new Map<string, number>();
    for (const f of menu.foods) perStall.set(f.stallId.toHexString(), (perStall.get(f.stallId.toHexString()) ?? 0) + 1);
    const stalls = tokens.length
      ? menu.stalls.filter(
          (s) => matchesTokens(tokens, s.name) && (!q.onlyOpen || s.status.isOpen) && (!q.stallId || q.stallId === s._id.toHexString()),
        )
      : [];
    return {
      stalls: stalls.map((s) => toPublicStall(s, perStall.get(s._id.toHexString()) ?? 0)),
      foods: foods.map((f) => toPublicFood(f, menu.today)),
    } satisfies PublicSearchResponse;
  });

  // Anonymous "+" counter for popularity. No identifiers are stored; counts are approximate by design.
  app.post(
    '/api/public/popularity',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { foodId } = parse(PopularityEventSchema, req.body);
      if (!(await foodcourt()).menuOpen) throw menuClosed();
      // Two point lookups (not the whole menu): an existing food implies its stall has foods.
      const food = await ctx.c.foods.findOne({ _id: new ObjectId(foodId) });
      const stall = food && (await ctx.c.stalls.findOne({ _id: food.stallId, visible: true, deleting: { $ne: true } }));
      if (!food || !stall) throw notFound();
      if (!food.available) throw new AppError(409, 'CONFLICT', 'این غذا تموم شده است.');
      const now = ctx.now();
      if (!statusOf(stall, now).isOpen) throw new AppError(409, 'STALL_CLOSED', 'این غرفه الان بسته است.');
      const today = tehranDate(now);
      await ctx.c.popularityCounters.updateOne(
        { foodId: food._id, day: today },
        // Kept 30 days, then removed by the TTL index; only the last 7 are read.
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: tehranInstant(addDays(today, 30), 0) } },
        { upsert: true },
      );
      return reply.status(204).send();
    },
  );
}
