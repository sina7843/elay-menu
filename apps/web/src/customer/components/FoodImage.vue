<script setup lang="ts">
// FoodImage: square tile on food-tint-1..4; without a photo, one of the handoff's tribal placeholders.
import { computed } from 'vue';
import type { PublicFood } from '@elay/shared';
import { fa } from '../format';

const props = defineProps<{ food: PublicFood; rank?: number; dim?: boolean }>();

const tint = computed(() => (props.food.tint === 'food-tint-1' ? '' : `el-food-img--t${props.food.tint.slice(-1)}`));

const PLACEHOLDERS = [
  { fill: 'var(--tribal-clay)', pattern: 'pa', shape: 'M50 28L72 50L50 72L28 50Z' },
  { fill: 'var(--tribal-sand)', pattern: 'pt', shape: 'M50 34a16 16 0 1 0 .01 0Z' },
  { fill: 'var(--tribal-ochre)', pattern: 'pz', shape: 'M50 24L74 76H26Z' },
];
// Stable per food: the same dish always gets the same tile.
const placeholder = computed(() => PLACEHOLDERS[parseInt(props.food.id.slice(-4), 16) % PLACEHOLDERS.length]!);
</script>

<template>
  <span v-if="food.imageUrl" class="el-food-img" :class="tint" :style="dim ? 'opacity:.75' : undefined">
    <span v-if="rank" class="el-rank">{{ fa(rank) }}</span>
    <img :src="food.imageUrl" :alt="food.name" loading="lazy" />
  </span>
  <span v-else class="el-food-img el-food-img--placeholder" :style="dim ? 'opacity:.75' : undefined">
    <span v-if="rank" class="el-rank">{{ fa(rank) }}</span>
    <svg viewBox="0 0 100 100" role="img" :aria-label="food.name">
      <rect width="100" height="100" :style="{ fill: placeholder.fill }" />
      <rect width="100" height="100" :fill="`url(#${placeholder.pattern})`" />
      <path :d="placeholder.shape" fill="#1B1512" />
    </svg>
  </span>
</template>
