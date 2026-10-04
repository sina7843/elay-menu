<script setup lang="ts">
// Stall panel frame: AdminHeader (stall logo on plate, name, «پنل غرفه», eye → customer page) and
// AdminTabBar. Form routes (meta.form) bring their own header and ActionBar instead.
import { useRoute } from 'vue-router';
import ElIcon from '../../components/ElIcon.vue';
import AdminToast from '../components/AdminToast.vue';
import { customerLink, loadPanel, panel } from './store';

const route = useRoute();
void loadPanel();

const tabs = [
  { to: '/admin/stall', icon: 'food', label: 'غذاها', exact: true },
  { to: '/admin/stall/categories', icon: 'grid', label: 'دسته‌ها' },
  { to: '/admin/stall/profile', icon: 'store', label: 'غرفه' },
  { to: '/admin/stall/account', icon: 'user', label: 'حساب' },
];
const current = (t: (typeof tabs)[number]) => (t.exact ? route.path === t.to : route.path.startsWith(t.to));
</script>

<template>
  <template v-if="!route.meta.form">
    <header class="ad-top">
      <div class="ad-top__who">
        <span class="ad-top__logo"><img v-if="panel.stall?.logoUrl" :src="panel.stall.logoUrl" alt="" /></span>
        <span class="ad-top__name"><b>{{ panel.stall?.name ?? '…' }}</b><span>پنل غرفه</span></span>
      </div>
      <RouterLink class="ad-icon-btn" :to="customerLink" aria-label="دیدن منوی غرفه"><ElIcon name="eye" /></RouterLink>
    </header>
  </template>

  <main v-if="panel.error && !panel.loaded" class="el-empty" style="padding-top: 64px">
    <h2>پنل باز نشد</h2>
    <p>{{ panel.error }}</p>
    <div class="el-empty__actions">
      <button type="button" class="el-btn el-btn--inverse" style="height: 52px" @click="loadPanel">دوباره امتحان کنید</button>
    </div>
  </main>
  <div v-else-if="!panel.loaded" class="pad mt-6" aria-busy="true" aria-label="در حال بارگذاری پنل">
    <span class="el-skel el-skel--title" style="width: 40%"></span>
    <span v-for="i in 4" :key="i" class="el-skel el-skel--line mt-4" style="display: block; width: 90%"></span>
  </div>
  <!-- Keyed so moving between /new and /:id (or two ids) remounts the form with fresh state. -->
  <RouterView v-else :key="route.path" />

  <AdminToast />
  <nav v-if="!route.meta.form" class="ad-tabbar" aria-label="بخش‌های پنل" style="grid-template-columns: repeat(4, minmax(0, 1fr))">
    <RouterLink v-for="t in tabs" :key="t.to" class="ad-tab" :to="t.to" :aria-current="current(t) ? 'page' : undefined">
      <ElIcon :name="t.icon" />{{ t.label }}
    </RouterLink>
  </nav>
</template>
