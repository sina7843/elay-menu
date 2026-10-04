// Visual capture of the real app for side-by-side review with handoff/screens/png.
// Runs only when SCREEN_DIR is set: SCREEN_DIR=../../tmp-screens npx playwright test screens
import { test, type Page } from '@playwright/test';

const dir = process.env.SCREEN_DIR;
test.skip(!dir, 'set SCREEN_DIR to capture screenshots');

const control = (body: object) => fetch('http://127.0.0.1:5311', { method: 'POST', body: JSON.stringify(body) });
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `${dir}/${name}.png`, fullPage });

async function stallId(page: Page, name: string) {
  const menu = (await (await page.request.get('/api/public/menu')).json()) as { stalls: { id: string; name: string }[]; categories: { id: string; icon: string }[] };
  return menu.stalls.find((s) => s.name === name)!.id;
}

test('capture customer screens', async ({ page }) => {
  test.setTimeout(120_000);
  await control({ op: 'reset' });
  for (const [food, count] of [['cheezo:pepperoni', 9], ['blu-burger:double-smash', 7], ['dokhan-dokan:koobideh', 5], ['khoroos:four-piece', 3], ['hayat:special', 2]] as const) {
    await control({ op: 'adds', food, count });
  }
  for (const width of [390, 320, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const sfx = width === 390 ? '' : `@${width}`;
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('elay.cart.v1'));
    await page.goto('/stall/' + (await stallId(page, 'پیتزا چیزو')));
    if (width === 390) {
      await page.getByRole('button', { name: 'افزودن به لیست' }).first().click();
      await page.getByRole('button', { name: 'یکی بیشتر' }).first().click();
      await page.goto('/stall/' + (await stallId(page, 'بلو برگر')));
      await page.getByRole('button', { name: 'افزودن به لیست' }).first().click();
    }
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await shot(page, `Main${sfx}`);
    await page.goto('/stall/' + (await stallId(page, 'پیتزا چیزو')));
    await shot(page, `Editorial-Stall${sfx}`);
    await page.goto('/order');
    await shot(page, `Editorial-Order${sfx}`);
    await page.goto('/');
    await page.locator('.el-cat').first().click();
    await shot(page, `Editorial-Category${sfx}`);
    if (width !== 390) continue;
    await page.goto('/stall/' + (await stallId(page, 'هارمونی')));
    await shot(page, 'Cust-ClosedStall');
    await page.goto('/deals');
    await shot(page, 'Cust-Deals');
    await page.goto('/popular');
    await shot(page, 'Cust-Popular');
    await page.goto('/search?q=پیتزا');
    await page.waitForSelector('.el-food-row');
    await shot(page, 'Cust-Search');
    await page.goto('/search?q=لازانیا');
    await page.waitForSelector('.el-empty');
    await shot(page, 'Cust-NoResult');
    await page.goto('/');
    await page.getByRole('button', { name: 'فیلتر' }).click();
    await page.waitForTimeout(400);
    await shot(page, 'Cust-Filter', false);
    await page.keyboard.press('Escape');
    await page.evaluate(() => localStorage.removeItem('elay.cart.v1'));
    await page.goto('/order');
    await shot(page, 'Cust-EmptyOrder');
    await page.route('**/api/public/menu', () => undefined);
    await page.evaluate(() => localStorage.removeItem('elay.menu.v1'));
    await page.goto('/');
    await shot(page, 'Cust-Loading');
    await page.unroute('**/api/public/menu');
    await page.route('**/api/public/menu', (r) => r.abort());
    await page.goto('/');
    await page.waitForSelector('.el-empty');
    await shot(page, 'Cust-Offline');
    await page.unroute('**/api/public/menu');
    await page.goto('/');
    await page.waitForSelector('.el-stall');
    await page.route('**/api/public/menu', (r) => r.abort());
    await page.reload();
    await page.waitForSelector('.el-banner');
    await shot(page, 'Cust-Banner', false);
    await page.unroute('**/api/public/menu');
    await control({ op: 'menu', open: false, message: 'ال‌آی از ساعت ۱۲:۰۰ ظهر باز می‌شود. همین QR روی میز را بعداً دوباره اسکن کنید.' });
    await page.goto('/');
    await page.waitForSelector('.el-empty');
    await shot(page, 'Cust-Unavailable');
    await control({ op: 'menu', open: true });
  }
});

