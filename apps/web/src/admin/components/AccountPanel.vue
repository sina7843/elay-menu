<script setup lang="ts">
// AccountMenu (Admin-Account; reused by the super-admin settings): username, change password
// (current / new / confirm — save stays disabled until they match), forgotten-password guidance, logout.
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ChangePasswordInputSchema } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import { ApiRequestError, account, api, logout } from '../../api';
import { failedToast, showToast } from '../toast';

const props = defineProps<{ logoUrl?: string | null; subtitle: string; forgotHint?: string }>();
const router = useRouter();
const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' });
const errors = reactive<Record<string, string>>({});
const busy = ref(false);
const leaving = ref(false);

const mismatch = computed(() => !!form.confirmPassword && form.confirmPassword !== form.newPassword);
const ready = computed(() => !!form.currentPassword && !!form.newPassword && form.confirmPassword === form.newPassword);

async function save() {
  if (busy.value || !ready.value) return;
  for (const k of Object.keys(errors)) delete errors[k];
  const r = ChangePasswordInputSchema.safeParse(form);
  if (!r.success) {
    for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
    return;
  }
  busy.value = true;
  try {
    await api('/api/auth/change-password', { method: 'POST', body: form });
    Object.assign(form, { currentPassword: '', newPassword: '', confirmPassword: '' });
    showToast('رمز تازه ذخیره شد. دستگاه‌های دیگر از پنل خارج شدند.');
  } catch (e) {
    const details = e instanceof ApiRequestError ? e.body?.error.details : undefined;
    if (details?.length) for (const d of details) errors[d.path] = d.message;
    else failedToast(e instanceof ApiRequestError && e.body ? e.body.error.message : undefined);
  } finally {
    busy.value = false;
  }
}

async function signOut() {
  if (leaving.value) return;
  leaving.value = true;
  try {
    await logout();
    await router.replace('/admin/login');
  } catch {
    failedToast('خروج انجام نشد. اتصال را بررسی کنید و دوباره امتحان کنید.');
  } finally {
    leaving.value = false;
  }
}
void props;
</script>

<template>
  <div class="ad-profile mt-4">
    <span class="ad-top__logo" style="width: 48px; height: 48px"><img v-if="logoUrl" :src="logoUrl" alt="" /></span>
    <span class="ad-profile__body"><b dir="ltr" style="text-align: right">{{ account?.username }}</b><span>{{ subtitle }}</span></span>
  </div>

  <form class="ad-section" novalidate @submit.prevent="save">
    <h2>تغییر رمز</h2>
    <input type="text" name="username" autocomplete="username" :value="account?.username" class="visually-hidden" tabindex="-1" aria-hidden="true" />
    <div class="ad-field">
      <label for="pw-current">رمز فعلی</label>
      <div class="ad-input" :class="{ 'ad-input--error': errors.currentPassword }">
        <ElIcon name="key" /><input id="pw-current" v-model="form.currentPassword" type="password" placeholder="رمز فعلی" autocomplete="current-password" :aria-invalid="!!errors.currentPassword" />
      </div>
      <span v-if="errors.currentPassword" class="ad-error" role="alert">{{ errors.currentPassword }}</span>
    </div>
    <div class="ad-field">
      <label for="pw-new">رمز تازه</label>
      <div class="ad-input" :class="{ 'ad-input--error': errors.newPassword }">
        <ElIcon name="key" /><input id="pw-new" v-model="form.newPassword" type="password" placeholder="حداقل ۸ حرف" autocomplete="new-password" aria-describedby="pw-rule" :aria-invalid="!!errors.newPassword" />
      </div>
      <span id="pw-rule" class="ad-hint"><span>حداقل ۸ حرف، ترکیبی از حرف و عدد.</span></span>
      <span v-if="errors.newPassword" class="ad-error" role="alert">{{ errors.newPassword }}</span>
    </div>
    <div class="ad-field" style="margin-bottom: 0">
      <label for="pw-confirm">تکرار رمز تازه</label>
      <div class="ad-input" :class="{ 'ad-input--error': mismatch }">
        <ElIcon name="key" /><input id="pw-confirm" v-model="form.confirmPassword" type="password" placeholder="دوباره بنویسید" autocomplete="new-password" :aria-invalid="mismatch" aria-describedby="pw-hint" />
      </div>
      <span v-if="mismatch" class="ad-error" role="alert">با رمز تازه یکی نیست.</span>
    </div>
    <button type="submit" class="ad-btn ad-btn--primary ad-btn--block mt-4" :disabled="!ready || busy" :aria-busy="busy">
      <span v-if="busy" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="check" />{{ busy ? 'در حال ذخیره…' : 'ذخیره‌ی رمز تازه' }}
    </button>
    <p id="pw-hint" class="ad-hint mt-2"><span>تا دو رمز یکی نشوند دکمه غیرفعال می‌ماند.</span></p>
  </form>

  <section style="padding-top: 8px">
    <div v-if="forgotHint" class="ad-menu-row" role="note">
      <ElIcon name="info" />رمز را فراموش کرده‌اید؟<span class="ad-menu-row__end">{{ forgotHint }}</span>
    </div>
    <button type="button" class="ad-menu-row ad-menu-row--danger" :disabled="leaving" :aria-busy="leaving" @click="signOut">
      <span v-if="leaving" class="el-spinner" aria-hidden="true"></span>
      <svg v-else class="el-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>
      {{ leaving ? 'در حال خروج…' : 'خروج از پنل' }}
    </button>
  </section>
</template>
