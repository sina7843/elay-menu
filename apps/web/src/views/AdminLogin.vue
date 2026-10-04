<script setup lang="ts">
// Shared login for stall and super admins (handoff: screens/html/Admin-Login.html, LoginForm).
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import ElIcon from '../components/ElIcon.vue';
import { ApiRequestError, adminHome, login } from '../api';
import logoUrl from '../assets/logos/elay-logo.svg';

const router = useRouter();
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const busy = ref(false);
const error = ref('');

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const account = await login(username.value, password.value);
    await router.replace(adminHome(account));
  } catch (e) {
    error.value =
      e instanceof ApiRequestError && e.status === 401
        ? 'نام کاربری یا رمز درست نیست.'
        : e instanceof ApiRequestError && e.body
          ? e.body.error.message
          : 'ارتباط با سرور برقرار نشد. دوباره امتحان کنید.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="ad-login" novalidate @submit.prevent="submit">
    <img class="ad-login__logo" :src="logoUrl" alt="ال‌آی" />
    <h1>ورود به پنل مدیریت</h1>
    <p>مدیر غرفه با نام کاربری و رمزی که مدیر فودکورت داده وارد می‌شود. بعد از ورود، هر کس پنل خودش را می‌بیند.</p>
    <div class="ad-field">
      <label for="login-username">نام کاربری</label>
      <div class="ad-input">
        <ElIcon name="user" />
        <input
          id="login-username"
          v-model="username"
          dir="ltr"
          style="text-align: right"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          required
        />
      </div>
    </div>
    <div class="ad-field">
      <label for="login-password">رمز عبور</label>
      <div class="ad-input" :class="{ 'ad-input--error': error }">
        <ElIcon name="key" />
        <input
          id="login-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          :aria-invalid="!!error"
          aria-describedby="login-error"
          required
        />
        <button
          type="button"
          class="ad-icon-btn"
          style="border: 0"
          :aria-label="showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'"
          :aria-pressed="showPassword"
          @click="showPassword = !showPassword"
        >
          <ElIcon name="eye" />
        </button>
      </div>
      <span id="login-error" class="ad-error" role="alert">{{ error }}</span>
    </div>
    <button
      type="submit"
      class="ad-btn ad-btn--primary ad-btn--block mt-2"
      :class="{ 'ad-btn--loading': busy }"
      style="flex: none"
      :disabled="busy || !username || !password"
      :aria-busy="busy"
    >
      <span v-if="busy" class="el-spinner" aria-hidden="true" />
      {{ busy ? 'در حال ورود…' : 'ورود' }}
    </button>
    <p class="ad-login__foot">رمز را فراموش کرده‌اید؟ از مدیر فودکورت بخواهید رمز تازه بسازد.</p>
  </form>
</template>
