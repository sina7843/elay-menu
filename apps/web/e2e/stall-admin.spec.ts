// Stall-admin panel against the real API (see server.ts). Browser clock pinned to the API clock.
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

// page.route cannot see requests from a page controlled by the service worker; the panel does not need it.
test.use({ serviceWorkers: 'block' });

const START = new Date('2026-10-04T10:00:00Z'); // Sunday 13:30 Tehran = Jalali 1405/07/12
const control = async (body: object) => {
  const res = await fetch('http://127.0.0.1:5311', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ stallId?: string }>;
};

test.beforeEach(async ({ page }) => {
  await control({ op: 'reset' });
  await page.clock.setFixedTime(START);
});

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/admin/login');
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
}

const foodRow = (page: Page, name: string) => page.locator('.ad-food', { hasText: name });

test('shared login sends each role to its own panel; the guard does not trust the URL', async ({ page }) => {
  await control({ op: 'stallAdmin', stall: 'cheezo', username: 'cheezo', password: 'cheezo123' });
  await control({ op: 'superAdmin', username: 'root', password: 'rootpass1' });
  await signIn(page, 'cheezo', 'wrong-pass1');
  await expect(page.getByText('نام کاربری یا رمز درست نیست.')).toBeVisible();
  await page.getByLabel('رمز عبور').fill('cheezo123');
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).toHaveURL(/\/admin\/stall$/);
  await expect(page.locator('.ad-top__name b')).toHaveText('پیتزا چیزو');
  await page.goto('/admin/super');
  await expect(page).toHaveURL(/\/admin\/stall$/);
  // Server refuses super-admin data regardless of the UI.
  expect((await page.request.get('/api/admin/stalls')).status()).toBe(403);
});

