// Customer flows against the real API (see server.ts). Clock: Sunday 13:30 Tehran.
import { expect, test, type Page } from '@playwright/test';

const control = async (body: object) => {
  const res = await fetch('http://127.0.0.1:5311', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
};

test.beforeEach(async () => {
  await control({ op: 'reset' });
});

const row = (page: Page, name: string) => page.locator('article', { has: page.locator(`text="${name}"`) }).first();
const orderBar = (page: Page) => page.locator('a.el-order-bar');

test('main page shows the handoff order of sections from real data', async ({ page }) => {
  await control({ op: 'adds', food: 'cheezo:pepperoni', count: 5 });
  await control({ op: 'adds', food: 'blu-burger:double-smash', count: 3 });
  await page.goto('/');
  const order = await page.locator('main > *').evaluateAll((els) =>
    els.map((e) => e.querySelector('h2')?.textContent?.trim() ?? e.querySelector('input')?.getAttribute('aria-label') ?? ''),
  );
  expect(order.filter(Boolean)).toEqual(['جست‌وجو', 'دسته‌ها', 'غرفه‌ها', 'تخفیف امروز']);
  await expect(page.locator('.el-promo--popular h2')).toHaveText('پرطرفدارهای قبیله');
  await expect(page.locator('.el-cat')).toHaveCount(8);
  await expect(page.locator('.el-stall')).toHaveCount(7);
  await expect(page.locator('.el-stall--closed')).toHaveCount(1); // هارمونی
  await expect(page.locator('.el-promo--deal .el-food-card')).toHaveCount(4);
  await expect(page.locator('.el-promo--popular .el-rank')).toHaveText(['۱', '۲']);
  await expect(page.getByText('۷ غرفه')).toBeVisible();
  // Persian digits and separators, discount from the server.
  await expect(page.locator('.el-promo--deal .el-food-card').first()).toContainText('۳۶۱٬۰۰۰');
  await expect(orderBar(page)).toHaveCount(0); // empty list: no order bar
});

test('order list: add → stepper, persists across reload, grouped by stall with totals and trash at one', async ({ page }) => {
  await page.goto('/stall/' + (await stallId(page, 'پیتزا چیزو')));
  const pepperoni = row(page, 'پیتزا پپرونی');
  await pepperoni.getByRole('button', { name: 'افزودن به لیست' }).click();
  await pepperoni.getByRole('button', { name: 'یکی بیشتر' }).click();
  await expect(pepperoni.locator('.el-stepper b')).toHaveText('۲');
  await row(page, 'پیتزا مخصوص چیزو').getByRole('button', { name: 'افزودن به لیست' }).click();
  await expect(page.locator('.el-header__count')).toHaveCount(0); // stall page header has back, not count
  await expect(orderBar(page)).toContainText('۳ مورد از ۱ غرفه');
  await expect(orderBar(page)).toContainText('۱٬۱۳۱٬۰۰۰'); // 2×385,000 + 361,000

  await page.reload();
  await expect(orderBar(page)).toContainText('۳ مورد از ۱ غرفه');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('elay.cart.v1')!));
  expect(stored.map((i: { qty: number }) => i.qty).sort()).toEqual([1, 2]);
  expect(Object.keys(stored[0]).sort()).toEqual(['id', 'qty']); // ids and quantities only

  await orderBar(page).click();
  await expect(page).toHaveURL(/\/order$/);
  await expect(orderBar(page)).toHaveCount(0);
  await expect(page.getByText('این بخش را برای صندوقدار پیتزا چیزو بخوانید')).toBeVisible();
  await expect(page.locator('.el-order-row__qty').first()).toHaveText('۲ ×');
  await expect(page.locator('.el-order-group__sum b')).toContainText('۱٬۱۳۱٬۰۰۰');
  await expect(page.locator('.el-order-total strong')).toContainText('۱٬۱۳۱٬۰۰۰');
  const special = page.locator('.el-order-row', { hasText: 'پیتزا مخصوص چیزو' });
  await special.getByRole('button', { name: 'حذف از لیست' }).click();
  await expect(special).toHaveCount(0);
  await expect(page.locator('.el-order-total strong')).toContainText('۷۷۰٬۰۰۰');

  // Clear list needs confirmation; Esc cancels.
  await page.getByRole('button', { name: 'پاک کردن لیست' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'پاک کردن لیست' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'پاک کردن' }).click();
  await expect(page.getByText('لیست شما خالی است')).toBeVisible();
  await page.getByRole('link', { name: 'رفتن به منو' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('closed stall: badge, notice and no add buttons; open stall shows closing time', async ({ page }) => {
  await page.goto('/stall/' + (await stallId(page, 'هارمونی')));
  await expect(page.locator('.el-badge--closed')).toHaveText('بسته · از ۱۸:۰۰ باز می‌شود');
  await expect(page.locator('.el-closed-note')).toContainText('از ساعت ۱۸:۰۰');
  await expect(page.getByRole('button', { name: 'افزودن به لیست' })).toHaveCount(0);
  await expect(page.locator('.el-status--closed').first()).toHaveText('سفارش از ۱۸:۰۰');

  await page.goto('/stall/' + (await stallId(page, 'بلو برگر')));
  await expect(page.locator('.el-badge--open')).toHaveText('باز است · تا ۲۳:۳۰');
  await expect(page.getByRole('tab')).toHaveText(['برگرها']);
  await page.goto('/stall/' + (await stallId(page, 'پیتزا چیزو')));
  await expect(page.locator('.el-badge--open')).toHaveText('باز است · تا ۲۴:۰۰'); // closes at midnight
});

test('sold out and deleted foods: listed but not addable, excluded from rails and totals, never substituted', async ({ page }) => {
  await control({ op: 'adds', food: 'cheezo:pepperoni', count: 9 });
  await page.goto('/stall/' + (await stallId(page, 'پیتزا چیزو')));
  await row(page, 'پیتزا پپرونی').getByRole('button', { name: 'افزودن به لیست' }).click();
  await row(page, 'پیتزا مخصوص چیزو').getByRole('button', { name: 'افزودن به لیست' }).click();
  const kebabStall = await stallId(page, 'دوخان دکان');
  await page.goto('/stall/' + kebabStall);
  await row(page, 'کباب کوبیده').getByRole('button', { name: 'افزودن به لیست' }).click();

  await control({ op: 'available', food: 'cheezo:pepperoni', value: false });
  await control({ op: 'deleteFood', food: 'dokhan-dokan:koobideh' });
  await page.goto('/');
  await expect(page.locator('.el-promo--popular .el-food-card').first()).toBeVisible(); // + clicks above were counted
  await expect(page.locator('.el-promo--popular')).not.toContainText('پیتزا پپرونی'); // ranked first by adds, but sold out

  await page.goto('/stall/' + (await stallId(page, 'پیتزا چیزو')));
  const sold = row(page, 'پیتزا پپرونی');
  await expect(sold).toHaveClass(/el-food-row--sold/);
  await expect(sold.locator('.el-sold')).toHaveText('تموم شد');

  await page.goto('/order');
  await expect(page.locator('.el-order-row', { hasText: 'پیتزا پپرونی' })).toContainText('تموم شد · در جمع حساب نمی‌شود');
  await expect(page.locator('.el-order-row', { hasText: 'پیتزا پپرونی' }).getByRole('button', { name: 'یکی بیشتر' })).toBeDisabled();
  await expect(page.getByText('غذایی که دیگر در منو نیست')).toBeVisible();
  await expect(page.getByText('۲ مورد از لیست الان قابل سفارش نیست')).toBeVisible();
  await expect(page.locator('.el-order-total strong')).toContainText('۳۶۱٬۰۰۰'); // only the discounted special
  await page.getByRole('button', { name: 'حذف از لیست' }).last().click();
  await expect(page.getByText('غذایی که دیگر در منو نیست')).toHaveCount(0);
});

test('discounts: deals page and price tags use server prices', async ({ page }) => {
  await page.goto('/deals');
  await expect(page.locator('.el-promo__sub')).toHaveText('۴ غذا · فقط تا پایان امشب');
  const grill = row(page, 'میکس گریل دو نفره');
  await expect(grill.locator('.el-price__old')).toContainText('۸۹۰٬۰۰۰');
  await expect(grill.locator('.el-price')).toContainText('۷۱۲٬۰۰۰');
  await expect(grill.locator('.el-tag--deal')).toHaveText('۲۰٪ تخفیف');
  await expect(grill.locator('.el-stall-chip')).toContainText('گریل‌آپ');
});

test('category page: stall filter chips narrow the list', async ({ page }) => {
  await page.goto('/');
  await page.locator('.el-cat', { hasText: 'پیتزا' }).click();
  await expect(page.locator('.el-cat-head h1')).toHaveText('پیتزا');
  await expect(page.locator('.el-cat-head span').last()).toHaveText('۲ مورد از ۱ غرفه');
  await expect(page.locator('.el-filter-chip')).toHaveText(['همه‌ی غرفه‌ها', 'پیتزا چیزو']);
  await expect(page.locator('.el-food-row')).toHaveCount(2);
});

test('search: Persian normalisation, results, no-result state and stale responses', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'جست‌وجو' }).fill('كباب'); // Arabic kaf
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.locator('.el-food-row')).toHaveCount(1);
  await expect(page.locator('.el-food-row__name')).toHaveText('کباب کوبیده');

  // Make the first of two requests slower than the second: the newer query must win.
  let first = true;
  await page.route('**/api/public/search?*', async (route) => {
    if (first && route.request().url().includes('q=%D9%BE%DB%8C%D8%AA%D8%B2%D8%A7')) {
      first = false;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });
  const box = page.getByRole('searchbox', { name: 'جست‌وجو' });
  await box.fill('پیتزا');
  await page.waitForTimeout(400); // debounced request for «پیتزا» starts (slow)
  await box.fill('برگر');
  await expect(page.locator('.el-food-row__name')).toHaveText(['دبل اسمش برگر']);
  await page.waitForTimeout(1800); // the slow «پیتزا» response has arrived and must be ignored
  await expect(page.locator('.el-food-row__name')).toHaveText(['دبل اسمش برگر']);
  await page.unroute('**/api/public/search?*');

  await box.fill('لازانیا');
  await expect(page.getByRole('heading', { name: 'برای «لازانیا» چیزی پیدا نشد' })).toBeVisible();
  await expect(page.locator('.el-cat').first()).toBeVisible();
  await page.getByRole('button', { name: 'پاک کردن جست‌وجو' }).click();
  await expect(box).toBeFocused();
});

