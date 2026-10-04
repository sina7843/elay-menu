<script setup lang="ts">
// صفحه‌ی اول (handoff Main): header, search + filter, categories, stalls, today's deals, popular, order bar.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ElIcon from '../../components/ElIcon.vue';
import CategoryTile from '../components/CategoryTile.vue';
import CustHeader from '../components/CustHeader.vue';
import FilterSheet from '../components/FilterSheet.vue';
import FoodCard from '../components/FoodCard.vue';
import SearchField from '../components/SearchField.vue';
import StallTile from '../components/StallTile.vue';
import { fa } from '../format';
import { foodsById, menuState } from '../menu';
import { NO_FILTERS, queryFor, type Filters } from '../search';

const router = useRouter();
const text = ref('');
const sheet = ref(false);

const menu = computed(() => menuState.menu!);
const categories = computed(() => menu.value.categories.filter((c) => c.foodCount > 0));
const pick = (ids: string[]) => ids.map((id) => foodsById.value.get(id)).filter((f) => f !== undefined);
const deals = computed(() => pick(menu.value.dealIds));
const popular = computed(() => pick(menu.value.popularIds));

const search = () => text.value.trim() && router.push({ path: '/search', query: queryFor(text.value, NO_FILTERS) });
const apply = (f: Filters) => {
  sheet.value = false;
  void router.push({ path: '/search', query: queryFor(text.value, f) });
};
</script>

<template>
  <CustHeader />
  <main>
    <div class="pad mt-4"><SearchField v-model="text" filter @submit="search" @filter="sheet = true" /></div>

    <section v-if="categories.length" class="pad mt-6" aria-labelledby="h-cats">
      <div class="el-sh"><h2 id="h-cats">دسته‌ها</h2></div>
      <div class="el-cat-grid mt-3"><CategoryTile v-for="c in categories" :key="c.id" :category="c" /></div>
    </section>

    <section class="pad mt-6" aria-labelledby="h-stalls">
      <div class="el-sh"><h2 id="h-stalls">غرفه‌ها</h2><span class="el-sh__meta">{{ fa(menu.stalls.length) }} غرفه</span></div>
      <div class="el-stall-grid mt-3"><StallTile v-for="s in menu.stalls" :key="s.id" :stall="s" /></div>
    </section>

    <div v-if="deals.length || popular.length" class="mt-7">
      <section v-if="deals.length" class="el-promo el-promo--deal" aria-labelledby="h-deals">
        <svg class="el-promo__edge" viewBox="0 0 390 10" preserveAspectRatio="none" style="background: var(--paper)" aria-hidden="true">
          <rect width="390" height="10" fill="url(#ec)" />
        </svg>
        <div class="el-promo__head">
          <h2 id="h-deals"><ElIcon name="tag" />تخفیف امروز</h2>
          <RouterLink to="/deals" aria-label="همه‌ی تخفیف‌ها">همه</RouterLink>
        </div>
        <p class="el-promo__sub">فقط تا پایان امشب</p>
        <div class="el-rail"><FoodCard v-for="f in deals" :key="f.id" :food="f" stamp /></div>
      </section>
      <section v-if="popular.length" class="el-promo el-promo--popular" aria-labelledby="h-popular">
        <svg
          class="el-promo__edge"
          viewBox="0 0 390 10"
          preserveAspectRatio="none"
          :style="{ background: deals.length ? 'var(--section-deal)' : 'var(--paper)' }"
          aria-hidden="true"
        >
          <rect width="390" height="10" fill="url(#es)" />
        </svg>
        <div class="el-promo__head">
          <h2 id="h-popular"><ElIcon name="flame" />پرطرفدارهای قبیله</h2>
          <RouterLink to="/popular" aria-label="همه‌ی پرطرفدارها">همه</RouterLink>
        </div>
        <p class="el-promo__sub">بیشترین سفارش این هفته</p>
        <div class="el-rail"><FoodCard v-for="(f, i) in popular" :key="f.id" :food="f" :rank="i + 1" /></div>
      </section>
    </div>
  </main>
  <FilterSheet v-if="sheet" :initial="NO_FILTERS" :text="text" @apply="apply" @close="sheet = false" />
</template>
