<script setup lang="ts">
// Admin-Categories: the stall's own menu categories (tabs on the customer stall page), sortable,
// renamed inline, deleted only when empty (server 409 otherwise), added inline.
import { nextTick, ref } from 'vue';
import type { AdminStallCategory } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import { ApiRequestError, api } from '../../api';
import SortableList from '../components/SortableList.vue';
import { fa } from '../format';
import { failedToast, savedToast, showToast } from '../toast';
import { base, panel, refreshCategories } from './store';

const newName = ref('');
const adding = ref(false);
const addError = ref('');
const editing = ref<string | null>(null);
const editName = ref('');
const rowError = ref<{ id: string; text: string } | null>(null);
const saving = ref(false);

const messageOf = (e: unknown, fallback: string) => (e instanceof ApiRequestError && e.body ? e.body.error.message : fallback);

async function add() {
  if (adding.value) return;
  const name = newName.value.trim();
  if (!name) return void (addError.value = 'نام دسته را بنویسید.');
  adding.value = true;
  addError.value = '';
  try {
    const created = await api<AdminStallCategory>(`${base()}/categories`, { method: 'POST', body: { name } });
    panel.stallCategories.push(created);
    newName.value = '';
    savedToast(created.name);
  } catch (e) {
    addError.value = messageOf(e, 'ذخیره نشد. دوباره امتحان کنید.');
  } finally {
    adding.value = false;
  }
}

async function reorder(next: AdminStallCategory[]) {
  const before = panel.stallCategories;
  panel.stallCategories = next;
  try {
    await api(`${base()}/categories/order`, { method: 'PUT', body: { ids: next.map((c) => c.id) } });
  } catch {
    panel.stallCategories = before;
    failedToast('ترتیب ذخیره نشد. دوباره امتحان کنید.');
  }
}

async function startEdit(c: AdminStallCategory) {
  editing.value = c.id;
  editName.value = c.name;
  rowError.value = null;
  await nextTick();
  document.getElementById(`edit-${c.id}`)?.focus();
}

async function rename(c: AdminStallCategory) {
  if (saving.value) return;
  saving.value = true;
  try {
    const updated = await api<AdminStallCategory>(`${base()}/categories/${c.id}`, { method: 'PATCH', body: { name: editName.value } });
    Object.assign(c, updated);
    editing.value = null;
    savedToast(updated.name);
  } catch (e) {
    rowError.value = { id: c.id, text: messageOf(e, 'ذخیره نشد.') };
  } finally {
    saving.value = false;
  }
}

async function remove(c: AdminStallCategory) {
  if (saving.value) return;
  saving.value = true;
  try {
    await api(`${base()}/categories/${c.id}`, { method: 'DELETE' });
    panel.stallCategories = panel.stallCategories.filter((x) => x.id !== c.id);
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
    <h1 class="ad-h1">دسته‌های منو</h1>
    <p class="ad-sub">همین ترتیب، ترتیب تب‌ها در صفحه‌ی غرفه است. برای جابه‌جایی بکشید.</p>

    <SortableList class="mt-4" :items="panel.stallCategories" @reorder="reorder">
      <template #default="{ item }">
        <span v-if="editing !== item.id" class="ad-list-row__body">
          <b>{{ item.name }}</b><span>{{ fa(item.foodCount) }} غذا</span>
          <span v-if="rowError?.id === item.id" class="ad-error" role="alert">{{ rowError.text }}</span>
        </span>
        <form v-else class="ad-list-row__body" style="gap: 6px" @submit.prevent="rename(item)" @keydown.esc="editing = null">
          <div class="ad-input"><input :id="`edit-${item.id}`" v-model="editName" maxlength="40" :aria-label="`نام تازه‌ی ${item.name}`" /></div>
          <span v-if="rowError?.id === item.id" class="ad-error" role="alert">{{ rowError.text }}</span>
          <span style="display: flex; gap: 8px">
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

    <form class="ad-add-inline" @submit.prevent="add">
      <div class="ad-input" :class="{ 'ad-input--error': addError }">
        <input v-model="newName" maxlength="40" placeholder="نام دسته‌ی جدید، مثلاً دسر" aria-label="نام دسته‌ی جدید" :aria-invalid="!!addError" />
      </div>
      <button type="submit" class="ad-btn ad-btn--primary" style="flex: none" :disabled="adding" :aria-busy="adding">
        <span v-if="adding" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="plus" />{{ adding ? 'در حال افزودن…' : 'افزودن' }}
      </button>
    </form>
    <span v-if="addError" class="ad-error" role="alert">{{ addError }}</span>

    <div class="el-closed-note mt-6" style="background: var(--surface-sunken); color: var(--ink)">
      <ElIcon name="info" /><span>دسته‌ای که غذا دارد حذف نمی‌شود؛ اول غذاهایش را به دسته‌ی دیگری ببرید.</span>
    </div>
  </main>
</template>
