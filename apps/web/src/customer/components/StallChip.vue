<script setup lang="ts">
import type { PublicStall } from '@elay/shared';

defineProps<{ stall: PublicStall }>();
</script>

<template>
  <span class="el-stall-chip">
    <span class="el-stall-chip__logo"><img v-if="stall.logoUrl" :src="stall.logoUrl" alt="" /></span>{{ stall.name }}
  </span>
</template>
