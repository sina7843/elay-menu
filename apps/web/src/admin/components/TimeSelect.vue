<script setup lang="ts">
// Compact time picker styled as the handoff `ad-time` box: quarter hours with Persian digits, 24-hour
// clock, and «۲۴:۰۰» (midnight end of day) for closing times. Native <input type=time> shows AM/PM in
// fa-IR and cannot express 24:00.
import { computed } from 'vue';

const model = defineModel<string>({ required: true });
const props = defineProps<{ closing?: boolean; label: string }>();

const fa = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
const options = computed(() => {
  const list: string[] = [];
  for (let m = 0; m < 1440; m += 15) list.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  if (props.closing) list.push('24:00');
  if (!list.includes(model.value)) list.push(model.value); // keep an off-grid saved value selectable
  return list.sort();
});
</script>

<template>
  <select v-model="model" class="ad-time" :aria-label="label">
    <option v-for="t in options" :key="t" :value="t">{{ fa(t) }}</option>
  </select>
</template>
