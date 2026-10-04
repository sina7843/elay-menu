// Everything scoped to one stall. Every route runs requireStallAccess first, so a stall admin can only
// reach their own stall; super admins reach all. Child ids are always matched together with stallId.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ObjectId } from 'mongodb';
import {
  AvailabilityInputSchema,
  FoodInputSchema,
  ManualStatusInputSchema,
  ReorderInputSchema,
  StallCategoryInputSchema,
  StallProfileInputSchema,
  overrideFor,
  reanchorOverride,
  tehranDate,
  type AdminStallCategory,
} from '@elay/shared';
import { requireAccount, requireStallAccess } from '../auth/guards.js';
import type { FoodDoc, StallDoc } from '../db.js';
import { parse } from '../errors.js';
import { assertAttachable, releaseMedia, storeUpload } from '../media.js';
import { countFoods, toAdminFood, toAdminStall } from '../menu/views.js';
import { conflict, fieldError, findOr404, nextSortOrder, oid, reorder } from '../util.js';

type P = { stallId: string; id?: string };

export async function stallRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { c } = ctx;

  /** Guard + load the (non-deleting) stall. */
  async function stallFor(req: FastifyRequest<{ Params: P }>): Promise<StallDoc> {
    const stallId = oid(req.params.stallId);
    await requireStallAccess(req, stallId.toHexString());
    return findOr404(c.stalls, { _id: stallId, deleting: { $ne: true } });
  }

  async function adminStall(s: StallDoc) {
    const account = await c.accounts.findOne({ stallId: s._id, role: 'stall_admin' });
    return toAdminStall(s, ctx.now(), await c.foods.countDocuments({ stallId: s._id }), account?.username ?? null);
  }

  // ---------- stall profile and status ----------

  app.get<{ Params: P }>('/api/admin/stalls/:stallId', async (req) => adminStall(await stallFor(req)));

  app.put<{ Params: P }>('/api/admin/stalls/:stallId/profile', async (req) => {
    const s = await stallFor(req);
    const input = parse(StallProfileInputSchema, req.body);
    const manualOverride = reanchorOverride(input.weeklyHours, s.manualOverride, ctx.now());
    await c.stalls.updateOne({ _id: s._id }, { $set: { ...input, manualOverride, updatedAt: ctx.now() } });
    return adminStall({ ...s, ...input, manualOverride });
  });

  // "الان باز است" switch: inverts the schedule until the next scheduled opening start.
  app.put<{ Params: P }>('/api/admin/stalls/:stallId/manual-status', async (req) => {
    const s = await stallFor(req);
    const { isOpen } = parse(ManualStatusInputSchema, req.body);
    const manualOverride = overrideFor(s.weeklyHours, isOpen, ctx.now());
    await c.stalls.updateOne({ _id: s._id }, { $set: { manualOverride, updatedAt: ctx.now() } });
    return adminStall({ ...s, manualOverride });
  });

  // ---------- stall categories ----------

  const stallCategoryView = (sc: { _id: ObjectId; stallId: ObjectId; name: string; sortOrder: number }, n: number): AdminStallCategory => ({
    id: sc._id.toHexString(),
    stallId: sc.stallId.toHexString(),
    name: sc.name,
    sortOrder: sc.sortOrder,
    foodCount: n,
  });

  app.get<{ Params: P }>('/api/admin/stalls/:stallId/categories', async (req) => {
    const s = await stallFor(req);
    const counts = await countFoods(ctx, 'stallCategoryId', { stallId: s._id });
    const list = await c.stallCategories.find({ stallId: s._id }).sort({ sortOrder: 1, _id: 1 }).toArray();
    return list.map((sc) => stallCategoryView(sc, counts.get(sc._id.toHexString()) ?? 0));
  });

  app.post<{ Params: P }>('/api/admin/stalls/:stallId/categories', async (req, reply) => {
    const s = await stallFor(req);
    const { name } = parse(StallCategoryInputSchema, req.body);
    const doc = { _id: new ObjectId(), stallId: s._id, name, sortOrder: await nextSortOrder(c.stallCategories, { stallId: s._id }), isDemo: false };
    await c.stallCategories.insertOne(doc);
    return reply.status(201).send(stallCategoryView(doc, 0));
  });

  app.put<{ Params: P }>('/api/admin/stalls/:stallId/categories/order', async (req) => {
    const s = await stallFor(req);
    await reorder(c.stallCategories, { stallId: s._id }, parse(ReorderInputSchema, req.body).ids);
    return { ok: true };
  });

  app.patch<{ Params: P }>('/api/admin/stalls/:stallId/categories/:id', async (req) => {
    const s = await stallFor(req);
    const { name } = parse(StallCategoryInputSchema, req.body);
    const sc = await findOr404(c.stallCategories, { _id: oid(req.params.id!), stallId: s._id });
    await c.stallCategories.updateOne({ _id: sc._id }, { $set: { name } });
    return stallCategoryView({ ...sc, name }, await c.foods.countDocuments({ stallCategoryId: sc._id }));
  });

  app.delete<{ Params: P }>('/api/admin/stalls/:stallId/categories/:id', async (req, reply) => {
    const s = await stallFor(req);
    const sc = await findOr404(c.stallCategories, { _id: oid(req.params.id!), stallId: s._id });
    // ponytail: check-then-delete is not atomic; a food saved in the same instant could reference the deleted
    // category. Acceptable for one admin per stall; add a transaction (replica set) if concurrent editing appears.
    if (await c.foods.countDocuments({ stallCategoryId: sc._id }, { limit: 1 })) {
      throw conflict('این دسته غذا دارد. اول غذاهایش را به دسته‌ی دیگری ببرید یا حذف کنید.');
    }
    await c.stallCategories.deleteOne({ _id: sc._id });
    return reply.status(204).send();
  });

  // ---------- foods ----------

  /** Category relations and image ownership are validated server-side. */
  async function validateFood(s: StallDoc, body: unknown, current: FoodDoc | null) {
    const input = parse(FoodInputSchema, body);
    if (!(await c.categories.countDocuments({ _id: new ObjectId(input.categoryId) }, { limit: 1 }))) {
      throw fieldError('categoryId', 'دسته‌ی فودکورت پیدا نشد.');
    }
    if (!(await c.stallCategories.countDocuments({ _id: new ObjectId(input.stallCategoryId), stallId: s._id }, { limit: 1 }))) {
      throw fieldError('stallCategoryId', 'دسته‌ی منوی غرفه پیدا نشد.');
    }
    await assertAttachable(ctx, input.image, current?.image ?? null, 'food', s._id, 'image');
    return {
      ...input,
      categoryId: new ObjectId(input.categoryId),
      stallCategoryId: new ObjectId(input.stallCategoryId),
    };
  }

  const foodFor = (s: StallDoc, id: string) => findOr404(c.foods, { _id: oid(id), stallId: s._id });
  const today = () => tehranDate(ctx.now());

  app.get<{ Params: P }>('/api/admin/stalls/:stallId/foods', async (req) => {
    const s = await stallFor(req);
    const foods = await c.foods.find({ stallId: s._id }).sort({ _id: 1 }).toArray();
    return foods.map((f) => toAdminFood(f, today()));
  });

  app.post<{ Params: P }>('/api/admin/stalls/:stallId/foods', async (req, reply) => {
    const s = await stallFor(req);
    const now = ctx.now();
    const doc: FoodDoc = { _id: new ObjectId(), stallId: s._id, ...(await validateFood(s, req.body, null)), isDemo: false, createdAt: now, updatedAt: now };
    await c.foods.insertOne(doc);
    return reply.status(201).send(toAdminFood(doc, today()));
  });

  app.get<{ Params: P }>('/api/admin/stalls/:stallId/foods/:id', async (req) => {
    const s = await stallFor(req);
    return toAdminFood(await foodFor(s, req.params.id!), today());
  });

  app.put<{ Params: P }>('/api/admin/stalls/:stallId/foods/:id', async (req) => {
    const s = await stallFor(req);
    const food = await foodFor(s, req.params.id!);
    const update = { ...(await validateFood(s, req.body, food)), updatedAt: ctx.now() };
    await c.foods.updateOne({ _id: food._id }, { $set: update });
    if (food.image !== update.image) await releaseMedia(ctx, food.image);
    return toAdminFood({ ...food, ...update }, today());
  });

  // Availability switch in the food list: saved immediately.
  app.put<{ Params: P }>('/api/admin/stalls/:stallId/foods/:id/availability', async (req) => {
    const s = await stallFor(req);
    const { available } = parse(AvailabilityInputSchema, req.body);
    const food = await foodFor(s, req.params.id!);
    await c.foods.updateOne({ _id: food._id }, { $set: { available, updatedAt: ctx.now() } });
    return toAdminFood({ ...food, available }, today());
  });

  app.delete<{ Params: P }>('/api/admin/stalls/:stallId/foods/:id', async (req, reply) => {
    const s = await stallFor(req);
    const food = await foodFor(s, req.params.id!);
    await c.foods.deleteOne({ _id: food._id });
    await c.popularityCounters.deleteMany({ foodId: food._id });
    await releaseMedia(ctx, food.image);
    return reply.status(204).send();
  });

  // Square-cropped food photo; raw image body (Content-Type image/png|jpeg|webp).
  app.post<{ Params: P }>('/api/admin/stalls/:stallId/media/food-image', async (req, reply) => {
    const s = await stallFor(req);
    return reply.status(201).send(await storeUpload(ctx, req.body, req.headers['content-type'], 'food', s._id));
  });

  // ---------- foodcourt-wide categories (read: both roles, for CategoryPicker) ----------

  app.get('/api/admin/categories', async (req) => {
    await requireAccount(req);
    const counts = await countFoods(ctx, 'categoryId');
    const list = await c.categories.find().sort({ sortOrder: 1, _id: 1 }).toArray();
    return list.map((x) => ({
      id: x._id.toHexString(),
      name: x.name,
      icon: x.icon,
      sortOrder: x.sortOrder,
      foodCount: counts.get(x._id.toHexString()) ?? 0,
    }));
  });
}
