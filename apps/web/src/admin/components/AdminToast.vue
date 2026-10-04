<script setup lang="ts">
import ElIcon from '../../components/ElIcon.vue';
import { toast } from '../toast';
</script>

<template>
  <div v-if="toast.text" :key="toast.id" class="ad-toast" :class="{ 'ad-toast--error': toast.error }" role="status" aria-live="polite">
    <ElIcon :name="toast.error ? 'info' : 'check'" />{{ toast.text }}
    <RouterLink v-if="toast.link" :to="toast.link" class="ad-toast__link">دیدن</RouterLink>
  </div>
</template>
