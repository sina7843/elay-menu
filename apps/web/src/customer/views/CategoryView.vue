<script setup lang="ts">
// صفحه‌ی دسته (handoff Editorial-Category): category header, stall filter chips, food rows with stall chips.
import { computed, ref, watch } from 'vue';
import ElIcon from '../../components/ElIcon.vue';
import CustHeader from '../components/CustHeader.vue';
import FoodRow from '../components/FoodRow.vue';
import NotFound from '../components/NotFound.vue';
import { fa, itemsFromStalls } from '../format';
import { menuState } from '../menu';

const props = defineProps<{ id: string }>();
const stallFilter = ref<string | null>(null);
watch(() => props.id, () => (stallFilter.value = null));

const category = computed(() => menuState.menu!.categories.find((c) => c.id === props.id));
const foods = computed(() => menuState.menu!.foods.filter((f) => f.categoryId === props.id));
const stalls = computed(() => {
  const ids = new Set(foods.value.map((f) => f.stallId));
  return menuState.menu!.stalls.filter((s) => ids.has(s.id));
});
const shown = computed(() => (stallFilter.value ? foods.value.filter((f) => f.stallId === stallFilter.value) : foods.value));
</script>

<template>
  <template v-if="category">
    <CustHeader :title="category.name" action="back" />
    <main>
      <section class="el-cat-head pad mt-5">
        <span class="el-cat-head__icon"><ElIcon :name="`cat:${category.icon}`" /></span>
        <div>
          <h1>{{ category.name }}</h1>
          <span>{{ itemsFromStalls(foods.length, stalls.length) }}</span>
        </div>
      </section>
      <div v-if="stalls.length" class="el-chips pad mt-4" role="group" aria-label="فیلتر غرفه">
        <button type="button" class="el-filter-chip" :aria-pressed="stallFilter === null" @click="stallFilter = null">همه‌ی غرفه‌ها</button>
        <button v-for="s in stalls" :key="s.id" type="button" class="el-filter-chip" :aria-pressed="stallFilter === s.id" @click="stallFilter = s.id">
          <span class="el-stall-chip__logo" style="width: 28px; height: 28px"><img v-if="s.logoUrl" :src="s.logoUrl" alt="" /></span>{{ s.name }}
        </button>
      </div>
      <div class="pad mt-3">
        <div class="el-rule el-rule--double"></div>
        <FoodRow v-for="f in shown" :key="f.id" :food="f" show-stall />
        <p v-if="!shown.length" class="muted" style="padding: 24px 0">فعلاً غذایی در این دسته نیست.</p>
      </div>
      <span class="visually-hidden" aria-live="polite">{{ fa(shown.length) }} غذا</span>
    </main>
  </template>
  <NotFound v-else />
</template>