test('filter sheet: live count, apply to results, keyboard and focus', async ({ page }) => {
  await page.goto('/');
  const filter = page.getByRole('button', { name: 'فیلتر' });
  await filter.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'فیلتر' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'بستن' })).toBeFocused();
  await expect(sheet.getByRole('button', { name: /نمایش ۹ غذا/ })).toBeVisible();
  await sheet.getByRole('switch', { name: /فقط تخفیف‌دار/ }).focus();
  await page.keyboard.press('Space');
  await expect(sheet.getByRole('switch', { name: /فقط تخفیف‌دار/ })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.getByRole('button', { name: 'نمایش ۴ غذا' })).toBeVisible();
  await sheet.getByRole('button', { name: 'ارزان‌ترین' }).click();
  await sheet.getByRole('button', { name: 'نمایش ۴ غذا' }).click();
  await expect(page).toHaveURL(/deal=1/);
  await expect(page).toHaveURL(/sort=cheapest/);
  // Cheapest first by the price paid today: 145,000 / 361,000 / 432,000 / 712,000.
  await expect(page.locator('.el-food-row__name')).toHaveText(['باقلوا', 'پیتزا مخصوص چیزو', 'سوشی کالیفرنیا ۸ تکه', 'میکس گریل دو نفره']);

  // Esc closes and returns focus to the opener.
  const again = page.getByRole('button', { name: /فیلتر/ });
  await again.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(again).toBeFocused();
});

