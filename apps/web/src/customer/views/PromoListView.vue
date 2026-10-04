<script setup lang="ts">
// همه‌ی تخفیف‌ها (Cust-Deals) and همه‌ی پرطرفدارها (Cust-Popular): coloured section head + food rows.
// Sold-out foods are already excluded by the server for both lists.
import { computed } from 'vue';
import ElIcon from '../../components/ElIcon.vue';
import CustHeader from '../components/CustHeader.vue';
import FoodRow from '../components/FoodRow.vue';
import { fa } from '../format';
import { foodsById, menuState } from '../menu';

const props = defineProps<{ kind: 'deals' | 'popular' }>();
const deal = computed(() => props.kind === 'deals');
const foods = computed(() =>
  (deal.value ? menuState.menu!.dealIds : menuState.menu!.popularIds).map((id) => foodsById.value.get(id)).filter((f) => f !== undefined),
);
</script>

<template>
  <CustHeader :title="deal ? 'تخفیف امروز' : 'پرطرفدارها'" action="back" />
  <main>
    <section class="el-promo" :class="deal ? 'el-promo--deal' : 'el-promo--popular'" style="padding-bottom: 18px">
      <div class="el-promo__head" style="padding-top: 22px">
        <h2 style="font-size: 30px; line-height: 40px">
          <ElIcon :name="deal ? 'tag' : 'flame'" />{{ deal ? 'تخفیف امروز' : 'پرطرفدارهای قبیله' }}
        </h2>
      </div>
      <p class="el-promo__sub">
        {{ deal ? `${fa(foods.length)} غذا · فقط تا پایان امشب` : `${fa(foods.length)} غذای پرسفارش این هفته` }}
      </p>
    </section>
    <div class="pad">
      <FoodRow v-for="(f, i) in foods" :key="f.id" :food="f" show-stall :rank="deal ? undefined : i + 1" />
      <p v-if="!foods.length" class="muted" style="padding: 24px 0">
        {{ deal ? 'امروز غذای تخفیف‌داری نداریم.' : 'هنوز غذای پرطرفداری برای این هفته نداریم.' }}
      </p>
    </div>
  </main>
</template>
