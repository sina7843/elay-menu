<script setup lang="ts">
import type { PublicCategory } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';

defineProps<{ category: PublicCategory }>();
</script>

<template>
  <RouterLink class="el-cat" :to="`/category/${category.id}`"><ElIcon :name="`cat:${category.icon}`" />{{ category.name }}</RouterLink>
</template>