test('keyboard: add moves focus to the stepper, every control is reachable and ≥44px', async ({ page }) => {
  await page.goto('/stall/' + (await stallId(page, 'بلو برگر')));
  const add = page.getByRole('button', { name: 'افزودن به لیست' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'یکی بیشتر' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter'); // «یکی کمتر» at 1 → back to the add button
  await expect(page.getByRole('button', { name: 'افزودن به لیست' })).toBeFocused();
  await page.getByRole('button', { name: 'افزودن به لیست' }).click();
  await control({ op: 'adds', food: 'cheezo:pepperoni', count: 2 });
  for (const path of [null, '/', '/search?q=پیتزا', '/order', '/deals']) {
    if (path) await page.goto(path);
    const small = await page.locator('button:visible, a:visible, [role="switch"]:visible').evaluateAll((els) =>
      els
        .map((e) => ({ r: e.getBoundingClientRect(), t: e.textContent?.trim() || e.getAttribute('aria-label') }))
        .filter(({ r }) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
        .map(({ r, t }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect(small, path ?? 'stall').toEqual([]);
  }
});

test('global closure replaces every customer page with the closed message, no order bar', async ({ page }) => {
  await page.goto('/stall/' + (await stallId(page, 'پیتزا چیزو')));
  await row(page, 'پیتزا پپرونی').getByRole('button', { name: 'افزودن به لیست' }).click();
  await control({ op: 'menu', open: false, message: 'ال‌آی از ساعت ۱۲:۰۰ ظهر باز می‌شود.' });
  for (const path of ['/', '/order', '/search?q=پیتزا', '/deals']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'منو الان در دسترس نیست' })).toBeVisible();
    await expect(page.getByText('ال‌آی از ساعت ۱۲:۰۰ ظهر باز می‌شود.')).toBeVisible();
    await expect(orderBar(page)).toHaveCount(0);
    await expect(page.locator('.el-header__action')).toHaveCount(0);
  }
});

test('first load failure shows retry; retry recovers', async ({ page }) => {
  await page.route('**/api/public/menu', (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'منو باز نشد' })).toBeVisible();
  await expect(orderBar(page)).toHaveCount(0);
  await page.unroute('**/api/public/menu');
  await page.getByRole('button', { name: 'دوباره امتحان کنید' }).click();
  await expect(page.locator('.el-stall')).toHaveCount(7);
});

test('first load times out after 8 seconds with the skeleton meanwhile', async ({ page }) => {
  test.setTimeout(30_000);
  await page.route('**/api/public/menu', () => undefined); // never answers
  const started = Date.now();
  await page.goto('/');
  await expect(page.locator('[aria-label="در حال بارگذاری منو"]')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'جست‌وجو' })).toBeVisible(); // header and search are real
  await expect(page.getByRole('heading', { name: 'منو باز نشد' })).toBeVisible({ timeout: 12_000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(7_500);
});

test('offline with a cached menu: banner stays, list still works, recovers when back', async ({ page }) => {
  await page.goto('/stall/' + (await stallId(page, 'بلو برگر')));
  await row(page, 'دبل اسمش برگر').getByRole('button', { name: 'افزودن به لیست' }).click();
  await row(page, 'دبل اسمش برگر').getByRole('button', { name: 'یکی بیشتر' }).click();

  await page.route('**/api/public/**', (r) => r.abort());
  await page.reload();
  await expect(page.getByText('اینترنت قطع است. منوی آخرین بار را می‌بینید.')).toBeVisible();
  await expect(row(page, 'دبل اسمش برگر').locator('.el-stepper b')).toHaveText('۲');
  await row(page, 'دبل اسمش برگر').getByRole('button', { name: 'یکی کمتر' }).click(); // works offline
  await expect(row(page, 'دبل اسمش برگر').locator('.el-stepper b')).toHaveText('۱');
  // Search falls back to the cached menu and keeps the warning.
  await page.goto('/search?q=برگر');
  await expect(page.locator('.el-food-row__name')).toHaveText(['دبل اسمش برگر']);
  await expect(page.getByText('اینترنت قطع است. منوی آخرین بار را می‌بینید.')).toBeVisible();

  await page.unroute('**/api/public/**');
  await page.getByRole('button', { name: 'دوباره', exact: true }).click();
  await expect(page.getByText('اینترنت قطع است')).toHaveCount(0);
});

test('real offline reload is served by the service worker with the cached menu', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the worker
  await expect(page.locator('.el-stall')).toHaveCount(7);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.el-stall')).toHaveCount(7);
  await expect(page.getByText('اینترنت قطع است. منوی آخرین بار را می‌بینید.')).toBeVisible();
  await context.setOffline(false);
});

async function stallId(page: Page, name: string): Promise<string> {
  const res = await page.request.get('/api/public/menu');
  const menu = (await res.json()) as { stalls: { id: string; name: string }[] };
  return menu.stalls.find((s) => s.name === name)!.id;
}
