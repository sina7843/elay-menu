<script setup lang="ts">
// Inline icons from the handoff sets. Only the inner shapes are used so `.el-i` applies
// stroke="currentColor" (brand book: inline, currentColor, 24 viewBox, 1.75 stroke).
import { computed } from 'vue';

const raw = {
  ...import.meta.glob<string>('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('../assets/category-icons/*.svg', { query: '?raw', import: 'default', eager: true }),
};
const inner: Record<string, string> = {};
for (const [file, svg] of Object.entries(raw)) {
  const name = file.replace(/^.*\/(icons|category-icons)\/(.+)\.svg$/, (_m, set: string, n: string) => (set === 'icons' ? n : `cat:${n}`));
  inner[name] = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

const props = defineProps<{ name: string }>();
const markup = computed(() => inner[props.name] ?? '');
</script>

<template>
  <svg class="el-i" viewBox="0 0 24 24" aria-hidden="true" v-html="markup" />
</template>
