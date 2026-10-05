<script setup lang="ts">
// SA-Categories: foodcourt-wide categories (the «دسته‌ها» tiles), sortable, each with an icon from the
// supplied CategoryIcons set; edit name/icon inline; deleting a category with foods is refused (409).
import { nextTick, reactive, ref } from 'vue';
import { CATEGORY_ICON_KEYS, type AdminCategory } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import { ApiRequestError, api } from '../../api';
import SortableList from '../components/SortableList.vue';
import { fa } from '../format';
import { failedToast, savedToast, showToast } from '../toast';
import { refreshCategories, sa } from './store';

type Icon = (typeof CATEGORY_ICON_KEYS)[number];
const ICON_NAMES: Record<Icon, string> = {
  pizza: 'پیتزا',
  burger: 'برگر',
  kebab: 'گریل و کباب',
  'fried-chicken': 'سوخاری',
  iranian: 'غذای ایرانی',
  coffee: 'قهوه',
  tea: 'چای و دمنوش',
  dessert: 'دسر',
  grill: 'گریل',
  milkshake: 'میلک‌شیک',
  smoothie: 'اسموتی',
  steak: 'استیک',
  sushi: 'سوشی',
  sandwich: 'ساندویچ',
};

const draft = reactive({ name: '', icon: null as Icon | null });
const addError = ref('');
const adding = ref(false);
const editing = ref<string | null>(null);
const edit = reactive({ name: '', icon: 'pizza' as Icon });
const rowError = ref<{ id: string; text: string } | null>(null);
const saving = ref(false);
const messageOf = (e: unknown, fallback: string) => (e instanceof ApiRequestError && e.body ? e.body.error.message : fallback);

async function add() {
  if (adding.value) return;
  if (!draft.name.trim()) return void (addError.value = 'نام دسته را بنویسید.');
  if (!draft.icon) return void (addError.value = 'یک آیکون انتخاب کنید.');
  adding.value = true;
  addError.value = '';
  try {
    const created = await api<AdminCategory>('/api/admin/categories', { method: 'POST', body: { name: draft.name, icon: draft.icon } });
    sa.categories.push(created);
    savedToast(created.name);
    Object.assign(draft, { name: '', icon: null });
  } catch (e) {
    addError.value = messageOf(e, 'ذخیره نشد. دوباره امتحان کنید.');
  } finally {
    adding.value = false;
  }
}

async function reorder(next: AdminCategory[]) {
  const before = sa.categories;
  sa.categories = next;
  try {
    await api('/api/admin/categories/order', { method: 'PUT', body: { ids: next.map((c) => c.id) } });
  } catch {
    sa.categories = before;
    failedToast('ترتیب ذخیره نشد. دوباره امتحان کنید.');
  }
}

async function startEdit(c: AdminCategory) {
  editing.value = c.id;
  Object.assign(edit, { name: c.name, icon: c.icon });
  rowError.value = null;
  await nextTick();
  document.getElementById(`cat-${c.id}`)?.focus();
}

async function save(c: AdminCategory) {
  if (saving.value) return;
  saving.value = true;
  try {
    Object.assign(c, await api<AdminCategory>(`/api/admin/categories/${c.id}`, { method: 'PATCH', body: { ...edit } }));
    editing.value = null;
    savedToast(c.name);
  } catch (e) {
    rowError.value = { id: c.id, text: messageOf(e, 'ذخیره نشد.') };
  } finally {
    saving.value = false;
  }
}

