<script setup lang="ts">
// FilterSheet: two switches, price band, sort. The main button shows the live result count from the API.
import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import ElIcon from '../../components/ElIcon.vue';
import { fa } from '../format';
import { NO_FILTERS, PRICE_BANDS, SORTS, createSearcher, type Filters } from '../search';
import ModalLayer from './ModalLayer.vue';

const props = defineProps<{ initial: Filters; text: string }>();
const emit = defineEmits<{ apply: [Filters]; close: [] }>();

const f = reactive<Filters>({ ...props.initial });
const count = ref<number | null>(null);
const search = createSearcher();
let timer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => ({ ...f }),
  (now) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const res = await search(props.text, now);
      if (res) count.value = res.foods.length;
    }, 150);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));

const toggle = (key: 'onlyOpen' | 'onlyDiscounted') => (f[key] = !f[key]);
const reset = () => Object.assign(f, NO_FILTERS);
</script>

<template>
  <ModalLayer @close="emit('close')">
    <section class="el-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-title">
      <div class="el-sheet__handle"></div>
      <div class="el-sheet__head">
        <h2 id="filter-title">فیلتر</h2>
        <button type="button" class="el-header__action" aria-label="بستن" style="justify-self: auto" @click="emit('close')">
          <ElIcon name="close" />
        </button>
      </div>

      <div class="el-sheet__group">
        <div class="sw" @click="toggle('onlyOpen')">
          <span id="sw-open">فقط غرفه‌های باز<span class="sw__sub">غرفه‌های بسته پنهان می‌شوند</span></span>
          <span
            class="sw__track"
            role="switch"
            :aria-checked="f.onlyOpen"
            aria-labelledby="sw-open"
            tabindex="0"
            @keydown.space.prevent.stop="toggle('onlyOpen')"
            @keydown.enter.prevent.stop="toggle('onlyOpen')"
          ></span>
        </div>
        <div class="sw" @click="toggle('onlyDiscounted')">
          <span id="sw-deal">فقط تخفیف‌دار</span>
          <span
            class="sw__track"
            role="switch"
            :aria-checked="f.onlyDiscounted"
            aria-labelledby="sw-deal"
            tabindex="0"
            @keydown.space.prevent.stop="toggle('onlyDiscounted')"
            @keydown.enter.prevent.stop="toggle('onlyDiscounted')"
          ></span>
        </div>
      </div>

      <div class="el-sheet__group" role="group" aria-labelledby="price-h">
        <h3 id="price-h">قیمت</h3>
        <div class="wrap-chips">
          <button v-for="[key, label] in PRICE_BANDS" :key="key" type="button" class="el-chip-opt" :aria-pressed="f.price === key" @click="f.price = key">
            {{ label }}
          </button>
        </div>
      </div>

      <div class="el-sheet__group" style="border-bottom: 0" role="group" aria-labelledby="sort-h">
        <h3 id="sort-h">مرتب‌سازی</h3>
        <div class="wrap-chips">
          <button v-for="[key, label] in SORTS" :key="key" type="button" class="el-chip-opt" :aria-pressed="f.sort === key" @click="f.sort = key">
            {{ label }}
          </button>
        </div>
      </div>

      <div class="el-sheet__actions">
        <button type="button" class="el-btn el-btn--accent" style="flex: 1; width: auto" @click="emit('apply', { ...f })">
          {{ count === null ? 'نمایش غذاها' : `نمایش ${fa(count)} غذا` }}
        </button>
        <button type="button" class="el-btn el-btn--outline" style="height: 56px" @click="reset">پاک کردن</button>
      </div>
    </section>
  </ModalLayer>
</template>
