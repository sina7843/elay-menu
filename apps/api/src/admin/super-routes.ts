// Super-admin only: stalls and their accounts, foodcourt categories, foodcourt settings, logos.
import type { FastifyInstance } from 'fastify';
import { MongoServerError, ObjectId } from 'mongodb';
import {
  AccountUsernameInputSchema,
  DEFAULT_WEEKLY_HOURS,
  FoodcourtInputSchema,
  GlobalCategoryInputSchema,
  ReorderInputSchema,
  StallCreateInputSchema,
  StallUpdateInputSchema,
  type AdminCategory,
  type AdminFoodcourt,
  type TemporaryPasswordResponse,
} from '@elay/shared';
import { requireRole } from '../auth/guards.js';
import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { resetToTemporaryPassword } from '../auth/sessions.js';
import type { CategoryDoc, StallDoc } from '../db.js';
import { notFound, parse } from '../errors.js';
import { assertAttachable, mediaUrl, releaseMedia, storeUpload } from '../media.js';
import { countFoods, toAdminStall } from '../menu/views.js';
import { conflict, findOr404, nextSortOrder, oid, reorder } from '../util.js';
import { deleteStall } from './delete-stall.js';

type P = { stallId: string; id: string };

const usernameTaken = () => conflict('این نام کاربری قبلاً استفاده شده است.');
const isDuplicateKey = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

