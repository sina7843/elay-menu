import type { ObjectId } from 'mongodb';
import {
  activeDiscountPercent,
  addDays,
  discountedPrice,
  stallStatus,
  tehranDate,
  type AdminFood,
  type AdminStall,
  type FoodInput,
  type PublicFood,
  type PublicStall,
} from '@elay/shared';
import type { Ctx } from '../app.js';
import type { CategoryDoc, FoodDoc, StallCategoryDoc, StallDoc } from '../db.js';
import { mediaUrl } from '../media.js';

const id = (o: ObjectId) => o.toHexString();

export function statusOf(s: StallDoc, now: Date) {
  const st = stallStatus(s.weeklyHours, s.manualOverride, now);
  return { isOpen: st.isOpen, opensAt: st.opensAt?.toISOString() ?? null, closesAt: st.closesAt?.toISOString() ?? null };
}

export function pricing(f: FoodDoc, today: string) {
  const percent = activeDiscountPercent(f.discount, today);
  return { finalPrice: percent === null ? f.price : discountedPrice(f.price, percent), discountPercent: percent };
}

export const toPublicFood = (f: FoodDoc, today: string): PublicFood => ({
  id: id(f._id),
  stallId: id(f.stallId),
  categoryId: id(f.categoryId),
  stallCategoryId: id(f.stallCategoryId),
  name: f.name,
  description: f.description,
  price: f.price,
  ...pricing(f, today),
  imageUrl: mediaUrl(f.image),
  tint: f.tint as PublicFood['tint'],
  available: f.available,
});

export const toAdminFood = (f: FoodDoc, today: string): AdminFood => {
  const p = pricing(f, today);
  return {
    id: id(f._id),
    stallId: id(f.stallId),
    name: f.name,
    description: f.description,
    price: f.price,
    image: f.image,
    imageUrl: mediaUrl(f.image),
    tint: f.tint as FoodInput['tint'],
    categoryId: id(f.categoryId),
    stallCategoryId: id(f.stallCategoryId),
    available: f.available,
    discount: f.discount,
    finalPrice: p.finalPrice,
    discountActive: p.discountPercent !== null,
  };
};

export const toAdminStall = (s: StallDoc, now: Date, foodCount: number, adminUsername: string | null): AdminStall => ({
  id: id(s._id),
  name: s.name,
  intro: s.intro,
  logo: s.logo,
  logoUrl: mediaUrl(s.logo),
  weeklyHours: s.weeklyHours,
  manualOverride: s.manualOverride && { state: s.manualOverride.state, until: s.manualOverride.until?.toISOString() ?? null },
  ...statusOf(s, now),
  sortOrder: s.sortOrder,
  visible: s.visible,
  isDemo: s.isDemo,
  foodCount,
  adminUsername,
});

/** Food counts keyed by the hex id of `field`. */
export async function countFoods(ctx: Ctx, field: 'stallId' | 'categoryId' | 'stallCategoryId', match: object = {}) {
  const rows = await ctx.c.foods
    .aggregate<{ _id: ObjectId; n: number }>([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }])
    .toArray();
  return new Map(rows.map((r) => [id(r._id), r.n]));
}

/** Seven-day "+" counts: today and the six previous Tehran dates. */
export async function weeklyAdds(ctx: Ctx, now: Date): Promise<Map<string, number>> {
  const today = tehranDate(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const rows = await ctx.c.popularityCounters
    .aggregate<{ _id: ObjectId; n: number }>([
      { $match: { day: { $in: days } } },
      { $group: { _id: '$foodId', n: { $sum: '$count' } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [id(r._id), r.n]));
}

export interface Menu {
  now: Date;
  today: string;
  stalls: (StallDoc & { status: { isOpen: boolean; opensAt: string | null; closesAt: string | null } })[];
  categories: CategoryDoc[];
  stallCategories: StallCategoryDoc[];
  /** Foods of visible stalls, in menu order (stall, stall category, creation). */
  foods: FoodDoc[];
  adds: Map<string, number>;
}

/**
 * Everything a customer may see. Invisible stalls, stalls being deleted and stalls without foods
 * are excluded, and so are their foods and stall categories.
 * ponytail: loads the whole menu per request (one food court, hundreds of foods); add caching if it shows up in profiles.
 */
export async function loadMenu(ctx: Ctx): Promise<Menu> {
  const now = ctx.now();
  const { c } = ctx;
  const candidates = await c.stalls.find({ visible: true, deleting: { $ne: true } }).sort({ sortOrder: 1, _id: 1 }).toArray();
  const allFoods = await c.foods.find({ stallId: { $in: candidates.map((s) => s._id) } }).toArray();
  const withFoods = new Set(allFoods.map((f) => id(f.stallId)));
  const stalls = candidates.filter((s) => withFoods.has(id(s._id))).map((s) => ({ ...s, status: statusOf(s, now) }));
  const stallCategories = await c.stallCategories
    .find({ stallId: { $in: stalls.map((s) => s._id) } })
    .sort({ sortOrder: 1, _id: 1 })
    .toArray();

  const stallRank = new Map(stalls.map((s, i) => [id(s._id), i]));
  const catRank = new Map(stallCategories.map((sc, i) => [id(sc._id), i]));
  const foods = allFoods.sort(
    (a, b) =>
      stallRank.get(id(a.stallId))! - stallRank.get(id(b.stallId))! ||
      (catRank.get(id(a.stallCategoryId)) ?? 0) - (catRank.get(id(b.stallCategoryId)) ?? 0) ||
      id(a._id).localeCompare(id(b._id)),
  );
  return {
    now,
    today: tehranDate(now),
    stalls,
    categories: await c.categories.find().sort({ sortOrder: 1, _id: 1 }).toArray(),
    stallCategories,
    foods,
    adds: await weeklyAdds(ctx, now),
  };
}

export const toPublicStall = (s: Menu['stalls'][number], foodCount: number): PublicStall => ({
  id: id(s._id),
  name: s.name,
  intro: s.intro,
  logoUrl: mediaUrl(s.logo),
  ...s.status,
  sortOrder: s.sortOrder,
  foodCount,
});

/** Up to five available foods by 7-day adds; ties broken by ascending food id. Zero-count foods never rank. */
export function topFive(menu: Menu): FoodDoc[] {
  return menu.foods
    .filter((f) => f.available && (menu.adds.get(id(f._id)) ?? 0) > 0)
    .sort((a, b) => menu.adds.get(id(b._id))! - menu.adds.get(id(a._id))! || id(a._id).localeCompare(id(b._id)))
    .slice(0, 5);
}
