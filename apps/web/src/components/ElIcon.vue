<script setup lang="ts">
// Inline icons from the Elay icon sets (assets/icons: UI, 1.75 stroke; assets/category-icons: 2 stroke).
// Only the inner shapes are used so `.el-i` applies currentColor; each set keeps its own stroke width.
import { computed } from 'vue';

const raw = {
  ...import.meta.glob<string>('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('../assets/category-icons/*.svg', { query: '?raw', import: 'default', eager: true }),
};
const icons: Record<string, { markup: string; stroke: string | undefined }> = {};
for (const [file, svg] of Object.entries(raw)) {
  const name = file.replace(/^.*\/(icons|category-icons)\/(.+)\.svg$/, (_m, set: string, n: string) => (set === 'icons' ? n : `cat:${n}`));
  icons[name] = {
    markup: svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
    stroke: svg.match(/<svg[^>]*stroke-width="([\d.]+)"/)?.[1],
  };
}

const props = defineProps<{ name: string }>();
const icon = computed(() => icons[props.name]);
</script>

<template>
  <svg class="el-i" viewBox="0 0 24 24" aria-hidden="true" :style="icon?.stroke ? { strokeWidth: icon.stroke } : undefined" v-html="icon?.markup ?? ''" />
</template>