export async function superRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { c } = ctx;
  const live = { deleting: { $ne: true } } as const;

  // ---------- stalls ----------

  app.get('/api/admin/stalls', async (req) => {
    await requireRole(req, 'super_admin');
    const [stalls, counts, accounts] = await Promise.all([
      c.stalls.find(live).sort({ sortOrder: 1, _id: 1 }).toArray(),
      countFoods(ctx, 'stallId'),
      c.accounts.find({ role: 'stall_admin' }).toArray(),
    ]);
    const owner = new Map(accounts.map((a) => [a.stallId?.toHexString(), a.username]));
    return stalls.map((s) => toAdminStall(s, ctx.now(), counts.get(s._id.toHexString()) ?? 0, owner.get(s._id.toHexString()) ?? null));
  });

  // Creates the stall and its manager account; the temporary password is in this response only.
  app.post('/api/admin/stalls', async (req, reply) => {
    await requireRole(req, 'super_admin');
    const input = parse(StallCreateInputSchema, req.body);
    if (await c.accounts.countDocuments({ username: input.adminUsername }, { limit: 1 })) throw usernameTaken();
    await assertAttachable(ctx, input.logo, null, 'stall-logo', null, 'logo');

    const now = ctx.now();
    const stall: StallDoc = {
      _id: new ObjectId(),
      name: input.name,
      intro: '',
      logo: input.logo,
      weeklyHours: DEFAULT_WEEKLY_HOURS,
      manualOverride: null,
      sortOrder: await nextSortOrder(c.stalls, {}),
      visible: input.visible,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    };
    // ponytail: two writes without a transaction; a crash between them leaves a stall without a manager,
    // recoverable only by deleting it. Add a transaction if MongoDB runs as a replica set.
    await c.stalls.insertOne(stall);
    const temporaryPassword = generateTemporaryPassword();
    try {
      await c.accounts.insertOne({
        _id: new ObjectId(),
        username: input.adminUsername,
        passwordHash: await hashPassword(temporaryPassword),
        role: 'stall_admin',
        stallId: stall._id,
        createdAt: now,
        passwordChangedAt: now,
      });
    } catch (e) {
      await c.stalls.deleteOne({ _id: stall._id }); // never leave a stall without its manager
      if (isDuplicateKey(e)) throw usernameTaken();
      throw e;
    }
    return reply.status(201).send({
      stall: toAdminStall(stall, now, 0, input.adminUsername),
      credentials: { username: input.adminUsername, temporaryPassword } satisfies TemporaryPasswordResponse,
    });
  });

  app.put('/api/admin/stalls/order', async (req) => {
    await requireRole(req, 'super_admin');
    await reorder(c.stalls, live, parse(ReorderInputSchema, req.body).ids);
    return { ok: true };
  });

  app.patch<{ Params: P }>('/api/admin/stalls/:stallId', async (req) => {
    await requireRole(req, 'super_admin');
    const s = await findOr404(c.stalls, { _id: oid(req.params.stallId), ...live });
    const input = parse(StallUpdateInputSchema, req.body);
    await assertAttachable(ctx, input.logo, s.logo, 'stall-logo', null, 'logo');
    await c.stalls.updateOne({ _id: s._id }, { $set: { ...input, updatedAt: ctx.now() } });
    if (s.logo !== input.logo) await releaseMedia(ctx, s.logo);
    const account = await c.accounts.findOne({ stallId: s._id });
    return toAdminStall({ ...s, ...input }, ctx.now(), await c.foods.countDocuments({ stallId: s._id }), account?.username ?? null);
  });

  app.delete<{ Params: P }>('/api/admin/stalls/:stallId', async (req, reply) => {
    await requireRole(req, 'super_admin');
    const stallId = oid(req.params.stallId);
    if (!(await c.stalls.countDocuments({ _id: stallId }, { limit: 1 }))) throw notFound();
    await deleteStall(ctx, stallId); // also completes a previously interrupted delete
    return reply.status(204).send();
  });

  // ---------- stall manager account ----------

  async function stallAccount(stallIdParam: string) {
    const s = await findOr404(c.stalls, { _id: oid(stallIdParam), ...live });
    const account = await c.accounts.findOne({ stallId: s._id, role: 'stall_admin' });
    if (!account) throw notFound();
    return account;
  }

  app.put<{ Params: P }>('/api/admin/stalls/:stallId/account', async (req) => {
    await requireRole(req, 'super_admin');
    const account = await stallAccount(req.params.stallId);
    const { username } = parse(AccountUsernameInputSchema, req.body);
    try {
      await c.accounts.updateOne({ _id: account._id }, { $set: { username } });
    } catch (e) {
      if (isDuplicateKey(e)) throw usernameTaken();
      throw e;
    }
    return { username };
  });

  // «رمز تازه»: old password and every session stop working immediately.
  app.post<{ Params: P }>('/api/admin/stalls/:stallId/account/reset-password', async (req) => {
    await requireRole(req, 'super_admin');
    const account = await stallAccount(req.params.stallId);
    const temporaryPassword = await resetToTemporaryPassword(c, account._id);
    return { username: account.username, temporaryPassword } satisfies TemporaryPasswordResponse;
  });

  // ---------- foodcourt categories (list is in stall-routes, readable by both roles) ----------

  const categoryView = (x: CategoryDoc, n: number, stalls = 0): AdminCategory => ({
    id: x._id.toHexString(),
    name: x.name,
    icon: x.icon as AdminCategory['icon'],
    sortOrder: x.sortOrder,
    foodCount: n,
    stallCount: stalls,
  });

  app.post('/api/admin/categories', async (req, reply) => {
    await requireRole(req, 'super_admin');
    const input = parse(GlobalCategoryInputSchema, req.body);
    const doc: CategoryDoc = { _id: new ObjectId(), ...input, sortOrder: await nextSortOrder(c.categories, {}), isDemo: false };
    await c.categories.insertOne(doc);
    return reply.status(201).send(categoryView(doc, 0));
  });

  app.put('/api/admin/categories/order', async (req) => {
    await requireRole(req, 'super_admin');
    await reorder(c.categories, {}, parse(ReorderInputSchema, req.body).ids);
    return { ok: true };
  });

  app.patch<{ Params: P }>('/api/admin/categories/:id', async (req) => {
    await requireRole(req, 'super_admin');
    const cat = await findOr404(c.categories, { _id: oid(req.params.id) });
    const input = parse(GlobalCategoryInputSchema, req.body);
    await c.categories.updateOne({ _id: cat._id }, { $set: input });
    const stalls = await c.foods.distinct('stallId', { categoryId: cat._id });
    return categoryView({ ...cat, ...input }, await c.foods.countDocuments({ categoryId: cat._id }), stalls.length);
  });

  app.delete<{ Params: P }>('/api/admin/categories/:id', async (req, reply) => {
    await requireRole(req, 'super_admin');
    const cat = await findOr404(c.categories, { _id: oid(req.params.id) });
    // ponytail: same check-then-delete race as stall categories (see stall-routes.ts).
    if (await c.foods.countDocuments({ categoryId: cat._id }, { limit: 1 })) {
      throw conflict('این دسته غذا دارد و حذف نمی‌شود.');
    }
    await c.categories.deleteOne({ _id: cat._id });
    return reply.status(204).send();
  });

  // ---------- foodcourt settings ----------

  async function foodcourtView(): Promise<AdminFoodcourt> {
    const f = await c.foodcourt.findOne({ _id: 'foodcourt' });
    if (!f) throw notFound();
    return {
      name: f.name,
      logo: f.logo,
      logoUrl: mediaUrl(f.logo),
      menuOpen: f.menuOpen,
      closedMessage: f.closedMessage,
      publicMenuUrl: ctx.config.PUBLIC_MENU_URL || null, // deployment config, never editable here
    };
  }

  app.get('/api/admin/foodcourt', async (req) => {
    await requireRole(req, 'super_admin');
    return foodcourtView();
  });

  app.put('/api/admin/foodcourt', async (req) => {
    await requireRole(req, 'super_admin');
    const input = parse(FoodcourtInputSchema, req.body);
    const before = await c.foodcourt.findOne({ _id: 'foodcourt' });
    await assertAttachable(ctx, input.logo, before?.logo ?? null, 'foodcourt-logo', null, 'logo');
    await c.foodcourt.updateOne({ _id: 'foodcourt' }, { $set: { ...input, updatedAt: ctx.now() } }, { upsert: true });
    if (before?.logo !== input.logo) await releaseMedia(ctx, before?.logo);
    return foodcourtView();
  });

  // ---------- logos (raw image body: PNG or SVG) ----------

  app.post('/api/admin/media/stall-logo', async (req, reply) => {
    await requireRole(req, 'super_admin');
    return reply.status(201).send(await storeUpload(ctx, req.body, req.headers['content-type'], 'stall-logo', null));
  });

  app.post('/api/admin/media/foodcourt-logo', async (req, reply) => {
    await requireRole(req, 'super_admin');
    return reply.status(201).send(await storeUpload(ctx, req.body, req.headers['content-type'], 'foodcourt-logo', null));
  });
}
