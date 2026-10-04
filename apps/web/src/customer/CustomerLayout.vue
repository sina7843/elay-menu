<script setup lang="ts">
// Wraps every customer route. Global states win over the page: menu closed by the super admin,
// first load (skeleton), first-load failure (retry). The order bar shows only on a usable menu.
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CustHeader from './components/CustHeader.vue';
import MenuSkeleton from './components/MenuSkeleton.vue';
import OrderBar from './components/OrderBar.vue';
import SearchField from './components/SearchField.vue';
import { isClosed, menuState, retryMenu, startMenu } from './menu';

startMenu();
const route = useRoute();
const router = useRouter();
const text = ref('');
const go = () => text.value.trim() && router.push({ path: '/search', query: { q: text.value.trim() } });
</script>

<template>
  <template v-if="isClosed">
    <CustHeader action="none" />
    <main class="el-empty" style="padding-top: 96px">
      <svg class="el-empty__art" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M60 14L104 106H16Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
        <path d="M30 78L36 70L42 78L48 70L54 78L60 70L66 78L72 70L78 78L84 70L90 78" fill="none" stroke="#1B1512" stroke-width="2.5" stroke-linejoin="round" />
        <circle cx="60" cy="48" r="9" fill="none" stroke="#1B1512" stroke-width="3" />
      </svg>
      <h2>منو الان در دسترس نیست</h2>
      <p>{{ menuState.menu?.foodcourt.closedMessage || 'کمی بعد همین QR روی میز را دوباره اسکن کنید.' }}</p>
    </main>
  </template>

  <template v-else-if="menuState.status !== 'ready'">
    <CustHeader />
    <div class="pad mt-4"><SearchField v-model="text" filter @submit="go" @filter="go" /></div>
    <MenuSkeleton v-if="menuState.status === 'loading'" />
    <main v-else class="el-empty" style="padding-top: 56px">
      <svg class="el-empty__art" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M20 52a58 58 0 0180 0M34 68a38 38 0 0152 0M48 84a18 18 0 0124 0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <circle cx="60" cy="98" r="5" fill="#1B1512" />
        <path d="M24 24l72 72" stroke="#1B1512" stroke-width="4" stroke-linecap="round" />
      </svg>
      <h2>منو باز نشد</h2>
      <p>اتصال اینترنت را بررسی کنید و دوباره امتحان کنید. لیست سفارش شما روی گوشی ذخیره است و پاک نمی‌شود.</p>
      <div class="el-empty__actions">
        <button type="button" class="el-btn el-btn--inverse" style="height: 52px" @click="retryMenu">
          <svg class="el-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
          دوباره امتحان کنید
        </button>
      </div>
    </main>
  </template>

  <template v-else>
    <RouterView />
    <div v-if="!route.meta.noOrderBar" class="order-bar-space" aria-hidden="true"></div>
    <OrderBar v-if="!route.meta.noOrderBar" />
  </template>
</template>