async function remove(c: AdminCategory) {
  if (saving.value) return;
  saving.value = true;
  try {
    await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
    sa.categories = sa.categories.filter((x) => x.id !== c.id);
    editing.value = null;
    showToast(`«${c.name}» حذف شد`);
  } catch (e) {
    rowError.value = { id: c.id, text: messageOf(e, 'حذف نشد.') };
    if (e instanceof ApiRequestError && e.status === 409) await refreshCategories().catch(() => undefined);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="pad mt-6 panel-page">
    <h1 class="ad-h1">دسته‌های فودکورت</h1>
    <p class="ad-sub">کاشی‌های «دسته‌ها» در صفحه‌ی اول، به همین ترتیب. هر غذا باید یکی از این‌ها را داشته باشد.</p>

    <SortableList class="mt-4" :items="sa.categories" @reorder="reorder">
      <template #default="{ item }">
        <span v-if="editing !== item.id" class="cat-tile" aria-hidden="true"><ElIcon :name="`cat:${item.icon}`" /></span>
        <span v-if="editing !== item.id" class="ad-list-row__body">
          <b>{{ item.name }}</b>
          <span>{{ fa(item.foodCount) }} غذا از {{ fa(item.stallCount) }} غرفه</span>
          <span v-if="rowError?.id === item.id" class="ad-error" role="alert">{{ rowError.text }}</span>
        </span>
        <form v-else class="ad-list-row__body" style="gap: 8px; padding: 8px 0" @submit.prevent="save(item)" @keydown.esc="editing = null">
          <div class="ad-input"><input :id="`cat-${item.id}`" v-model="edit.name" maxlength="30" :aria-label="`نام تازه‌ی ${item.name}`" /></div>
          <div class="ad-icon-grid" role="group" aria-label="آیکون">
            <button v-for="k in CATEGORY_ICON_KEYS" :key="k" type="button" :aria-pressed="edit.icon === k" :aria-label="ICON_NAMES[k]" @click="edit.icon = k">
              <ElIcon :name="`cat:${k}`" />
            </button>
          </div>
          <span v-if="rowError?.id === item.id" class="ad-error" role="alert">{{ rowError.text }}</span>
          <span style="display: flex; gap: 8px; flex-wrap: wrap">
            <button type="submit" class="ad-btn ad-btn--primary" style="height: 44px" :disabled="saving">ذخیره</button>
            <button type="button" class="ad-btn ad-btn--danger" style="height: 44px" :disabled="saving" @click="remove(item)"><ElIcon name="trash" />حذف</button>
            <button type="button" class="ad-btn ad-btn--ghost" style="height: 44px" @click="editing = null">انصراف</button>
          </span>
        </form>
      </template>
      <template #actions="{ item }">
        <button v-if="editing !== item.id" type="button" class="ad-icon-btn" :aria-label="`ویرایش ${item.name}`" @click="startEdit(item)">
          <svg class="el-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
        </button>
      </template>
    </SortableList>

    <form class="ad-section" style="border-bottom: 0; margin-top: 8px; padding: 16px; background: var(--surface); border: 1px solid var(--line-strong)" @submit.prevent="add">
      <h2>دسته‌ی جدید</h2>
      <div class="ad-field">
        <label for="new-cat">نام دسته <i>*</i></label>
        <div class="ad-input" :class="{ 'ad-input--error': addError && !draft.name.trim() }"><input id="new-cat" v-model="draft.name" maxlength="30" /></div>
      </div>
      <div class="ad-field" role="group" aria-labelledby="new-icon-label">
        <span id="new-icon-label" class="ad-field-label">آیکون <i>*</i></span>
        <div class="ad-icon-grid">
          <button v-for="k in CATEGORY_ICON_KEYS" :key="k" type="button" :aria-pressed="draft.icon === k" :aria-label="ICON_NAMES[k]" @click="draft.icon = k">
            <ElIcon :name="`cat:${k}`" />
          </button>
        </div>
        <span class="ad-hint"><span>آیکون تازه را طراح به همین سبک خطی اضافه می‌کند.</span></span>
      </div>
      <span v-if="addError" class="ad-error" role="alert">{{ addError }}</span>
      <button type="submit" class="ad-btn ad-btn--primary ad-btn--block mt-2" :disabled="adding" :aria-busy="adding">
        <span v-if="adding" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="plus" />{{ adding ? 'در حال افزودن…' : 'افزودن دسته' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
/* Category icon on a square tile, as in SA-Categories. */
.cat-tile {
  width: 48px;
  height: 48px;
  flex: none;
  display: grid;
  place-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--accent);
}
.cat-tile :deep(svg) {
  width: 26px;
  height: 26px;
}
</style>
