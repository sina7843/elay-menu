<script setup lang="ts">
// SA-Stalls: search, StallCard per stall (logo on plate, food count, manager, visibility), add stall.
import { computed, ref } from 'vue';
import { matchesTokens, searchTokens } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import { fa } from '../format';
import { sa } from './store';

const q = ref('');
const shown = computed(() => {
  const tokens = searchTokens(q.value);
  return sa.stalls.filter((s) => matchesTokens(tokens, s.name, s.adminUsername ?? ''));
});
const visible = computed(() => sa.stalls.filter((s) => s.visible).length);
</script>

<template>
  <main class="pad mt-6 panel-page">
    <h1 class="ad-h1">غرفه‌ها</h1>
    <p class="ad-sub">{{ fa(sa.stalls.length) }} غرفه · {{ fa(visible) }} در منو</p>
    <div class="ad-search mt-4"><ElIcon name="search" /><input v-model="q" type="search" aria-label="جست‌وجوی غرفه" placeholder="جست‌وجوی غرفه" /></div>
    <div class="mt-4">
      <RouterLink v-for="s in shown" :key="s.id" class="ad-stall-card" :class="{ 'ad-stall-card--off': !s.visible }" :to="`/admin/super/stalls/${s.id}`">
        <span class="ad-stall-card__plate"><img v-if="s.logoUrl" :src="s.logoUrl" alt="" /></span>
        <span class="ad-stall-card__body">
          <b>{{ s.name }}</b>
          <span>{{ fa(s.foodCount) }} غذا · مدیر: <bdi dir="ltr">{{ s.adminUsername ?? '—' }}</bdi></span>
          <span class="el-status" :class="s.visible ? 'el-status--open' : 'el-status--closed'"><i></i>{{ s.visible ? (s.foodCount ? 'در منو' : 'بدون غذا، هنوز در منو نیست') : 'پنهان از منو' }}</span>
        </span>
        <ElIcon name="chevron-forward" />
      </RouterLink>
      <p v-if="!shown.length" class="ad-sub">{{ sa.stalls.length ? 'غرفه‌ای با این نام پیدا نشد.' : 'هنوز غرفه‌ای تعریف نشده است.' }}</p>
    </div>
  </main>
  <RouterLink class="ad-fab" to="/admin/super/stalls/new"><ElIcon name="plus" />افزودن غرفه</RouterLink>
</template>