test('first run: setup steps until the first food; category, photo crop/upload, food; customer menu shows it', async ({ page }) => {
  const { stallId } = await control({ op: 'emptyStall', name: 'غرفه‌ی تازه', username: 'tazeh', password: 'tazeh1234' });
  await signIn(page, 'tazeh', 'tazeh1234');
  await expect(page.getByRole('heading', { name: 'خوش آمدید' })).toBeVisible();
  await expect(page.locator('.ad-step--done')).toHaveCount(1);
  expect((await page.request.get('/api/public/menu')).ok()).toBe(true);
  expect(JSON.stringify(await (await page.request.get('/api/public/menu')).json())).not.toContain('غرفه‌ی تازه'); // hidden while empty

  await page.getByRole('link', { name: 'دسته‌های منوی غرفه را بسازید' }).click();
  await page.getByLabel('نام دسته‌ی جدید').fill('پیتزا آمریکایی');
  await page.getByRole('button', { name: 'افزودن', exact: true }).click();
  await expect(page.locator('.ad-list-row')).toContainText('پیتزا آمریکایی');
  await expect(page.locator('.ad-toast')).toContainText('«پیتزا آمریکایی» ذخیره شد');

  await page.getByRole('link', { name: 'غذاها' }).click();
  await expect(page.locator('.ad-step--done')).toHaveCount(2);
  await page.getByRole('link', { name: 'افزودن غذا' }).click();
  await expect(page.getByRole('heading', { name: 'غذای جدید' })).toBeVisible();

  // Validation from shared constraints before anything is sent.
  await page.getByRole('button', { name: 'افزودن به منو' }).click();
  await expect(page.getByText('قیمت را وارد کنید.')).toBeVisible();
  await expect(page.getByText('یک دسته انتخاب کنید.')).toBeVisible();

  // Photo: a non-square file is cropped to a square in the browser, then uploaded.
  const png = await sharp({ create: { width: 900, height: 600, channels: 4, background: { r: 180, g: 60, b: 30, alpha: 1 } } }).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'pizza.png', mimeType: 'image/png', buffer: png });
  const dialog = page.getByRole('dialog', { name: 'برش عکس' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('بزرگنمایی').fill('40');
  await dialog.locator('.ad-crop').focus();
  await page.keyboard.press('ArrowLeft');
  await dialog.getByRole('button', { name: 'استفاده از این برش' }).click();
  await expect(page.locator('.ad-upload .el-food-img img')).toHaveAttribute('src', /\/api\/media\/[a-f0-9]{24}\.(webp|png)$/);

  await page.getByLabel('نام غذا').fill('پیتزا پپرونی');
  await page.getByLabel('محتویات و توضیحات').fill('پپرونی و موتزارلا');
  await expect(page.getByText('۱۷ / ۱۲۰')).toBeVisible();
  await page.getByLabel('قیمت').fill('۳۸۵٬۰۰۰');
  await page.getByRole('button', { name: 'پیتزا', exact: true }).click();
  await page.getByRole('button', { name: 'زمینه‌ی ۳' }).click();
  await page.getByRole('button', { name: 'افزودن به منو' }).click();
  await expect(page).toHaveURL(/\/admin\/stall$/);
  await expect(page.locator('.ad-toast')).toContainText('«پیتزا پپرونی» ذخیره شد');
  await expect(foodRow(page, 'پیتزا پپرونی')).toContainText('۳۸۵٬۰۰۰');

  await page.goto(`/stall/${stallId}`);
  await expect(page.locator('.el-stall-head h1')).toHaveText('غرفه‌ی تازه');
  await expect(page.locator('.el-food-row .el-food-img--t3 img')).toHaveAttribute('src', /\/api\/media\//);
});

test('discount with Jalali dates and live rounded preview; date order validated; customer price updates', async ({ page }) => {
  const { stallId } = await control({ op: 'stallAdmin', stall: 'cheezo', username: 'cheezo', password: 'cheezo123' });
  await signIn(page, 'cheezo', 'cheezo123');
  await foodRow(page, 'پیتزا پپرونی').getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'ویرایش غذا' })).toBeVisible();
  await page.getByRole('switch', { name: /تخفیف/ }).click();
  await expect(page.getByLabel('از', { exact: true })).toHaveValue('۱۴۰۵/۰۷/۱۲');
  await page.getByLabel('درصد تخفیف').fill('۱۵');
  await expect(page.locator('.ad-preview-price b')).toHaveText('۳۲۷٬۰۰۰'); // 385,000 × 0.85 = 327,250 → 327,000
  await page.getByLabel('تا', { exact: true }).fill('۱۴۰۵/۰۷/۱۰');
  await page.getByRole('button', { name: 'ذخیره‌ی تغییرات' }).click();
  await expect(page.getByText('تاریخ پایان باید بعد از تاریخ شروع باشد.')).toBeVisible();
  await page.getByLabel('درصد تخفیف').fill('95');
  await page.getByLabel('تا', { exact: true }).fill('1405/7/18');
  await page.getByRole('button', { name: 'ذخیره‌ی تغییرات' }).click();
  await expect(page.getByText('درصد بین ۱ تا ۹۰.')).toBeVisible();
  await page.getByLabel('درصد تخفیف').fill('15');
  await page.getByRole('button', { name: 'ذخیره‌ی تغییرات' }).click();
  await expect(page).toHaveURL(/\/admin\/stall$/);
  await expect(foodRow(page, 'پیتزا پپرونی')).toContainText('۱۵٪ تا');
  await page.goto(`/stall/${stallId}`);
  const row = page.locator('.el-food-row', { hasText: 'پیتزا پپرونی' });
  await expect(row.locator('.el-price__old')).toContainText('۳۸۵٬۰۰۰');
  await expect(row).toContainText('۳۲۷٬۰۰۰');
});

