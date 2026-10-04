// Super-admin panel against the real API (see server.ts), checked from the customer side too.
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

test.use({ serviceWorkers: 'block' });

const control = async (body: object) => {
  const res = await fetch('http://127.0.0.1:5311', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ stallId?: string }>;
};

test.beforeEach(async ({ page, context }) => {
  await control({ op: 'reset' });
  await control({ op: 'superAdmin', username: 'root', password: 'rootpass1' });
  await page.clock.setFixedTime(new Date('2026-10-04T10:00:00Z'));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/admin/login');
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
}
const signOut = async (page: Page) => {
  await page.request.post('/api/auth/logout', {
    headers: { 'x-csrf-token': (await (await page.request.get('/api/auth/me')).json()).csrfToken, origin: 'http://127.0.0.1:5399' },
  });
};
const card = (page: Page, name: string) => page.locator('.ad-stall-card', { hasText: name });
const menuJson = async (page: Page) => (await (await page.request.get('/api/public/menu')).json()) as { stalls: { name: string }[]; categories: { name: string }[] };

test('stall list, search; create stall with PNG logo crop and manager; temporary password once; manager can sign in', async ({ page }) => {
  await signIn(page, 'root', 'rootpass1');
  await expect(page).toHaveURL(/\/admin\/super$/);
  await expect(page.locator('.ad-sub').first()).toHaveText('۷ غرفه · ۷ در منو');
  await page.getByLabel('جست‌وجوی غرفه').fill('برگر');
  await expect(page.locator('.ad-stall-card')).toHaveCount(1);
  await page.getByLabel('جست‌وجوی غرفه').fill('');

  await page.getByRole('link', { name: 'افزودن غرفه' }).click();
  await page.getByRole('button', { name: 'ساخت غرفه و حساب مدیر' }).click();
  await expect(page.getByText('نام غرفه را بنویسید (حداکثر ۴۰ حرف).')).toBeVisible();

  const png = await sharp({ create: { width: 500, height: 300, channels: 4, background: { r: 20, g: 55, b: 89, alpha: 1 } } }).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('dialog', { name: 'برش عکس' }).getByRole('button', { name: 'استفاده از این برش' }).click();
  await expect(page.locator('.ad-upload img')).toHaveAttribute('src', /\/api\/media\/[a-f0-9]{24}\.png$/);
  await page.getByLabel('نام غرفه').fill('قهوه‌خانه');
  await page.getByLabel('ترتیب در منو').fill('۱');
  await page.getByLabel('نام کاربری').fill('qahve');
  await page.getByRole('button', { name: 'ساخت غرفه و حساب مدیر' }).click();

  await expect(page.getByRole('heading', { name: 'ویرایش غرفه' })).toBeVisible();
  const temp = (await page.getByLabel('رمز موقت').textContent())!.trim();
  expect(temp).toMatch(/^[A-Za-z0-9]{12}$/);
  await page.getByRole('button', { name: 'کپی' }).click();
  await expect(page.getByRole('button', { name: 'کپی شد' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(temp);
  await page.reload();
  await expect(page.getByLabel('رمز موقت')).toHaveCount(0); // shown once only
  await expect(page.getByText('رمز فعلی دیده نمی‌شود')).toBeVisible();

  await page.goto('/admin/super');
  await expect(page.locator('.ad-stall-card').first()).toContainText('قهوه‌خانه'); // order 1
  await expect(card(page, 'قهوه‌خانه')).toContainText('بدون غذا، هنوز در منو نیست');
  expect((await menuJson(page)).stalls.map((s) => s.name)).not.toContain('قهوه‌خانه'); // empty stalls stay hidden

  await signOut(page);
  await signIn(page, 'qahve', temp);
  await expect(page).toHaveURL(/\/admin\/stall$/);
  await expect(page.getByRole('heading', { name: 'خوش آمدید' })).toBeVisible();
});

test('duplicate username and malicious SVG logo are refused with messages', async ({ page }) => {
  await control({ op: 'stallAdmin', stall: 'cheezo', username: 'cheezo', password: 'cheezo123' });
  await signIn(page, 'root', 'rootpass1');
  await expect(page).toHaveURL(/\/admin\/super$/);
  await page.goto('/admin/super/stalls/new');
  await page.getByLabel('نام غرفه').fill('تکراری');
  await page.getByLabel('نام کاربری').fill('cheezo');
  await page.getByRole('button', { name: 'ساخت غرفه و حساب مدیر' }).click();
  await expect(page.getByText('این نام کاربری قبلاً استفاده شده است.')).toBeVisible();
  const evil = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script></svg>';
  await page.locator('input[type=file]').setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(evil) });
  await expect(page.getByRole('alert')).toContainText('این SVG پذیرفته نمی‌شود');
});

test('reset password: new one shown once, old password and sessions stop working', async ({ page, browser }) => {
  await control({ op: 'stallAdmin', stall: 'hayat', username: 'hayat', password: 'hayat1234' });
  const managerCtx = await browser.newContext({ serviceWorkers: 'block' });
  const manager = await managerCtx.newPage();
  await signIn(manager, 'hayat', 'hayat1234');
  await expect(manager).toHaveURL(/\/admin\/stall$/);

  await signIn(page, 'root', 'rootpass1');
  await card(page, 'حیاط').click();
  await page.getByRole('button', { name: 'رمز تازه' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('رمز فعلی همین الان باطل می‌شود');
  await page.getByRole('alertdialog').getByRole('button', { name: 'رمز تازه' }).click();
  const temp = (await page.getByLabel('رمز موقت').textContent())!.trim();

  expect((await manager.request.get('/api/auth/me')).status()).toBe(401); // session revoked
  await signOut(page);
  await signIn(page, 'hayat', 'hayat1234');
  await expect(page.getByText('نام کاربری یا رمز درست نیست.')).toBeVisible();
  await page.getByLabel('رمز عبور').fill(temp);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).toHaveURL(/\/admin\/stall$/);
  await managerCtx.close();
});

test('edit name, order and visibility; customer menu follows', async ({ page }) => {
  await signIn(page, 'root', 'rootpass1');
  await card(page, 'حیاط').click();
  await page.getByLabel('نام غرفه').fill('حیاط سبز');
  await page.getByLabel('ترتیب در منو').fill('1');
  await page.getByRole('button', { name: 'ذخیره‌ی غرفه' }).click();
  await expect(page).toHaveURL(/\/admin\/super$/);
  await expect(page.locator('.ad-stall-card').first()).toContainText('حیاط سبز');
  expect((await menuJson(page)).stalls[0]!.name).toBe('حیاط سبز');

  await card(page, 'بلو برگر').click();
  await page.getByRole('switch', { name: /نمایش در منو/ }).click();
  await page.getByRole('button', { name: 'ذخیره‌ی غرفه' }).click();
  await expect(card(page, 'بلو برگر')).toHaveClass(/ad-stall-card--off/);
  await expect(page.locator('.ad-sub').first()).toHaveText('۷ غرفه · ۶ در منو');
  expect((await menuJson(page)).stalls.map((s) => s.name)).not.toContain('بلو برگر');
});

test('delete stall: explicit cascade warning; foods, account and customer listing gone', async ({ page }) => {
  await control({ op: 'stallAdmin', stall: 'dokhan-dokan', username: 'dokhan', password: 'dokhan123' });
  await signIn(page, 'root', 'rootpass1');
  await card(page, 'دوخان دکان').click();
  await page.getByRole('button', { name: 'حذف غرفه' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('۲ غذا');
  await expect(dialog).toContainText('حساب مدیر «dokhan»');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'حذف غرفه' }).click();
  await dialog.getByRole('button', { name: 'حذف' }).click();
  await expect(page).toHaveURL(/\/admin\/super$/);
  await expect(card(page, 'دوخان دکان')).toHaveCount(0);
  const menu = await menuJson(page);
  expect(JSON.stringify(menu)).not.toMatch(/دوخان|کباب کوبیده|باقلوا/);
  await signOut(page);
  await signIn(page, 'dokhan', 'dokhan123');
  await expect(page.getByText('نام کاربری یا رمز درست نیست.')).toBeVisible();
});

test('foodcourt categories: add with icon, rename/icon, keyboard reorder, used category protected', async ({ page }) => {
  await signIn(page, 'root', 'rootpass1');
  await page.getByRole('link', { name: 'دسته‌ها' }).click();
  await expect(page.locator('.ad-list-row').first()).toContainText('۲ غذا از ۱ غرفه'); // پیتزا
  await page.getByRole('button', { name: 'افزودن دسته' }).click();
  await expect(page.getByRole('alert')).toHaveText('نام دسته را بنویسید.');
  await page.getByLabel('نام دسته').fill('نوشیدنی');
  await page.getByRole('group', { name: /آیکون */ }).getByRole('button', { name: 'دسر' }).click();
  await page.getByRole('button', { name: 'افزودن دسته' }).click();
  await expect(page.locator('.ad-list-row').last()).toContainText('نوشیدنی');

  await page.getByRole('button', { name: /جابه‌جایی نوشیدنی/ }).focus();
  await page.keyboard.press('ArrowUp');
  await page.reload();
  await expect(page.locator('.ad-list-row__body b').nth(7)).toHaveText('نوشیدنی');

  await page.getByRole('button', { name: 'ویرایش نوشیدنی' }).click();
  await page.getByLabel('نام تازه‌ی نوشیدنی').fill('نوشیدنی سرد');
  await page.locator('form.ad-list-row__body').getByRole('button', { name: 'قهوه' }).click();
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(page.locator('.ad-list-row__body b').nth(7)).toHaveText('نوشیدنی سرد');

  await page.getByRole('button', { name: 'ویرایش پیتزا' }).click();
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('این دسته غذا دارد و حذف نمی‌شود.');
  await page.getByRole('button', { name: 'انصراف' }).click();
  await page.getByRole('button', { name: 'ویرایش نوشیدنی سرد' }).click();
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.getByText('نوشیدنی سرد')).toHaveCount(0);
});

test('settings: close the menu with a message, rename, unconfigured menu URL, own password', async ({ page }) => {
  await signIn(page, 'root', 'rootpass1');
  await page.getByRole('link', { name: 'تنظیمات' }).click();
  await expect(page.getByText('هنوز تنظیم نشده')).toBeVisible();
  await expect(page.getByText(/PUBLIC_MENU_URL/)).toBeVisible();
  await page.getByLabel('نام فودکورت').fill('ال‌آی مرکزی');
  await page.getByRole('switch', { name: /منو باز است/ }).click();
  await page.getByLabel('پیام وقتی منو بسته است').fill('تا ساعت ۱۸ بسته‌ایم.');
  await page.getByRole('button', { name: 'ذخیره‌ی تنظیمات' }).click();
  await expect(page.locator('.ad-toast')).toContainText('منوی مشتری الان بسته است');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'منو الان در دسترس نیست' })).toBeVisible();
  await expect(page.getByText('تا ساعت ۱۸ بسته‌ایم.')).toBeVisible();
  await expect(page).toHaveTitle('منوی ال‌آی مرکزی');

  // Admins keep access while the menu is closed.
  await page.goto('/admin/super/settings');
  await page.getByRole('switch', { name: /منو باز است/ }).click();
  await page.getByRole('button', { name: 'ذخیره‌ی تنظیمات' }).click();
  await expect(page.locator('.ad-toast')).toContainText('تنظیمات ذخیره شد');
  await expect(page.locator('.ad-toast')).not.toContainText('بسته');
  await page.goto('/');
  await expect(page.locator('.el-stall')).toHaveCount(7);

  await page.goto('/admin/super/settings');
  await page.getByRole('button', { name: 'تغییر رمز' }).click();
  await page.getByLabel('رمز فعلی').fill('rootpass1');
  await page.getByLabel('رمز تازه', { exact: true }).fill('rootpass2');
  await page.getByLabel('تکرار رمز تازه').fill('rootpass2');
  await page.getByRole('button', { name: 'ذخیره‌ی رمز تازه' }).click();
  await expect(page.locator('.ad-toast')).toContainText('رمز تازه ذخیره شد');
  await page.getByRole('button', { name: 'خروج از پنل' }).click();
  await signIn(page, 'root', 'rootpass2');
  await expect(page).toHaveURL(/\/admin\/super$/);
});
