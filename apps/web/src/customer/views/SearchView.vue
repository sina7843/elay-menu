<script setup lang="ts">
// نتیجه‌ی جست‌وجو / چیزی پیدا نشد (Cust-Search, Cust-NoResult). The URL holds the query and filters,
// results come from the server (cached-menu fallback offline) and never from an older request.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { PublicSearchResponse } from '@elay/shared';
import CategoryTile from '../components/CategoryTile.vue';
import CustHeader from '../components/CustHeader.vue';
import FilterSheet from '../components/FilterSheet.vue';
import FoodRow from '../components/FoodRow.vue';
import SearchField from '../components/SearchField.vue';
import StallTile from '../components/StallTile.vue';
import { fa } from '../format';
import { menuState } from '../menu';
import { activeFilterCount, createSearcher, filtersFromQuery, queryFor, type Filters } from '../search';

const route = useRoute();
const router = useRouter();
const one = (v: unknown) => (typeof v === 'string' ? v : '');

const text = ref(one(route.query.q));
const filters = computed(() => filtersFromQuery(route.query));
const query = computed(() => one(route.query.q));
const result = ref<PublicSearchResponse | null>(null);
const busy = ref(false);
const sheet = ref(false);
const field = ref<{ focus: () => void } | null>(null);
const run = createSearcher();

// Typing updates the URL (debounced); the URL drives the search.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(text, (t) => {
  clearTimeout(timer);
  timer = setTimeout(() => void router.replace({ query: queryFor(t, filters.value) }), 250);
});
onBeforeUnmount(() => clearTimeout(timer));

watch(
  () => [query.value, route.query.open, route.query.deal, route.query.price, route.query.sort, menuState.menu?.generatedAt],
  async () => {
    if (!query.value && !activeFilterCount(filters.value)) {
      result.value = null;
      return;
    }
    busy.value = true;
    const res = await run(query.value, filters.value);
    if (res) {
      result.value = res;
      busy.value = false;
    }
  },
  { immediate: true },
);
onMounted(() => {
  if (!text.value) field.value?.focus();
});

const stallsInFoods = computed(() => new Set(result.value?.foods.map((f) => f.stallId)).size);
const total = computed(() => (result.value ? result.value.stalls.length + result.value.foods.length : 0));
const categories = computed(() => menuState.menu!.categories.filter((c) => c.foodCount > 0));

function apply(f: Filters) {
  sheet.value = false;
  void router.replace({ query: queryFor(text.value, f) });
}
</script>

<template>
  <CustHeader title="جست‌وجو" action="back" />
  <main>
    <div class="pad mt-4">
      <SearchField
        ref="field"
        v-model="text"
        clear
        filter
        :filter-count="activeFilterCount(filters)"
        @submit="router.replace({ query: queryFor(text, filters) })"
        @filter="sheet = true"
      />
      <p v-if="result && total" class="muted" style="font-size: 13px; margin: 10px 0 0" aria-live="polite">
        {{ query ? `${fa(total)} نتیجه برای «${query}»` : `${fa(total)} نتیجه` }}
      </p>
    </div>

    <template v-if="result && total">
      <section v-if="result.stalls.length" class="pad mt-6">
        <div class="el-sh">
          <h2 style="font-size: 18px; line-height: 26px">غرفه‌ها</h2>
          <span class="el-sh__meta">{{ fa(result.stalls.length) }} غرفه</span>
        </div>
        <div class="el-stall-grid mt-3"><StallTile v-for="s in result.stalls" :key="s.id" :stall="s" /></div>
      </section>
      <section v-if="result.foods.length" class="pad mt-6">
        <div class="el-sh">
          <h2 style="font-size: 18px; line-height: 26px">غذاها</h2>
          <span class="el-sh__meta">{{ fa(result.foods.length) }} غذا از {{ fa(stallsInFoods) }} غرفه</span>
        </div>
        <FoodRow v-for="f in result.foods" :key="f.id" :food="f" show-stall />
      </section>
    </template>

    <template v-else-if="result && !busy">
      <div class="el-empty" role="status">
        <svg class="el-empty__art" viewBox="0 0 120 120" aria-hidden="true">
          <path d="M60 14L104 106H16Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
          <path d="M60 14V106" stroke="currentColor" stroke-width="2" />
          <path d="M30 78L36 70L42 78L48 70L54 78L60 70L66 78L72 70L78 78L84 70L90 78" fill="none" stroke="#1B1512" stroke-width="2.5" stroke-linejoin="round" />
          <path d="M52 106L60 90L68 106Z" fill="#1B1512" />
        </svg>
        <h2>{{ query ? `برای «${query}» چیزی پیدا نشد` : 'با این فیلترها چیزی پیدا نشد' }}</h2>
        <p>املای دیگری را امتحان کنید یا از دسته‌ها پیدا کنید.</p>
      </div>
    </template>

    <section v-if="!result || (!total && !busy)" class="pad" :class="{ 'mt-6': !result }">
      <div class="el-sh"><h2 style="font-size: 18px; line-height: 26px">دسته‌ها</h2></div>
      <div class="el-cat-grid mt-3"><CategoryTile v-for="c in categories" :key="c.id" :category="c" /></div>
    </section>
  </main>
  <FilterSheet v-if="sheet" :initial="filters" :text="text" @apply="apply" @close="sheet = false" />
</template>