test('availability switch saves at once, rolls back on failure, and the customer sees «تموم شد»', async ({ page }) => {
  const { stallId } = await control({ op: 'stallAdmin', stall: 'cheezo', username: 'cheezo', password: 'cheezo123' });
  await signIn(page, 'cheezo', 'cheezo123');
  const sw = foodRow(page, 'پیتزا پپرونی').getByRole('switch');
  await page.route('**/availability', (r) => r.fulfill({ status: 500, body: '{}' }));
  await sw.click();
  await expect(page.locator('.ad-toast--error')).toContainText('ذخیره نشد');
  await expect(sw).toHaveAttribute('aria-checked', 'true'); // rolled back
  await page.unroute('**/availability');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.ad-toast')).toContainText('«پیتزا پپرونی» تموم شد');
  await page.goto(`/stall/${stallId}`);
  await expect(page.locator('.el-food-row', { hasText: 'پیتزا پپرونی' }).locator('.el-sold')).toHaveText('تموم شد');
});

test('categories: keyboard reorder persists, used category cannot be deleted, empty one can', async ({ page }) => {
  const { stallId } = await control({ op: 'stallAdmin', stall: 'dokhan-dokan', username: 'dokhan', password: 'dokhan123' });
  await signIn(page, 'dokhan', 'dokhan123');
  await page.getByRole('link', { name: 'دسته‌ها' }).click();
  await expect(page.locator('.ad-list-row__body b')).toHaveText(['کباب', 'دسر']);
  await page.getByRole('button', { name: /جابه‌جایی دسر/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.ad-list-row__body b')).toHaveText(['دسر', 'کباب']);
  await expect(page.getByRole('button', { name: /جابه‌جایی دسر/ })).toBeFocused();
  await page.reload();
  await expect(page.locator('.ad-list-row__body b')).toHaveText(['دسر', 'کباب']);

  await page.getByRole('button', { name: 'ویرایش کباب' }).click();
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('این دسته غذا دارد');
  await page.getByRole('button', { name: 'انصراف' }).click();

  await page.getByLabel('نام دسته‌ی جدید').fill('نوشیدنی');
  await page.getByRole('button', { name: 'افزودن', exact: true }).click();
  await page.getByRole('button', { name: 'ویرایش نوشیدنی' }).click();
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.locator('.ad-list-row__body b')).toHaveText(['دسر', 'کباب']);

  await page.goto(`/stall/${stallId}`);
  await expect(page.getByRole('tab')).toHaveText(['دسر', 'کباب']);
});

test('hours (overnight, closed day), intro and the manual open switch', async ({ page }) => {
  const { stallId } = await control({ op: 'stallAdmin', stall: 'hayat', username: 'hayat', password: 'hayat1234' });
  await signIn(page, 'hayat', 'hayat1234');
  await page.getByRole('link', { name: 'غرفه', exact: true }).click();
  await expect(page.locator('.ad-status-card b')).toHaveText('الان باز است');
  await page.getByLabel('معرفی کوتاه').fill('ساندویچ و برگر');
  await page.getByRole('switch', { name: 'جمعه باز است' }).click();
  await page.getByLabel('یکشنبه تا ساعت').selectOption('02:00'); // overnight Sunday → Monday
  await expect(page.locator('.ad-toast')).toContainText('اطلاعات غرفه ذخیره شد');

  await page.getByRole('switch', { name: /الان باز است/ }).click();
  await expect(page.locator('.ad-status-card b')).toHaveText('الان بسته است');
  await expect(page.locator('.ad-status-card')).toContainText('بسته‌ی موقت');

  await page.reload();
  await expect(page.getByLabel('معرفی کوتاه')).toHaveValue('ساندویچ و برگر');
  await expect(page.locator('.ad-day').nth(6)).toHaveClass(/ad-day--off/);
  await expect(page.getByLabel('یکشنبه تا ساعت')).toHaveValue('02:00');

  await page.goto(`/stall/${stallId}`);
  await expect(page.locator('.el-stall-head__sub')).toHaveText('ساندویچ و برگر');
  await expect(page.locator('.el-badge--closed')).toBeVisible();
});

test('change password (disabled until confirmed), sign out, sign in with the new password', async ({ page }) => {
  await control({ op: 'stallAdmin', stall: 'cheezo', username: 'cheezo', password: 'cheezo123' });
  await signIn(page, 'cheezo', 'cheezo123');
  await page.getByRole('link', { name: 'حساب', exact: true }).click();
  const save = page.getByRole('button', { name: 'ذخیره‌ی رمز تازه' });
  await page.getByLabel('رمز فعلی').fill('wrong-pass1');
  await page.getByLabel('رمز تازه', { exact: true }).fill('newpass123');
  await page.getByLabel('تکرار رمز تازه').fill('newpass12');
  await expect(page.getByText('با رمز تازه یکی نیست.')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByLabel('تکرار رمز تازه').fill('newpass123');
  await save.click();
  await expect(page.getByText('رمز فعلی درست نیست.')).toBeVisible();
  await page.getByLabel('رمز فعلی').fill('cheezo123');
  await save.click();
  await expect(page.locator('.ad-toast')).toContainText('رمز تازه ذخیره شد');
  await expect(page.getByText('به مدیر فودکورت بگویید')).toBeVisible();
  await page.getByRole('button', { name: 'خروج از پنل' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await signIn(page, 'cheezo', 'cheezo123');
  await expect(page.getByText('نام کاربری یا رمز درست نیست.')).toBeVisible();
  await page.getByLabel('رمز عبور').fill('newpass123');
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).toHaveURL(/\/admin\/stall$/);
});

test('delete with confirmation suggests «تموم شد»; Esc cancels, focus returns', async ({ page }) => {
  await control({ op: 'stallAdmin', stall: 'dokhan-dokan', username: 'dokhan', password: 'dokhan123' });
  await signIn(page, 'dokhan', 'dokhan123');
  await foodRow(page, 'باقلوا').getByRole('link').click();
  const del = page.getByRole('button', { name: 'حذف این غذا' });
  await del.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('به جای حذف آن را «تموم شد» کنید');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(del).toBeFocused();
  await del.click();
  await dialog.getByRole('button', { name: 'حذف' }).click();
  await expect(page).toHaveURL(/\/admin\/stall$/);
  await expect(page.locator('.ad-toast')).toContainText('«باقلوا» حذف شد');
  await expect(foodRow(page, 'باقلوا')).toHaveCount(0);
});

test('a second stall admin cannot read or change the first stall, even with crafted ids', async ({ page }) => {
  const a = await control({ op: 'stallAdmin', stall: 'cheezo', username: 'cheezo', password: 'cheezo123' });
  const b = await control({ op: 'stallAdmin', stall: 'hayat', username: 'hayat', password: 'hayat1234' });
  await signIn(page, 'hayat', 'hayat1234');
  await expect(page.locator('.ad-top__name b')).toHaveText('حیاط');
  await expect(page.locator('.ad-food')).toHaveCount(1); // only its own food
  const csrf = (await (await page.request.get('/api/auth/me')).json()).csrfToken as string;
  const headers = { 'x-csrf-token': csrf, origin: 'http://127.0.0.1:5399' };
  const menu = (await (await page.request.get('/api/public/menu')).json()) as { foods: { id: string; stallId: string }[] };
  const cheezoFood = menu.foods.find((f) => f.stallId === a.stallId)!.id;

  expect((await page.request.get(`/api/admin/stalls/${a.stallId}/foods`)).status()).toBe(403);
  expect((await page.request.put(`/api/admin/stalls/${a.stallId}/foods/${cheezoFood}/availability`, { headers, data: { available: false } })).status()).toBe(403);
  expect((await page.request.put(`/api/admin/stalls/${b.stallId}/foods/${cheezoFood}/availability`, { headers, data: { available: false } })).status()).toBe(404);
  expect((await page.request.delete(`/api/admin/stalls/${a.stallId}/foods/${cheezoFood}`, { headers })).status()).toBe(403);
  expect((await page.request.put(`/api/admin/stalls/${a.stallId}/profile`, { headers, data: { intro: 'x', weeklyHours: [] } })).status()).toBe(403);
  const after = (await (await page.request.get('/api/public/menu')).json()) as { foods: { id: string; available: boolean }[] };
  expect(after.foods.find((f) => f.id === cheezoFood)!.available).toBe(true);
});
