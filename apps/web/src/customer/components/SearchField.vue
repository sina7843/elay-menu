<script setup lang="ts">
// SearchField: on the main page with the «فیلتر» button; on the results page with a clear button.
import { ref } from 'vue';
import ElIcon from '../../components/ElIcon.vue';
import { fa } from '../format';

const model = defineModel<string>({ required: true });
defineProps<{ filter?: boolean; filterCount?: number; clear?: boolean; autofocus?: boolean }>();
const emit = defineEmits<{ submit: []; filter: [] }>();
const input = ref<HTMLInputElement | null>(null);

function clearText() {
  model.value = '';
  input.value?.focus();
}
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <form class="el-search" role="search" @submit.prevent="emit('submit')">
    <ElIcon name="search" />
    <input
      ref="input"
      v-model="model"
      type="search"
      enterkeyhint="search"
      aria-label="جست‌وجو"
      placeholder="چی میل دارید؟ غذا، نوشیدنی یا غرفه"
      autocomplete="off"
      :autofocus="autofocus"
    />
    <button v-if="clear && model" type="button" class="el-search__clear" aria-label="پاک کردن جست‌وجو" @click="clearText">
      <ElIcon name="close" />
    </button>
    <button v-if="filter" type="button" class="el-btn el-btn--inverse" aria-haspopup="dialog" @click="emit('filter')">
      <ElIcon name="filter" />فیلتر<template v-if="filterCount"> · {{ fa(filterCount) }}</template>
    </button>
  </form>
</template>

<style scoped>
/* Native search-cancel would duplicate the handoff clear button. */
input::-webkit-search-cancel-button {
  display: none;
}
</style>
