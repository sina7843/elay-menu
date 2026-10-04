<script setup lang="ts">
// Customer layout shell: sticky Header with the accent zigzag edge (handoff: screens/html/Main.html).
// Menu content, search, order list and states are built in DRAGON-02.
import logoUrl from '../assets/logos/elay-logo.svg';
</script>

<template>
  <header class="el-header">
    <img class="el-header__logo" :src="logoUrl" alt="ال‌آی" />
    <span class="el-header__title" />
    <span />
    <svg class="el-header__zigzag" viewBox="0 0 390 10" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="zz" width="16" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 8L4 2L8 8L12 2L16 8" fill="none" style="stroke: var(--accent)" stroke-width="2" />
        </pattern>
      </defs>
      <rect width="390" height="10" fill="url(#zz)" />
    </svg>
  </header>
  <main class="el-empty">
    <h2>منوی ال‌آی</h2>
    <p>منو به‌زودی اینجا نمایش داده می‌شود.</p>
  </main>
</template>
