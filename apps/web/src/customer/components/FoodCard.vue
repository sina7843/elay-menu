<script setup lang="ts">
// FoodCard for the horizontal deal / popular rails.
import { computed } from 'vue';
import type { PublicFood } from '@elay/shared';
import { fa } from '../format';
import { stallOf } from '../menu';
import AddControl from './AddControl.vue';
import FoodImage from './FoodImage.vue';
import PriceTag from './PriceTag.vue';
import StallChip from './StallChip.vue';

const props = defineProps<{ food: PublicFood; rank?: number; stamp?: boolean }>();
const stall = computed(() => stallOf(props.food));
</script>

<template>
  <article class="el-food-card">
    <FoodImage :food="food" :dim="!stall?.isOpen" />
    <span v-if="stamp && food.discountPercent" class="el-stamp">{{ fa(food.discountPercent) }}٪</span>
    <span v-if="rank" class="el-rank">{{ fa(rank) }}</span>
    <div class="el-food-card__body">
      <StallChip v-if="stall" :stall="stall" />
      <span class="el-food-card__name">{{ food.name }}</span>
      <div class="el-food-card__foot">
        <PriceTag :price="food.price" :final="food.finalPrice" :deal="stamp" sm />
        <AddControl :food="food" />
      </div>
    </div>
  </article>
</template>
