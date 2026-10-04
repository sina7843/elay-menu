<script setup lang="ts">
// SA-StallForm: logo, name, menu order, visibility, manager account (username, one-time temporary
// password with copy, «رمز تازه»), delete with an explicit cascade warning.
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { StallCreateInputSchema, StallUpdateInputSchema, type AdminStall, type TemporaryPasswordResponse } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import ModalLayer from '../../customer/components/ModalLayer.vue';
import { ApiRequestError, api } from '../../api';
import LogoUpload from '../components/LogoUpload.vue';
import PanelSwitch from '../components/PanelSwitch.vue';
import { fa, parseInteger } from '../format';
import { failedToast, savedToast, showToast } from '../toast';
import { refreshStalls, sa } from './store';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const stall = computed(() => (props.id ? sa.stalls.find((s) => s.id === props.id) : undefined));
const s = stall.value;

const form = reactive({
  name: s?.name ?? '',
  logo: s?.logo ?? null,
  logoUrl: s?.logoUrl ?? null,
  visible: s?.visible ?? true,
  order: fa(s ? sa.stalls.indexOf(s) + 1 : sa.stalls.length + 1),
  username: s?.adminUsername ?? '',
});
const errors = reactive<Record<string, string>>({});
const busy = ref(false);
const dialog = ref<'reset' | 'delete' | null>(null);
const working = ref(false);
const copied = ref(false);

// The temporary password is shown only right after create/reset, for this stall, then dropped.
const credentials = ref<TemporaryPasswordResponse | null>(sa.credentials && sa.credentials.stallId === props.id ? sa.credentials : null);
sa.credentials = null;

const messageOf = (e: unknown) => (e instanceof ApiRequestError && e.body ? e.body.error.message : 'ذخیره نشد. دوباره امتحان کنید.');

function fieldErrors(e: unknown) {
  const details = e instanceof ApiRequestError ? e.body?.error.details : undefined;
  if (details?.length) for (const d of details) errors[d.path === 'adminUsername' ? 'username' : d.path] = d.message;
  else if (e instanceof ApiRequestError && e.status === 409) errors.username = e.body!.error.message;
  else failedToast(messageOf(e));
}

/** Moves the stall to 1-based position `pos` and saves the full order. */
async function placeAt(id: string, pos: number) {
  const ids = sa.stalls.map((x) => x.id).filter((x) => x !== id);
  ids.splice(Math.min(Math.max(pos - 1, 0), ids.length), 0, id);
  if (ids.join() === sa.stalls.map((x) => x.id).join()) return;
  await api('/api/admin/stalls/order', { method: 'PUT', body: { ids } });
}

/** Ordering after create is best effort: the stall is saved; a failure only leaves it last in the menu. */
async function placeAndRefresh(id: string, pos: number) {
  try {
    await refreshStalls();
    await placeAt(id, pos);
    await refreshStalls();
  } catch {
    showToast('غرفه ساخته شد ولی ترتیبش ذخیره نشد؛ از همین فرم دوباره ذخیره کنید.', { error: true });
  }
}

async function save() {
  if (busy.value) return;
  for (const k of Object.keys(errors)) delete errors[k];
  const pos = parseInteger(form.order);
  if (pos === null || pos < 1) errors.order = 'یک عدد از ۱ به بالا.';
  const base = { name: form.name, logo: form.logo, visible: form.visible };
  const check = props.id ? StallUpdateInputSchema.safeParse(base) : StallCreateInputSchema.safeParse({ ...base, adminUsername: form.username });
  if (!check.success) for (const i of check.error.issues) errors[i.path[0] === 'adminUsername' ? 'username' : String(i.path[0])] ??= i.message;
  // A stall without a manager account (e.g. demo data) can be edited without one.
  const needsUsername = !props.id || !!stall.value?.adminUsername;
  if (props.id && needsUsername && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(form.username.trim().toLowerCase())) errors.username ??= 'نام کاربری ۳ تا ۳۲ حرف انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط است.';
  if (Object.keys(errors).length) return;

  busy.value = true;
  try {
    let id = props.id;
    if (id) {
      await api<AdminStall>(`/api/admin/stalls/${id}`, { method: 'PATCH', body: base });
      if (stall.value?.adminUsername && form.username.trim().toLowerCase() !== stall.value.adminUsername) {
        await api(`/api/admin/stalls/${id}/account`, { method: 'PUT', body: { username: form.username } });
      }
    } else {
      const res = await api<{ stall: AdminStall; credentials: TemporaryPasswordResponse }>('/api/admin/stalls', {
        method: 'POST',
        body: { ...base, adminUsername: form.username },
      });
      id = res.stall.id;
      // The stall and its manager exist now: never risk losing the one-time password because of a later step.
      sa.credentials = { ...res.credentials, stallId: id };
      sa.stalls.push(res.stall);
      await placeAndRefresh(id, pos!);
      savedToast(form.name);
      await router.replace(`/admin/super/stalls/${id}`); // shows the one-time password
      return;
    }
    await refreshStalls();
    await placeAt(id, pos!);
    await refreshStalls();
    savedToast(form.name);
    await router.push('/admin/super');
  } catch (e) {
    fieldErrors(e);
  } finally {
    busy.value = false;
  }
}

