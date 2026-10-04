<script setup lang="ts">
// Super-admin frame (SA-*): AdminHeader with the Elay logo, «مدیریت فودکورت · سوپر ادمین», eye → customer menu;
// AdminTabBar with three tabs. Form routes (meta.form) bring their own header and ActionBar.
import { useRoute } from 'vue-router';
import ElIcon from '../../components/ElIcon.vue';
import logoUrl from '../../assets/logos/elay-logo.svg';
import AdminToast from '../components/AdminToast.vue';
import { loadSuper, sa } from './store';

const route = useRoute();
void loadSuper();

const tabs = [
  { to: '/admin/super', icon: 'store', label: 'غرفه‌ها', exact: true },
  { to: '/admin/super/categories', icon: 'grid', label: 'دسته‌ها' },
  { to: '/admin/super/settings', icon: 'filter', label: 'تنظیمات' },
];
const current = (t: (typeof tabs)[number]) => (t.exact ? route.path === t.to || route.path.startsWith('/admin/super/stalls') : route.path.startsWith(t.to));
</script>

<template>
  <header v-if="!route.meta.form" class="ad-top">
    <div class="ad-top__who">
      <img :src="sa.foodcourt?.logoUrl ?? logoUrl" :alt="sa.foodcourt?.name ?? 'ال‌آی'" style="height: 28px" />
      <span class="ad-top__name"><b>مدیریت فودکورت</b><span>سوپر ادمین</span></span>
    </div>
    <RouterLink class="ad-icon-btn" to="/" aria-label="دیدن منو"><ElIcon name="eye" /></RouterLink>
  </header>

  <main v-if="sa.error && !sa.loaded" class="el-empty" style="padding-top: 64px">
    <h2>پنل باز نشد</h2>
    <p>{{ sa.error }}</p>
    <div class="el-empty__actions">
      <button type="button" class="el-btn el-btn--inverse" style="height: 52px" @click="loadSuper">دوباره امتحان کنید</button>
    </div>
  </main>
  <div v-else-if="!sa.loaded" class="pad mt-6" aria-busy="true" aria-label="در حال بارگذاری پنل">
    <span class="el-skel el-skel--title" style="width: 40%"></span>
    <span v-for="i in 4" :key="i" class="el-skel el-skel--line mt-4" style="display: block; width: 90%"></span>
  </div>
  <!-- Keyed so moving between /new and /:id (or two ids) remounts the form with fresh state. -->
  <RouterView v-else :key="route.path" />

  <AdminToast />
  <nav v-if="!route.meta.form" class="ad-tabbar" aria-label="بخش‌های پنل" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
    <RouterLink v-for="t in tabs" :key="t.to" class="ad-tab" :to="t.to" :aria-current="current(t) ? 'page' : undefined">
      <ElIcon :name="t.icon" />{{ t.label }}
    </RouterLink>
  </nav>
</template>
