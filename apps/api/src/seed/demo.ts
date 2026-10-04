// DEVELOPMENT DEMO DATA. Every document carries isDemo: true and a "demo:" seedKey.
// Stall names, logos and sample photos come from the design handoff; they are examples, not live inventory.
// Idempotent: inserts are keyed by seedKey with $setOnInsert, so re-running never duplicates or overwrites edits.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db, ObjectId } from 'mongodb';
import type { WeeklySchedule } from '@elay/shared';
import { collections } from '../db.js';

const ASSETS = fileURLToPath(new URL('../../seed-assets/', import.meta.url));

const CATEGORIES = [
  ['pizza', 'پیتزا'],
  ['burger', 'برگر'],
  ['kebab', 'کباب'],
  ['fried-chicken', 'سوخاری'],
  ['steak', 'استیک'],
  ['sushi', 'سوشی'],
  ['sandwich', 'ساندویچ'],
  ['dessert', 'دسر'],
] as const;

const week = (open: string, close: string): WeeklySchedule => Array.from({ length: 7 }, () => ({ closed: false, open, close }));

type DemoFood = [key: string, name: string, description: string, price: number, image: string, tint: number, category: string, discount?: number];

const STALLS: { key: string; name: string; intro: string; logo: string; hours: WeeklySchedule; sections: [string, DemoFood[]][] }[] = [
  {
    key: 'cheezo', name: 'پیتزا چیزو', intro: 'پیتزای آمریکایی و ایتالیایی', logo: 'cheezo.png', hours: week('12:00', '24:00'),
    sections: [['پیتزا آمریکایی', [
      ['pepperoni', 'پیتزا پپرونی', 'پپرونی، پنیر موتزارلا، سس گوجه', 385_000, 'pizza.webp', 1, 'pizza'],
      ['special', 'پیتزا مخصوص چیزو', 'ژامبون، قارچ، فلفل دلمه‌ای، پنیر', 425_000, 'pizza.webp', 2, 'pizza', 15],
    ]]],
  },
  {
    key: 'blu-burger', name: 'بلو برگر', intro: 'برگر دست‌ساز', logo: 'blu-burger.svg', hours: week('12:00', '23:30'),
    sections: [['برگرها', [['double-smash', 'دبل اسمش برگر', 'دو لایه گوشت، پنیر چدار، سس مخصوص', 420_000, 'burger.webp', 2, 'burger']]]],
  },
  {
    key: 'grill-up', name: 'گریل‌آپ', intro: 'استیک و گریل', logo: 'grill-up.png', hours: week('12:00', '23:00'),
    sections: [['گریل', [['mix-grill', 'میکس گریل دو نفره', 'استیک، جوجه، سبزیجات گریل‌شده', 890_000, 'steak.webp', 3, 'steak', 20]]]],
  },
  {
    key: 'khoroos', name: 'بروستد خروس', intro: 'بروستد و سوخاری', logo: 'khoroos.png', hours: week('11:30', '23:00'),
    sections: [['بروستد', [['four-piece', 'بروستد چهار تکه', 'چهار تکه مرغ سوخاری با سیب‌زمینی', 360_000, 'chicken.webp', 4, 'fried-chicken']]]],
  },
  {
    // Overnight hours exercise the past-midnight schedule shape.
    key: 'harmony', name: 'هارمونی', intro: 'سوشی و غذای آسیایی', logo: 'harmony.png', hours: week('18:00', '02:00'),
    sections: [['سوشی', [['california', 'سوشی کالیفرنیا ۸ تکه', 'خرچنگ، آووکادو، خیار', 480_000, 'sushi.webp', 4, 'sushi', 10]]]],
  },
  {
    key: 'dokhan-dokan', name: 'دوخان دکان', intro: 'کباب ایرانی و دسر', logo: 'dokhan-dokan.png', hours: week('12:00', '23:00'),
    sections: [
      ['کباب', [['koobideh', 'کباب کوبیده', 'دو سیخ با برنج زعفرانی', 295_000, 'kebab.webp', 3, 'kebab']]],
      ['دسر', [['baklava', 'باقلوا', 'باقلوای پسته‌ای', 170_000, 'baklava.webp', 1, 'dessert', 15]]],
    ],
  },
  {
    key: 'hayat', name: 'حیاط', intro: 'ساندویچ و فست‌فود', logo: 'hayat.png', hours: week('11:00', '23:00'),
    sections: [['ساندویچ', [['special', 'ساندویچ مخصوص حیاط', 'نان باگت، گوشت، پنیر، سبزیجات', 265_000, 'sandwich.webp', 1, 'sandwich']]]],
  },
];

const tehranDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d);

async function copyMedia(mediaDir: string, sub: string, file: string): Promise<string> {
  const name = `demo-${file.toLowerCase()}`;
  const target = path.join(mediaDir, name);
  if (!(await stat(target).catch(() => null))) await copyFile(path.join(ASSETS, sub, file), target);
  return name;
}

export async function seedDemo(db: Db, mediaDir: string, now = new Date()) {
  const c = collections(db);
  await mkdir(mediaDir, { recursive: true });
  // Field shapes match the typed documents in db.ts; kept untyped here only to share one upsert helper.
  const upsert = async (col: keyof typeof c, seedKey: string, doc: Record<string, unknown>): Promise<ObjectId> => {
    const r = await db
      .collection(c[col].collectionName)
      .findOneAndUpdate({ seedKey }, { $setOnInsert: { seedKey, ...doc } }, { upsert: true, returnDocument: 'after' });
    return r!._id as ObjectId;
  };

  const categoryIds = new Map<string, ObjectId>();
  for (const [i, [icon, name]] of CATEGORIES.entries()) {
    categoryIds.set(icon, await upsert('categories', `demo:category:${icon}`, { name, icon, sortOrder: i, isDemo: true }));
  }

  const start = tehranDate(now);
  const end = tehranDate(new Date(now.getTime() + 30 * 86_400_000));
  let foods = 0;
  for (const [i, s] of STALLS.entries()) {
    const stallId = await upsert('stalls', `demo:stall:${s.key}`, {
      name: s.name, intro: s.intro, logo: await copyMedia(mediaDir, 'logos', s.logo), weeklyHours: s.hours,
      manualOverride: null, sortOrder: i, visible: true, isDemo: true, createdAt: now, updatedAt: now,
    });
    for (const [j, [sectionName, items]] of s.sections.entries()) {
      const stallCategoryId = await upsert('stallCategories', `demo:stall-category:${s.key}:${j}`, {
        stallId, name: sectionName, sortOrder: j, isDemo: true,
      });
      for (const [key, name, description, price, image, tint, category, percent] of items) {
        await upsert('foods', `demo:food:${s.key}:${key}`, {
          stallId, stallCategoryId, categoryId: categoryIds.get(category)!, name, description, price,
          image: await copyMedia(mediaDir, 'food-samples', image), tint: `food-tint-${tint}`, available: true,
          discount: percent ? { percent, startDate: start, endDate: end } : null,
          isDemo: true, createdAt: now, updatedAt: now,
        });
        foods++;
      }
    }
  }
  return { categories: CATEGORIES.length, stalls: STALLS.length, foods };
}
