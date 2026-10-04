<script setup lang="ts">
// A stall or category that was hidden, emptied or deleted since the link was made.
import CustHeader from './CustHeader.vue';
</script>

<template>
  <CustHeader action="back" />
  <main class="el-empty" style="padding-top: 64px">
    <h2>این بخش دیگر در منو نیست</h2>
    <p>شاید غرفه یا دسته از منو برداشته شده باشد.</p>
    <RouterLink class="el-btn el-btn--inverse mt-4" to="/" style="height: 52px; padding: 0 24px">رفتن به منو</RouterLink>
  </main>
</template>
