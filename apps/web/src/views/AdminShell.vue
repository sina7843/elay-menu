<script setup lang="ts">
// Panel layout shell (AdminHeader). Panel screens are built in DRAGON-03 (stall) and DRAGON-04 (super admin).
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ElIcon from '../components/ElIcon.vue';
import { account, logout } from '../api';
import logoUrl from '../assets/logos/elay-logo.svg';

const router = useRouter();
const isSuper = computed(() => account.value?.role === 'super_admin');
const busy = ref(false);

const error = ref('');

async function signOut() {
  busy.value = true;
  error.value = '';
  try {
    await logout();
    await router.replace('/admin/login');
  } catch {
    if (!account.value) await router.replace('/admin/login'); // session was already gone (401)
    else error.value = 'خروج انجام نشد. اینترنت را بررسی کنید و دوباره امتحان کنید.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <header class="ad-top">
    <div class="ad-top__who">
      <img :src="logoUrl" alt="ال‌آی" style="height: 28px" />
      <span class="ad-top__name">
        <b>{{ isSuper ? 'مدیریت فودکورت' : 'پنل غرفه' }}</b>
        <span>{{ isSuper ? 'سوپر ادمین' : 'مدیر غرفه' }} · <bdi dir="ltr">{{ account?.username }}</bdi></span>
      </span>
    </div>
  </header>
  <main class="pad mt-6">
    <h1 class="ad-h1">{{ isSuper ? 'غرفه‌ها' : 'غذاها' }}</h1>
    <p class="ad-sub">این بخش هنوز ساخته نشده است.</p>
    <div class="mt-6">
      <button type="button" class="ad-menu-row ad-menu-row--danger" :disabled="busy" :aria-busy="busy" @click="signOut">
        <ElIcon name="close" />{{ busy ? 'در حال خروج…' : 'خروج' }}
      </button>
      <span class="ad-error" role="alert">{{ error }}</span>
    </div>
  </main>
</template>