async function resetPassword() {
  if (!props.id || working.value) return;
  working.value = true;
  try {
    credentials.value = await api<TemporaryPasswordResponse>(`/api/admin/stalls/${props.id}/account/reset-password`, { method: 'POST' });
    copied.value = false;
    dialog.value = null;
    showToast('رمز تازه ساخته شد؛ رمز قبلی دیگر کار نمی‌کند.');
  } catch (e) {
    failedToast(messageOf(e));
  } finally {
    working.value = false;
  }
}

async function copy() {
  if (!credentials.value) return;
  try {
    await navigator.clipboard.writeText(credentials.value.temporaryPassword);
    copied.value = true;
  } catch {
    showToast('کپی نشد؛ رمز را از روی صفحه بنویسید.', { error: true });
  }
}

async function remove() {
  if (!props.id || working.value) return;
  working.value = true;
  try {
    await api(`/api/admin/stalls/${props.id}`, { method: 'DELETE' });
    await refreshStalls();
    dialog.value = null;
    showToast(`«${stall.value?.name ?? form.name}» و همه‌ی غذاها و حساب مدیرش حذف شد`);
    await router.push('/admin/super');
  } catch (e) {
    failedToast(messageOf(e));
  } finally {
    working.value = false;
  }
}

const invalid = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `err-${k}` } : {});
</script>

