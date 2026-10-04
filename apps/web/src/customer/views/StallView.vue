<script setup lang="ts">
// صفحه‌ی غرفه (handoff Editorial-Stall, Cust-ClosedStall): StallHeader with open/closed badge,
// closed notice, sticky category tabs with scroll-spy, food rows grouped by stall category.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import ElIcon from '../../components/ElIcon.vue';
import CustHeader from '../components/CustHeader.vue';
import FoodRow from '../components/FoodRow.vue';
import NotFound from '../components/NotFound.vue';
import { fa, faCloseTime, faTime } from '../format';
import { menuState } from '../menu';

const props = defineProps<{ id: string }>();
const stall = computed(() => menuState.menu!.stalls.find((s) => s.id === props.id));
const sections = computed(() => {
  const foods = menuState.menu!.foods.filter((f) => f.stallId === props.id);
  return menuState
    .menu!.stallCategories.filter((sc) => sc.stallId === props.id)
    .map((sc) => ({ ...sc, foods: foods.filter((f) => f.stallCategoryId === sc.id) }))
    .filter((sc) => sc.foods.length);
});

const badge = computed(() => {
  const s = stall.value!;
  if (s.isOpen) return s.closesAt ? `باز است · تا ${faCloseTime(s.closesAt)}` : 'باز است';
  return s.opensAt ? `بسته · از ${faTime(s.opensAt)} باز می‌شود` : 'بسته';
});

// ---------- tabs ----------
const active = ref<string | null>(null);
const headings = new Map<string, HTMLElement>();
let observer: IntersectionObserver | null = null;
let clicking = false;

function setHeading(id: string, el: unknown) {
  if (el instanceof HTMLElement) headings.set(id, el);
  else headings.delete(id);
}

function observe() {
  observer?.disconnect();
  // A section becomes active when its heading passes just under the sticky header + tabs.
  observer = new IntersectionObserver(
    (entries) => {
      if (clicking) return;
      for (const e of entries) if (e.isIntersecting) active.value = (e.target as HTMLElement).dataset.id!;
    },
    { rootMargin: '-130px 0px -60% 0px' },
  );
  headings.forEach((el) => observer!.observe(el));
}

watch(
  sections,
  async (list) => {
    active.value = list[0]?.id ?? null;
    await nextTick();
    observe();
  },
  { immediate: true },
);
onBeforeUnmount(() => observer?.disconnect());

function go(id: string) {
  active.value = id;
  clicking = true;
  headings.get(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setTimeout(() => (clicking = false), 600);
}
</script>

<template>
  <template v-if="stall">
    <CustHeader :title="stall.name" action="back" />
    <main>
      <section class="el-stall-head pad mt-7">
        <span class="el-stall-head__logo"><img v-if="stall.logoUrl" :src="stall.logoUrl" :alt="`لوگوی ${stall.name}`" /></span>
        <div>
          <h1>{{ stall.name }}</h1>
          <div v-if="stall.intro" class="el-stall-head__sub">{{ stall.intro }}</div>
          <div class="el-stall-head__badges">
            <span class="el-badge" :class="stall.isOpen ? 'el-badge--open' : 'el-badge--closed'"><i></i>{{ badge }}</span>
          </div>
        </div>
      </section>
      <div v-if="!stall.isOpen" class="pad mt-4">
        <div class="el-closed-note" role="note">
          <ElIcon name="clock" />
          <span>{{
            stall.opensAt
              ? `این غرفه الان بسته است. منو را ببینید؛ افزودن به لیست از ساعت ${faTime(stall.opensAt)} ممکن می‌شود.`
              : 'این غرفه الان بسته است. منو را ببینید؛ فعلاً افزودن به لیست ممکن نیست.'
          }}</span>
        </div>
      </div>
      <hr class="el-rule" style="margin: 24px 16px 0" />
      <nav v-if="sections.length" class="el-tabs mt-2" aria-label="دسته‌های غرفه" role="tablist">
        <button
          v-for="sc in sections"
          :key="sc.id"
          type="button"
          role="tab"
          class="el-tab"
          :aria-selected="active === sc.id"
          @click="go(sc.id)"
        >
          {{ sc.name }}
        </button>
      </nav>
      <div class="pad">
        <section v-for="sc in sections" :key="sc.id">
          <div :ref="(el) => setHeading(sc.id, el)" :data-id="sc.id" class="el-sh el-sh--plain mt-7 stall-section-head">
            <h2>{{ sc.name }}</h2>
            <span class="el-sh__meta">{{ fa(sc.foods.length) }} مورد</span>
          </div>
          <FoodRow v-for="f in sc.foods" :key="f.id" :food="f" />
        </section>
      </div>
    </main>
  </template>
  <NotFound v-else />
</template>

<style scoped>
/* Land section headings below the sticky header (70px) + tabs (~50px). */
.stall-section-head {
  scroll-margin-top: 128px;
}
</style>
