<script setup lang="ts">
// Admin-Account. No forgotten-password service: the stall admin asks the super admin for «رمز تازه».
import AccountPanel from '../components/AccountPanel.vue';
import { panel } from './store';
</script>

<template>
  <main class="pad mt-6 panel-page">
    <h1 class="ad-h1">حساب</h1>
    <p class="ad-sub">ورود و امنیت پنل غرفه</p>
    <AccountPanel :logo-url="panel.stall?.logoUrl" :subtitle="`نام کاربری · مدیر ${panel.stall?.name ?? ''}`" forgot-hint="به مدیر فودکورت بگویید" />
  </main>
</template>
