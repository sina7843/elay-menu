import { ObjectId, type Collection, type Filter } from 'mongodb';
import { ObjectIdSchema } from '@elay/shared';
import { AppError, notFound, parse } from './errors.js';

/** Route param → ObjectId (400 when malformed). */
export const oid = (value: string) => new ObjectId(parse(ObjectIdSchema, value));

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export const fieldError = (path: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', message, [{ path, message }]);

export async function findOr404<T extends { _id: ObjectId }>(col: Collection<T>, filter: Filter<T>): Promise<T> {
  const doc = (await col.findOne(filter)) as T | null;
  if (!doc) throw notFound();
  return doc;
}

type Sortable = { _id: ObjectId; sortOrder: number };

export async function nextSortOrder<T extends Sortable>(col: Collection<T>, filter: Filter<T>): Promise<number> {
  const last = (await col.find(filter).sort({ sortOrder: -1 }).limit(1).toArray())[0] as T | undefined;
  return last ? last.sortOrder + 1 : 0;
}

/** Applies a full new order. `ids` must be exactly the documents matching `filter`. */
export async function reorder<T extends Sortable>(col: Collection<T>, filter: Filter<T>, ids: string[]) {
  const existing = (await col.find(filter, { projection: { _id: 1 } }).toArray()).map((d) => d._id.toHexString());
  if (existing.length !== ids.length || !ids.every((id) => existing.includes(id))) {
    throw fieldError('ids', 'ترتیب باید دقیقاً همه‌ی موارد را داشته باشد.');
  }
  if (ids.length === 0) return;
  await col.bulkWrite(
    ids.map((id, i) => ({
      updateOne: { filter: { _id: new ObjectId(id) } as Filter<T>, update: { $set: { sortOrder: i } as Partial<T> } },
    })),
  );
}