<template>
  <header class="ad-top">
    <h1 class="ad-top__title" style="margin: 0">{{ id ? 'ویرایش غرفه' : 'غرفه‌ی جدید' }}</h1>
    <RouterLink class="ad-icon-btn" to="/admin/super" aria-label="بازگشت"><ElIcon name="back" /></RouterLink>
  </header>

  <main v-if="id && !stall" class="el-empty" style="padding-top: 64px">
    <h2>این غرفه پیدا نشد</h2>
    <RouterLink class="el-btn el-btn--inverse mt-4" to="/admin/super" style="height: 52px; padding: 0 24px">بازگشت به غرفه‌ها</RouterLink>
  </main>

  <form v-else class="pad panel-form" novalidate @submit.prevent="save">
    <section class="ad-section">
      <h2>لوگو</h2>
      <LogoUpload
        :url="form.logoUrl"
        :alt="`لوگوی ${form.name}`"
        endpoint="/api/admin/media/stall-logo"
        hint="لوگوی مربعی با پس‌زمینه‌ی شفاف (PNG یا SVG)."
        @uploaded="(m) => ((form.logo = m.name), (form.logoUrl = m.url))"
      />
    </section>

    <section class="ad-section">
      <h2>اطلاعات غرفه</h2>
      <div class="ad-field">
        <label for="s-name">نام غرفه <i>*</i></label>
        <div class="ad-input" :class="{ 'ad-input--error': errors.name }"><input id="s-name" v-model="form.name" maxlength="40" v-bind="invalid('name')" /></div>
        <span v-if="errors.name" id="err-name" class="ad-error">نام غرفه را بنویسید (حداکثر ۴۰ حرف).</span>
      </div>
      <div class="ad-field" style="margin-bottom: 0">
        <label for="s-order">ترتیب در منو</label>
        <div class="ad-input" :class="{ 'ad-input--error': errors.order }" style="width: 120px">
          <input id="s-order" v-model="form.order" inputmode="numeric" v-bind="invalid('order')" />
        </div>
        <span v-if="errors.order" id="err-order" class="ad-error">{{ errors.order }}</span>
        <span class="ad-hint"><span>غرفه با عدد کمتر جلوتر در کاشی‌های صفحه‌ی اول می‌آید.</span></span>
      </div>
    </section>

    <section class="ad-section">
      <div class="sw">
        <span id="s-visible">نمایش در منو<span class="sw__sub">خاموش کنید تا غرفه از منوی مشتری پنهان شود</span></span>
        <PanelSwitch :checked="form.visible" labelledby="s-visible" @toggle="form.visible = !form.visible" />
      </div>
    </section>

    <section class="ad-section">
      <h2>حساب مدیر غرفه</h2>
      <div v-if="!id || stall?.adminUsername" class="ad-field">
        <label for="s-user">نام کاربری <i>*</i></label>
        <div class="ad-input" :class="{ 'ad-input--error': errors.username }">
          <ElIcon name="user" /><input id="s-user" v-model="form.username" dir="ltr" style="text-align: right" autocomplete="off" autocapitalize="none" spellcheck="false" v-bind="invalid('username')" />
        </div>
        <span v-if="errors.username" id="err-username" class="ad-error">{{ errors.username }}</span>
        <span v-if="!id" class="ad-hint"><span>رمز موقت بعد از ذخیره ساخته و فقط یک بار نشان داده می‌شود.</span></span>
      </div>
      <div v-if="id && stall?.adminUsername" class="ad-cred">
        <template v-if="credentials">
          <span class="muted">رمز موقت (فقط یک بار نمایش داده می‌شود)</span>
          <code aria-label="رمز موقت">{{ credentials.temporaryPassword }}</code>
        </template>
        <span v-else class="muted">رمز فعلی دیده نمی‌شود. اگر مدیر غرفه رمزش را فراموش کرده، رمز تازه بسازید.</span>
        <div style="display: flex; gap: 8px; margin-top: 6px">
          <button v-if="credentials" type="button" class="ad-btn ad-btn--ghost" style="height: 44px; flex: 1" @click="copy">
            <ElIcon :name="copied ? 'check' : 'copy'" />{{ copied ? 'کپی شد' : 'کپی' }}
          </button>
          <button type="button" class="ad-btn ad-btn--ghost" style="height: 44px; flex: 1" aria-haspopup="dialog" @click="dialog = 'reset'">
            <ElIcon name="key" />رمز تازه
          </button>
        </div>
      </div>
    </section>

    <section v-if="id" class="ad-section" style="border-bottom: 0">
      <button type="button" class="ad-btn ad-btn--danger ad-btn--block" aria-haspopup="dialog" @click="dialog = 'delete'"><ElIcon name="trash" />حذف غرفه</button>
      <p class="ad-hint mt-2"><span>با حذف غرفه همه‌ی غذاها و حساب مدیرش هم حذف می‌شود.</span></p>
    </section>

    <div class="ad-actions">
      <button type="submit" class="ad-btn ad-btn--primary" :disabled="busy" :aria-busy="busy">
        <span v-if="busy" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="check" />
        {{ busy ? 'در حال ذخیره…' : id ? 'ذخیره‌ی غرفه' : 'ساخت غرفه و حساب مدیر' }}
      </button>
    </div>
  </form>

  <ModalLayer v-if="dialog" @close="dialog = null">
    <div class="ad-dialog" role="alertdialog" aria-modal="true" aria-labelledby="d-title" aria-describedby="d-desc">
      <template v-if="dialog === 'reset'">
        <h2 id="d-title">برای «{{ stall?.adminUsername }}» رمز تازه ساخته شود؟</h2>
        <p id="d-desc">رمز فعلی همین الان باطل می‌شود و مدیر غرفه از همه‌ی دستگاه‌ها خارج می‌شود. رمز تازه فقط یک بار نشان داده می‌شود.</p>
        <div class="ad-dialog__actions">
          <button type="button" class="ad-btn ad-btn--accent" :disabled="working" :aria-busy="working" @click="resetPassword">
            <span v-if="working" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="key" />رمز تازه
          </button>
          <button type="button" class="ad-btn ad-btn--ghost" style="flex: 1" @click="dialog = null">انصراف</button>
        </div>
      </template>
      <template v-else>
        <h2 id="d-title">«{{ stall?.name }}» حذف شود؟</h2>
        <p id="d-desc">
          {{ fa(stall?.foodCount ?? 0) }} غذا، دسته‌های منوی غرفه، آمار پرطرفدارها و حساب مدیر «{{ stall?.adminUsername ?? '—' }}» هم برای همیشه حذف می‌شوند و
          برنمی‌گردند. اگر فقط موقتاً نباید دیده شود، به جای حذف «نمایش در منو» را خاموش کنید.
        </p>
        <div class="ad-dialog__actions">
          <button type="button" class="ad-btn ad-btn--accent" :disabled="working" :aria-busy="working" @click="remove">
            <span v-if="working" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="trash" />{{ working ? 'در حال حذف…' : 'حذف' }}
          </button>
          <button type="button" class="ad-btn ad-btn--ghost" style="flex: 1" @click="dialog = null">انصراف</button>
        </div>
      </template>
    </div>
  </ModalLayer>
</template>
