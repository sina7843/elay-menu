<script setup lang="ts">
import type { PublicStall } from '@elay/shared';

defineProps<{ stall: PublicStall }>();
</script>

<template>
  <RouterLink class="el-stall" :class="{ 'el-stall--closed': !stall.isOpen }" :to="`/stall/${stall.id}`">
    <span class="el-stall__plate"><img v-if="stall.logoUrl" :src="stall.logoUrl" :alt="`لوگوی ${stall.name}`" /></span>
    <span class="el-stall__name">{{ stall.name }}</span>
    <span class="el-status" :class="stall.isOpen ? 'el-status--open' : 'el-status--closed'"><i></i>{{ stall.isOpen ? 'باز' : 'بسته' }}</span>
  </RouterLink>
</template>
