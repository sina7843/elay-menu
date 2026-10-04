import type { ObjectId } from 'mongodb';
import type { Ctx } from '../app.js';
import { deleteAccount } from '../auth/sessions.js';
import { releaseMedia } from '../media.js';

/**
 * Cascade delete without transactions (standalone MongoDB), written to be resumable:
 *  1. mark the stall `deleting` — from now on it and its foods are invisible to customers and admins;
 *  2. delete the stall admin account and its sessions;
 *  3. delete counters, foods and stall categories;
 *  4. delete the stall itself, then release media nothing references any more.
 * Every step is idempotent, so a failure part-way is completed by calling this again
 * (the DELETE endpoint retries it and server start resumes any stall left `deleting`).
 */
export async function deleteStall(ctx: Ctx, stallId: ObjectId) {
  const { c } = ctx;
  const stall = await c.stalls.findOne({ _id: stallId });
  if (!stall) return;
  await c.stalls.updateOne({ _id: stallId }, { $set: { deleting: true } });

  for (const account of await c.accounts.find({ stallId }).toArray()) await deleteAccount(c, account._id);

  const foods = await c.foods.find({ stallId }, { projection: { _id: 1, image: 1 } }).toArray();
  await c.popularityCounters.deleteMany({ foodId: { $in: foods.map((f) => f._id) } });
  await c.foods.deleteMany({ stallId });
  await c.stallCategories.deleteMany({ stallId });
  await c.stalls.deleteOne({ _id: stallId });
  // A request that passed its stall check just before `deleting` was set may still have inserted children.
  await c.foods.deleteMany({ stallId });
  await c.stallCategories.deleteMany({ stallId });

  const owned = await c.media.find({ stallId }, { projection: { _id: 1 } }).toArray();
  for (const name of new Set([stall.logo, ...foods.map((f) => f.image), ...owned.map((m) => m._id)])) {
    await releaseMedia(ctx, name);
  }
}

export async function resumeStallDeletions(ctx: Ctx) {
  for (const s of await ctx.c.stalls.find({ deleting: true }, { projection: { _id: 1 } }).toArray()) {
    await deleteStall(ctx, s._id);
  }
}
