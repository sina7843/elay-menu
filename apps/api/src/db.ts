import { MongoClient, type Db, type ObjectId } from 'mongodb';
import type { Role, WeeklySchedule } from '@elay/shared';

// ---------- documents ----------
// No cart, order or payment collections exist by design: the order list lives only on the customer's device.

export interface FoodcourtDoc {
  _id: 'foodcourt';
  name: string;
  logo: string | null;
  menuOpen: boolean;
  closedMessage: string;
  updatedAt: Date;
}

export interface StallDoc {
  _id: ObjectId;
  name: string;
  intro: string;
  logo: string | null;
  weeklyHours: WeeklySchedule;
  manualOverride: { state: 'open' | 'closed'; until: Date | null } | null;
  sortOrder: number;
  visible: boolean;
  isDemo: boolean;
  seedKey?: string;
  /** Set first when a cascade delete starts; such stalls are invisible everywhere and the delete is resumable. */
  deleting?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountDoc {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  role: Role;
  /** Required for stall_admin, null for super_admin. */
  stallId: ObjectId | null;
  createdAt: Date;
  passwordChangedAt: Date;
}

export interface SessionDoc {
  _id: ObjectId;
  /** sha256 of the cookie token; the raw token is never stored. */
  tokenHash: string;
  accountId: ObjectId;
  csrfToken: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CategoryDoc {
  _id: ObjectId;
  name: string;
  icon: string;
  sortOrder: number;
  isDemo: boolean;
  seedKey?: string;
}

export interface StallCategoryDoc {
  _id: ObjectId;
  stallId: ObjectId;
  name: string;
  sortOrder: number;
  isDemo: boolean;
  seedKey?: string;
}

export interface FoodDoc {
  _id: ObjectId;
  stallId: ObjectId;
  categoryId: ObjectId;
  stallCategoryId: ObjectId;
  name: string;
  description: string;
  price: number;
  image: string | null;
  tint: string;
  available: boolean;
  discount: { percent: number; startDate: string; endDate: string } | null;
  isDemo: boolean;
  seedKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Anonymous per-food per-Tehran-day "+" counter. No customer identifiers. */
export interface PopularityCounterDoc {
  _id: ObjectId;
  foodId: ObjectId;
  day: string;
  count: number;
  expiresAt: Date;
}

/** Uploaded file record. Seeded demo files (demo-*) have no record. */
export interface MediaDoc {
  _id: string;
  kind: 'food' | 'stall-logo' | 'foodcourt-logo';
  /** Owning stall for food images; null for logos (attached by the super admin). */
  stallId: ObjectId | null;
  createdAt: Date;
}

export function collections(db: Db) {
  return {
    foodcourt: db.collection<FoodcourtDoc>('foodcourt'),
    stalls: db.collection<StallDoc>('stalls'),
    accounts: db.collection<AccountDoc>('accounts'),
    sessions: db.collection<SessionDoc>('sessions'),
    categories: db.collection<CategoryDoc>('categories'),
    stallCategories: db.collection<StallCategoryDoc>('stallCategories'),
    foods: db.collection<FoodDoc>('foods'),
    popularityCounters: db.collection<PopularityCounterDoc>('popularityCounters'),
    media: db.collection<MediaDoc>('media'),
  };
}
export type Collections = ReturnType<typeof collections>;

export async function connect(uri: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  return { client, db: client.db() };
}

// ---------- migrations ----------
// Ordered, append-only. Each runs once and is recorded in `migrations`. Index creation is idempotent.

const MIGRATIONS: { id: string; up: (db: Db) => Promise<void> }[] = [
  {
    id: '001-initial-indexes',
    up: async (db) => {
      const c = collections(db);
      await c.accounts.createIndex({ username: 1 }, { unique: true });
      await c.accounts.createIndex(
        { stallId: 1 },
        { unique: true, partialFilterExpression: { role: 'stall_admin' } },
      );
      await c.sessions.createIndex({ tokenHash: 1 }, { unique: true });
      await c.sessions.createIndex({ accountId: 1 });
      await c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await c.stalls.createIndex({ sortOrder: 1 });
      await c.categories.createIndex({ sortOrder: 1 });
      await c.stallCategories.createIndex({ stallId: 1, sortOrder: 1 });
      await c.foods.createIndex({ stallId: 1, stallCategoryId: 1 });
      await c.foods.createIndex({ categoryId: 1 });
      await c.popularityCounters.createIndex({ foodId: 1, day: 1 }, { unique: true });
      await c.popularityCounters.createIndex({ day: 1 });
      await c.popularityCounters.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      for (const name of ['stalls', 'categories', 'stallCategories', 'foods'] as const) {
        await c[name].createIndex({ seedKey: 1 }, { unique: true, partialFilterExpression: { seedKey: { $type: 'string' } } });
      }
    },
  },
  {
    id: '002-foodcourt-singleton',
    up: async (db) => {
      await collections(db).foodcourt.updateOne(
        { _id: 'foodcourt' },
        { $setOnInsert: { name: 'ال‌آی', logo: null, menuOpen: true, closedMessage: '', updatedAt: new Date() } },
        { upsert: true },
      );
    },
  },
  {
    id: '003-media-and-lookups',
    up: async (db) => {
      const c = collections(db);
      await c.media.createIndex({ createdAt: 1 });
      await c.media.createIndex({ stallId: 1 });
      await c.foods.createIndex({ image: 1 });
      await c.stalls.createIndex({ deleting: 1 }, { sparse: true });
    },
  },
];

export async function migrate(db: Db): Promise<string[]> {
  const log = db.collection<{ _id: string; appliedAt: Date }>('migrations');
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (await log.findOne({ _id: m.id })) continue;
    await m.up(db);
    await log.insertOne({ _id: m.id, appliedAt: new Date() });
    applied.push(m.id);
  }
  return applied;
}
