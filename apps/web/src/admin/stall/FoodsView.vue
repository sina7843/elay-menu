<script setup lang="ts">
// Admin-Foods + Admin-Empty: SetupSteps until the first food exists (the stall stays hidden from
// customers meanwhile), then the grouped list with search, category chips and the availability switch.
import { computed, onMounted, ref } from 'vue';
import type { AdminFood, PublicMenu } from '@elay/shared';
import { DEFAULT_WEEKLY_HOURS, matchesTokens, searchTokens } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import FoodImage from '../../customer/components/FoodImage.vue';
import { api } from '../../api';
import PanelSwitch from '../components/PanelSwitch.vue';
import { fa, shortDate, today } from '../format';
import { failedToast, showToast } from '../toast';
import { base, panel, putFood } from './store';

const q = ref('');
const category = ref<string | null>(null);
const popular = ref(new Set<string>());

onMounted(async () => {
  // Popularity is public menu data; the tag is informative only, so failures are ignored.
  const menu = await api<PublicMenu>('/api/public/menu').catch(() => null);
  popular.value = new Set(menu?.popularIds ?? []);
});

const counts = computed(() => ({
  total: panel.foods.length,
  sold: panel.foods.filter((f) => !f.available).length,
  deals: panel.foods.filter((f) => f.discountActive).length,
}));

const groups = computed(() => {
  const tokens = searchTokens(q.value);
  return panel.stallCategories
    .filter((sc) => !category.value || sc.id === category.value)
    .map((sc) => ({ ...sc, foods: panel.foods.filter((f) => f.stallCategoryId === sc.id && matchesTokens(tokens, f.name, f.description)) }))
    .filter((g) => g.foods.length);
});

function dealTag(f: AdminFood) {
  if (!f.discount) return null;
  const t = today();
  if (f.discount.endDate < t) return null;
  return f.discount.startDate > t ? `${fa(f.discount.percent)}٪ از ${shortDate(f.discount.startDate)}` : `${fa(f.discount.percent)}٪ تا ${shortDate(f.discount.endDate)}`;
}

/** Saved at once; the switch flips immediately and rolls back if the server refuses. */
async function toggle(f: AdminFood) {
  const before = f.available;
  f.available = !before;
  try {
    putFood(await api<AdminFood>(`${base()}/foods/${f.id}/availability`, { method: 'PUT', body: { available: !before } }));
    showToast(`«${f.name}» ${!before ? 'موجود شد' : 'تموم شد'}`);
  } catch {
    f.available = before;
    failedToast(`«${f.name}» ذخیره نشد. دوباره امتحان کنید.`);
  }
}

// ---------- first run ----------
const hoursSet = computed(() => !!panel.stall && (panel.stall.intro !== '' || JSON.stringify(panel.stall.weeklyHours) !== JSON.stringify(DEFAULT_WEEKLY_HOURS)));
const steps = computed(() => [
  { done: true, title: 'حساب پنل ساخته شد', hint: 'سوپر ادمین غرفه را تعریف کرده است.', to: null },
  { done: hoursSet.value, title: 'ساعت کاری را تنظیم کنید', hint: 'تا مشتری بداند غرفه کی باز است.', to: '/admin/stall/profile' },
  { done: panel.stallCategories.length > 0, title: 'دسته‌های منوی غرفه را بسازید', hint: 'مثل «پیتزا آمریکایی» یا «پیش‌غذا».', to: '/admin/stall/categories' },
  { done: false, title: 'اولین غذا را اضافه کنید', hint: 'با اولین غذا غرفه در منو دیده می‌شود.', to: '/admin/stall/foods/new' },
]);
</script>

<template>
  <main v-if="!panel.foods.length" class="pad mt-6 panel-page">
    <h1 class="ad-h1">خوش آمدید</h1>
    <p class="ad-sub">منوی {{ panel.stall?.name }} هنوز خالی است و در منوی مشتری دیده نمی‌شود.</p>
    <ol class="ad-steps mt-6">
      <li v-for="(s, i) in steps" :key="s.title" class="ad-step" :class="{ 'ad-step--done': s.done }">
        <span class="ad-step__n">
          <ElIcon v-if="s.done" name="check" /><template v-else>{{ fa(i + 1) }}</template>
        </span>
        <span class="ad-step__body"><b>{{ s.title }}</b><span>{{ s.hint }}</span></span>
        <span v-if="s.done" class="visually-hidden">انجام شد</span>
        <RouterLink v-else-if="s.to" class="ad-icon-btn" :to="s.to" :aria-label="s.title"><ElIcon name="chevron-forward" /></RouterLink>
      </li>
    </ol>
  </main>

  <main v-else class="pad mt-6 panel-page">
    <h1 class="ad-h1">غذاها</h1>
    <p class="ad-sub">{{ fa(counts.total) }} غذا · {{ fa(counts.sold) }} تموم شد · {{ fa(counts.deals) }} تخفیف فعال</p>
    <div class="ad-search mt-4">
      <ElIcon name="search" /><input v-model="q" type="search" aria-label="جست‌وجوی غذا" placeholder="جست‌وجوی غذا" />
    </div>
    <div class="el-chips mt-3" role="group" aria-label="دسته‌های غرفه">
      <button type="button" class="el-chip-opt" :aria-pressed="category === null" @click="category = null">همه</button>
      <button v-for="sc in panel.stallCategories" :key="sc.id" type="button" class="el-chip-opt" :aria-pressed="category === sc.id" @click="category = sc.id">
        {{ sc.name }}
      </button>
    </div>

    <section v-for="g in groups" :key="g.id" :aria-label="g.name">
      <div class="ad-group-h"><h2>{{ g.name }}</h2><span>{{ fa(g.foods.length) }} غذا</span></div>
      <div v-for="f in g.foods" :key="f.id" class="ad-food" :class="{ 'ad-food--sold': !f.available }">
        <RouterLink class="ad-food__link" :to="`/admin/stall/foods/${f.id}`">
          <FoodImage :food="f" />
          <span class="ad-food__body">
            <span class="ad-food__name">{{ f.name }}</span>
            <span class="ad-food__meta">
              <span class="ad-food__price">
                {{ fa(f.finalPrice) }} <s v-if="f.discountActive">{{ fa(f.price) }}</s>
                <span style="font-weight: 500; font-size: 11px; color: var(--ink-muted)">تومان</span>
              </span>
              <span v-if="popular.has(f.id) && f.available" class="ad-mini-tag" style="background: var(--inverse); color: var(--on-inverse)">پرطرفدار</span>
              <span v-if="dealTag(f)" class="ad-mini-tag">{{ dealTag(f) }}</span>
              <span v-if="!f.available" class="ad-mini-tag ad-mini-tag--sold">تموم شد</span>
              <span v-if="!f.image" class="ad-mini-tag ad-mini-tag--sold">بدون عکس</span>
            </span>
          </span>
        </RouterLink>
        <span class="ad-toggle">
          <PanelSwitch :checked="f.available" :label="`${f.name} موجود است`" @toggle="toggle(f)" />
          <span aria-hidden="true">{{ f.available ? 'موجود' : 'تموم شد' }}</span>
        </span>
      </div>
    </section>
    <p v-if="!groups.length" class="ad-sub mt-6">غذایی با این جست‌وجو پیدا نشد.</p>
  </main>

  <RouterLink class="ad-fab" to="/admin/stall/foods/new"><ElIcon name="plus" />افزودن غذا</RouterLink>
</template>
