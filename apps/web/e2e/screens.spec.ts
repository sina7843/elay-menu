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
