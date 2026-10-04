<script setup lang="ts">
// Overlay + focus handling for FilterSheet and the confirmation dialog: Esc and overlay close,
// Tab stays inside, focus returns to the opener.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

defineProps<{ fullscreen?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const layer = ref<HTMLElement | null>(null);
const opener = document.activeElement as HTMLElement | null;

const focusables = () =>
  [...(layer.value?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])') ?? [])].filter(
    (el) => !el.hasAttribute('disabled'),
  );

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
  if (e.key !== 'Tab') return;
  const list = focusables();
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last?.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first?.focus();
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  await nextTick();
  focusables()[0]?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
  opener?.focus?.();
});
</script>

<template>
  <div ref="layer" :class="fullscreen ? 'app-screen' : 'app-layer'">
    <div v-if="!fullscreen" class="el-overlay" @click="emit('close')"></div>
    <slot />
  </div>
</template>
