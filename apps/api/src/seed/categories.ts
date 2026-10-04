// The food court's eight categories (real data, not demo). Idempotent: each category is keyed by its icon
// and only inserted when missing, so names, icons and order changed later by the super admin are kept.
import type { Db, ObjectId } from 'mongodb';
import { FOODCOURT_CATEGORIES } from '@elay/shared';
import { collections } from '../db.js';

export async function ensureCategories(db: Db): Promise<Map<string, ObjectId>> {
  const c = collections(db);
  const ids = new Map<string, ObjectId>();
  for (const [i, { icon, name }] of FOODCOURT_CATEGORIES.entries()) {
    const seedKey = `category:${icon}`;
    const doc = await db
      .collection(c.categories.collectionName)
      .findOneAndUpdate({ seedKey }, { $setOnInsert: { seedKey, name, icon, sortOrder: i, isDemo: false } }, { upsert: true, returnDocument: 'after' });
    ids.set(icon, doc!._id as ObjectId);
  }
  return ids;
}
