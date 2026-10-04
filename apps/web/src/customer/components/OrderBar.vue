<script setup lang="ts">
// Floating «لیست سفارش من» bar; only when the list has items (never on the order page, loading, error or closure).
import ElIcon from '../../components/ElIcon.vue';
import { cartView, itemCount, stallCount } from '../cart';
import { fa, itemsFromStalls } from '../format';
</script>

<template>
  <RouterLink v-if="itemCount > 0" class="el-order-bar float-bar" to="/order">
    <span class="el-order-bar__start">
      <ElIcon name="list" />
      <span class="el-order-bar__text"><b>لیست سفارش من</b><span>{{ itemsFromStalls(itemCount, stallCount) }}</span></span>
    </span>
    <span class="el-order-bar__total">{{ fa(cartView.total) }} <small>تومان</small><ElIcon name="chevron-forward" /></span>
  </RouterLink>
</template>
