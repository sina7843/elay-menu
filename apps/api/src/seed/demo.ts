// DEVELOPMENT DEMO DATA. Every document carries isDemo: true and a "demo:" seedKey.
// Stall names, logos and sample photos come from the design handoff; they are examples, not live inventory.
// Idempotent: inserts are keyed by seedKey with $setOnInsert, so re-running never duplicates or overwrites edits.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db, ObjectId } from 'mongodb';
import type { WeeklySchedule } from '@elay/shared';
import { collections } from '../db.js';
import { ensureCategories } from './categories.js';

const ASSETS = fileURLToPath(new URL('../../seed-assets/', import.meta.url));

const week = (open: string, close: string): WeeklySchedule => Array.from({ length: 7 }, () => ({ closed: false, open, close }));

type DemoFood = [key: string, name: string, description: string, price: number, image: string | null, tint: number, category: string, discount?: number];

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
    sections: [['گریل', [['mix-grill', 'میکس گریل دو نفره', 'استیک، جوجه، سبزیجات گریل‌شده', 890_000, 'steak.webp', 3, 'kebab', 20]]]],
  },
  {
    key: 'khoroos', name: 'بروستد خروس', intro: 'بروستد و سوخاری', logo: 'khoroos.png', hours: week('11:30', '23:00'),
    sections: [['بروستد', [['four-piece', 'بروستد چهار تکه', 'چهار تکه مرغ سوخاری با سیب‌زمینی', 360_000, 'chicken.webp', 4, 'fried-chicken']]]],
  },
  {
    // Overnight hours exercise the past-midnight schedule shape.
    key: 'harmony', name: 'هارمونی', intro: 'کافه و قهوه‌ی دمی', logo: 'harmony.png', hours: week('18:00', '02:00'),
    sections: [['قهوه', [['cappuccino', 'کاپوچینو', 'اسپرسو دبل با شیر کف‌دار', 140_000, null, 4, 'coffee', 10]]]],
  },
  {
    key: 'dokhan-dokan', name: 'دوخان دکان', intro: 'کباب ایرانی و دسر', logo: 'dokhan-dokan.png', hours: week('12:00', '23:00'),
    sections: [
      ['کباب', [['koobideh', 'کباب کوبیده', 'دو سیخ با برنج زعفرانی', 295_000, 'kebab.webp', 3, 'iranian']]],
      ['دسر', [['baklava', 'باقلوا', 'باقلوای پسته‌ای', 170_000, 'baklava.webp', 1, 'dessert', 15]]],
    ],
  },
  {
    key: 'hayat', name: 'حیاط', intro: 'چای و دمنوش', logo: 'hayat.png', hours: week('11:00', '23:00'),
    sections: [['دمنوش', [['special', 'چای ماسالا', 'چای سیاه، دارچین، هل، شیر', 95_000, null, 1, 'tea']]]],
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

  // Demo foods use the food court's real categories.
  const categoryIds = await ensureCategories(db);

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
          image: image ? await copyMedia(mediaDir, 'food-samples', image) : null, tint: `food-tint-${tint}`, available: true,
          discount: percent ? { percent, startDate: start, endDate: end } : null,
          isDemo: true, createdAt: now, updatedAt: now,
        });
        foods++;
      }
    }
  }
  return { categories: categoryIds.size, stalls: STALLS.length, foods };
}