test('capture stall-admin screens', async ({ page }) => {
  test.setTimeout(120_000);
  await control({ op: 'reset' });
  await page.clock.setFixedTime(new Date('2026-10-04T10:00:00Z'));
  await control({ op: 'stallAdmin', stall: 'cheezo', username: 'cheezo', password: 'cheezo123' });
  await control({ op: 'emptyStall', name: 'غرفه‌ی تازه', username: 'tazeh', password: 'tazeh1234' });
  const signIn = async (u: string, p: string) => {
    await page.goto('/admin/login');
    await page.getByLabel('نام کاربری').fill(u);
    await page.getByLabel('رمز عبور').fill(p);
  };
  await signIn('tazeh', 'tazeh1234');
  await shot(page, 'Admin-Login', false);
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForSelector('.ad-steps');
  await shot(page, 'Admin-Empty', false);
  await page.getByRole('link', { name: 'خروج' }).count();
  await page.goto('/admin/stall/account');
  await page.getByRole('button', { name: 'خروج از پنل' }).click();
  await signIn('cheezo', 'cheezo123');
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForSelector('.ad-food');
  await shot(page, 'Admin-Foods', false);
  await page.locator('.ad-food').first().getByRole('link').click();
  await page.getByRole('switch', { name: /تخفیف/ }).click();
  await page.getByLabel('درصد تخفیف').fill('15');
  await shot(page, 'Admin-FoodForm');
  await page.getByRole('button', { name: 'حذف این غذا' }).click();
  await shot(page, 'Admin-Dialog', false);
  await page.keyboard.press('Escape');
  await page.goto('/admin/stall/foods/new');
  await page.getByLabel('نام غذا').fill('پیتزا مارگاریتا');
  await page.getByRole('button', { name: 'افزودن به منو' }).click();
  await shot(page, 'Admin-FoodNew');
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 900, height: 600, channels: 4, background: { r: 180, g: 60, b: 30, alpha: 1 } } }).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.ad-crop');
  await page.waitForTimeout(300);
  await shot(page, 'Admin-Crop', false);
  await page.goto('/admin/stall/categories');
  await shot(page, 'Admin-Categories', false);
  await page.goto('/admin/stall/profile');
  await shot(page, 'Admin-Stall');
  await page.goto('/admin/stall/account');
  await page.getByLabel('رمز فعلی').fill('cheezo123');
  await page.getByLabel('رمز تازه', { exact: true }).fill('newpass123');
  await page.getByLabel('تکرار رمز تازه').fill('newpass12');
  await shot(page, 'Admin-Account');
});

test('capture super-admin screens', async ({ page }) => {
  test.setTimeout(120_000);
  await control({ op: 'reset' });
  for (const [stall, u] of [['cheezo', 'cheezo'], ['blu-burger', 'blu'], ['grill-up', 'grillup'], ['khoroos', 'khoroos'], ['harmony', 'harmony'], ['dokhan-dokan', 'dokhan'], ['hayat', 'hayat']]) {
    await control({ op: 'stallAdmin', stall, username: u, password: `${u}12345` });
  }
  await control({ op: 'superAdmin', username: 'root', password: 'rootpass1' });
  await page.goto('/admin/login');
  await page.getByLabel('نام کاربری').fill('root');
  await page.getByLabel('رمز عبور').fill('rootpass1');
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForSelector('.ad-stall-card');
  await shot(page, 'SA-Stalls', false);
  await page.locator('.ad-stall-card').first().click();
  await page.getByRole('button', { name: 'رمز تازه' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'رمز تازه' }).click();
  await page.waitForSelector('.ad-cred code');
  await shot(page, 'SA-StallForm');
  await page.goto('/admin/super/categories');
  await page.waitForSelector('.ad-list-row');
  await page.getByLabel('نام دسته').fill('نوشیدنی');
  await shot(page, 'SA-Categories');
  await page.goto('/admin/super/settings');
  await page.waitForSelector('.ad-readonly');
  await shot(page, 'SA-Settings');
});
