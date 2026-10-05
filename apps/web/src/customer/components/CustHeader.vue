<script setup lang="ts">
// Header (Elay-Header package): sticky glass bar, 1px line, soft shadow once the page scrolls; logo right
// (links to the main page), title centre, back or order-list button left.
// The offline Banner sits directly under it whenever a cached menu is on screen without a fresh copy.
import { onBeforeUnmount, onMounted, ref } from 'vue';
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

const scrolled = ref(false);
const onScroll = () => (scrolled.value = window.scrollY > 0);
onMounted(() => {
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <header class="el-header" :class="{ 'el-header--scrolled': scrolled }">
    <RouterLink to="/" class="el-header__home" :aria-label="`صفحه‌ی اول منوی ${menuState.menu?.foodcourt.name ?? 'ال‌آی'}`">
      <img class="el-header__logo" :src="menuState.menu?.foodcourt.logoUrl ?? logoUrl" alt="" />
    </RouterLink>
    <span class="el-header__title">{{ title }}</span>
    <RouterLink v-if="action === 'order'" class="el-header__action" to="/order" :aria-label="`لیست سفارش، ${fa(itemCount)} مورد`">
      <ElIcon name="list" />
      <span v-if="itemCount > 0" class="el-header__count" aria-hidden="true">{{ fa(itemCount) }}</span>
    </RouterLink>
    <button v-else-if="action === 'back'" type="button" class="el-header__action" aria-label="بازگشت" @click="back">
      <ElIcon name="back" />
    </button>
    <span v-else />
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
