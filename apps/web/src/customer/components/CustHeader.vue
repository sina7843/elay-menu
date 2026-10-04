<script setup lang="ts">
// Header (handoff Header): logo right, title centre, back or order-list button left, accent zigzag edge.
// The offline Banner sits directly under it whenever a cached menu is on screen without a fresh copy.
import { useRouter } from 'vue-router';
import ElIcon from '../../components/ElIcon.vue';
import logoUrl from '../../assets/logos/elay-logo.svg';
import { itemCount } from '../cart';
import { fa } from '../format';
import { menuState, retryMenu } from '../menu';

withDefaults(defineProps<{ title?: string; action?: 'order' | 'back' | 'none' }>(), { title: '', action: 'order' });
const router = useRouter();

function back() {
  if (window.history.state?.back) router.back();
  else void router.push('/');
}
</script>

<template>
  <header class="el-header">
    <img class="el-header__logo" :src="logoUrl" alt="ال‌آی" />
    <span class="el-header__title">{{ title }}</span>
    <RouterLink v-if="action === 'order'" class="el-header__action" to="/order" :aria-label="`لیست سفارش، ${fa(itemCount)} مورد`">
      <ElIcon name="list" />
      <span v-if="itemCount > 0" class="el-header__count" aria-hidden="true">{{ fa(itemCount) }}</span>
    </RouterLink>
    <button v-else-if="action === 'back'" type="button" class="el-header__action" aria-label="بازگشت" @click="back">
      <ElIcon name="back" />
    </button>
    <span v-else />
    <svg class="el-header__zigzag" viewBox="0 0 390 10" preserveAspectRatio="none" aria-hidden="true">
      <rect width="390" height="10" fill="url(#zz)" />
    </svg>
  </header>
  <div v-if="menuState.offline && menuState.menu" class="el-banner" role="status">
    <svg class="el-i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5 5 0 017 0M5 13a10 10 0 015.2-2.8M14.5 10.4A10 10 0 0119 13M2 9.5a15 15 0 014.4-2.8M11 6a15 15 0 0111 3.5" />
      <path d="M12 20h.01" />
    </svg>
    <span>اینترنت قطع است. منوی آخرین بار را می‌بینید.</span>
    <button type="button" @click="retryMenu">دوباره</button>
  </div>
</template>
