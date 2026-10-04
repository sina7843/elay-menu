<script setup lang="ts">
// FoodRow (stall, category, search, all-deals, all-popular pages).
import { computed } from 'vue';
import type { PublicFood } from '@elay/shared';
import { fa } from '../format';
import { popularRank, stallOf } from '../menu';
import AddControl from './AddControl.vue';
import FoodImage from './FoodImage.vue';
import PriceTag from './PriceTag.vue';
import StallChip from './StallChip.vue';

const props = defineProps<{ food: PublicFood; showStall?: boolean; rank?: number }>();
const stall = computed(() => stallOf(props.food));
const deal = computed(() => props.food.discountPercent !== null);
// The «پرطرفدار» tag is redundant where the rank badge is already shown.
const popular = computed(() => !props.rank && popularRank.value.has(props.food.id) && props.food.available);
</script>

<template>
  <article class="el-food-row" :class="{ 'el-food-row--sold': !food.available }">
    <FoodImage :food="food" :rank="rank" :dim="food.available && !stall?.isOpen" />
    <div class="el-food-row__body">
      <span class="el-food-row__name">{{ food.name }}</span>
      <span v-if="food.description" class="el-food-row__desc">{{ food.description }}</span>
      <StallChip v-if="showStall && stall" :stall="stall" />
      <span v-if="deal || popular" class="el-food-row__tags">
        <span v-if="popular" class="el-tag el-tag--popular">پرطرفدار</span>
        <span v-if="deal" class="el-tag el-tag--deal">{{ fa(food.discountPercent!) }}٪ تخفیف</span>
      </span>
      <div class="el-food-row__foot">
        <PriceTag :price="food.price" :final="food.finalPrice" :deal="deal" />
        <AddControl :food="food" />
      </div>
    </div>
  </article>
</template>
