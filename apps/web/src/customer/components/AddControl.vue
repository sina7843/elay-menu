<script setup lang="ts">
// QuantityControl for menu rows/cards: + → dark stepper; sold out → «تموم شد»; closed stall → «سفارش از ساعت».
import { computed, nextTick, ref } from 'vue';
import type { PublicFood } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import { decrement, increment, qtyOf } from '../cart';
import { fa, faTime } from '../format';
import { stallOf } from '../menu';

const props = defineProps<{ food: PublicFood }>();
const qty = computed(() => qtyOf(props.food.id));
const stall = computed(() => stallOf(props.food));
const plusBtn = ref<HTMLButtonElement | null>(null);
const addBtn = ref<HTMLButtonElement | null>(null);

// Keep keyboard focus on the control that replaces the pressed one.
async function add() {
  if (increment(props.food)) {
    await nextTick();
    plusBtn.value?.focus();
  }
}
async function less() {
  decrement(props.food.id);
  if (qty.value === 0) {
    await nextTick();
    addBtn.value?.focus();
  }
}
</script>

<template>
  <span v-if="!food.available" class="el-sold">تموم شد</span>
  <span v-else-if="!stall?.isOpen" class="el-status el-status--closed">{{
    stall?.opensAt ? `سفارش از ${faTime(stall.opensAt)}` : 'بسته'
  }}</span>
  <button v-else-if="qty === 0" ref="addBtn" type="button" class="el-add" aria-label="افزودن به لیست" @click="add">
    <ElIcon name="plus" />
  </button>
  <span v-else class="el-stepper" role="group" :aria-label="`تعداد ${food.name} در لیست`">
    <button ref="plusBtn" type="button" aria-label="یکی بیشتر" @click="add"><ElIcon name="plus" /></button>
    <b aria-live="polite">{{ fa(qty) }}</b>
    <button type="button" aria-label="یکی کمتر" @click="less"><ElIcon name="minus" /></button>
  </span>
</template>
