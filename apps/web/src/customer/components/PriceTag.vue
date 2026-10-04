<script setup lang="ts">
// PriceTag: price and discount come from the server (shared discountedPrice); never recomputed here.
import { fa } from '../format';

defineProps<{ price: number; final: number; deal?: boolean; sm?: boolean }>();
</script>

<template>
  <span class="el-price" :class="{ 'el-price--sm': sm, 'el-price--deal': deal && final !== price }">
    <span v-if="deal && final !== price" class="el-price__old"><span class="visually-hidden">قیمت قبلی </span>{{ fa(price) }}</span>{{ fa(final)
    }}<small>تومان</small>
  </span>
</template>
