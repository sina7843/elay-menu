<script setup lang="ts">
// SA-Settings: foodcourt name and logo, customer menu open/closed with the closed message, the fixed menu
// URL (deployment configuration, read-only; never edited or generated here) and the super admin's account.
import { computed, reactive, ref } from 'vue';
import { FoodcourtInputSchema, type AdminFoodcourt } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import logoUrl from '../../assets/logos/elay-logo.svg';
import { ApiRequestError, api } from '../../api';
import AccountPanel from '../components/AccountPanel.vue';
import LogoUpload from '../components/LogoUpload.vue';
import PanelSwitch from '../components/PanelSwitch.vue';
import { fa } from '../format';
import { failedToast, showToast } from '../toast';
import { sa } from './store';

const fc = computed(() => sa.foodcourt!);
const form = reactive({
  name: fc.value.name,
  logo: fc.value.logo,
  logoUrl: fc.value.logoUrl,
  menuOpen: fc.value.menuOpen,
  closedMessage: fc.value.closedMessage,
});
const errors = reactive<Record<string, string>>({});
const busy = ref(false);

async function save() {
  if (busy.value) return;
  for (const k of Object.keys(errors)) delete errors[k];
  const body = { name: form.name, logo: form.logo, menuOpen: form.menuOpen, closedMessage: form.closedMessage };
  const r = FoodcourtInputSchema.safeParse(body);
  if (!r.success) {
    for (const i of r.error.issues) errors[String(i.path[0])] ??= i.path[0] === 'name' ? 'نام فودکورت را بنویسید (حداکثر ۶۰ حرف).' : 'حداکثر ۲۰۰ حرف.';
    return;
  }
  busy.value = true;
  try {
    sa.foodcourt = await api<AdminFoodcourt>('/api/admin/foodcourt', { method: 'PUT', body });
    showToast(form.menuOpen ? 'تنظیمات ذخیره شد' : 'تنظیمات ذخیره شد؛ منوی مشتری الان بسته است');
  } catch (e) {
    const details = e instanceof ApiRequestError ? e.body?.error.details : undefined;
    if (details?.length) for (const d of details) errors[d.path] = d.message;
    else failedToast();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="pad mt-6 settings-page" novalidate @submit.prevent="save">
    <h1 class="ad-h1">تنظیمات</h1>
    <p class="ad-sub">فودکورت، دسترس‌پذیری منو و حساب شما</p>

    <section class="ad-section">
      <h2>فودکورت</h2>
      <LogoUpload
        :url="form.logoUrl ?? logoUrl"
        :alt="`لوگوی ${form.name}`"
        endpoint="/api/admin/media/foodcourt-logo"
        hint="SVG یا PNG شفاف. در هدر همه‌ی صفحه‌های منو می‌آید."
        @uploaded="(m) => ((form.logo = m.name), (form.logoUrl = m.url))"
      />
      <div class="ad-field mt-4" style="margin-bottom: 0">
        <label for="fc-name">نام فودکورت <i>*</i></label>
        <div class="ad-input" :class="{ 'ad-input--error': errors.name }"><input id="fc-name" v-model="form.name" maxlength="60" :aria-invalid="!!errors.name" /></div>
        <span v-if="errors.name" class="ad-error" role="alert">{{ errors.name }}</span>
        <span class="ad-hint"><span>در عنوان صفحه‌ی مرورگر و پیام‌ها.</span></span>
      </div>
    </section>

    <section class="ad-section">
      <h2>منوی مشتری</h2>
      <div class="sw">
        <span id="fc-open">منو باز است<span class="sw__sub">خاموش کنید تا مشتری به جای منو پیام زیر را ببیند</span></span>
        <PanelSwitch :checked="form.menuOpen" labelledby="fc-open" @toggle="form.menuOpen = !form.menuOpen" />
      </div>
      <div class="ad-field mt-3">
        <label for="fc-msg">پیام وقتی منو بسته است</label>
        <textarea id="fc-msg" v-model="form.closedMessage" class="ad-textarea" style="min-height: 72px" maxlength="200" placeholder="مثلاً: ال‌آی از ساعت ۱۲:۰۰ ظهر باز می‌شود."></textarea>
        <span class="ad-hint"><span></span><span>{{ fa(form.closedMessage.length) }} / ۲۰۰</span></span>
        <span v-if="errors.closedMessage" class="ad-error" role="alert">{{ errors.closedMessage }}</span>
      </div>
      <div class="ad-field" style="margin-bottom: 0">
        <span id="fc-url" class="ad-field-label">آدرس منو</span>
        <div class="ad-readonly" aria-labelledby="fc-url" :class="{ 'is-missing': !fc.publicMenuUrl }">
          <svg class="el-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>
          <span v-if="fc.publicMenuUrl" dir="ltr">{{ fc.publicMenuUrl }}</span>
          <span v-else dir="rtl">هنوز تنظیم نشده</span>
        </div>
        <span v-if="fc.publicMenuUrl" class="ad-hint"><span>QRهای روی میزها همین آدرس را باز می‌کنند؛ این آدرس هیچ‌وقت عوض نمی‌شود.</span></span>
        <span v-else class="ad-error" role="note">
          آدرسی که روی QRهای میزها چاپ شده باید در تنظیمات استقرار سرور (PUBLIC_MENU_URL) ثبت شود. این آدرس از این پنل ساخته یا عوض نمی‌شود.
        </span>
      </div>
    </section>

    <section style="padding-top: 8px">
      <h2 style="margin: 12px 0 4px; font-size: 16px; font-weight: 900">حساب شما</h2>
    </section>
    <div class="ad-actions" style="bottom: calc(72px + env(safe-area-inset-bottom, 0px))">
      <button type="submit" class="ad-btn ad-btn--primary" :disabled="busy" :aria-busy="busy">
        <span v-if="busy" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="check" />{{ busy ? 'در حال ذخیره…' : 'ذخیره‌ی تنظیمات' }}
      </button>
    </div>
  </form>
  <div class="pad settings-account"><AccountPanel compact /></div>
</template>

<style scoped>
.settings-page {
  padding-bottom: 0;
}
.settings-account {
  padding-bottom: 180px;
}
.is-missing {
  direction: rtl;
  justify-content: flex-start;
  color: var(--ink-muted);
}
</style>
