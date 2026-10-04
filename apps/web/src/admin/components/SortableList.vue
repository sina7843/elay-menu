<script setup lang="ts" generic="T extends { id: string; name: string }">
// SortableList: drag the grip (pointer) or focus it and use ↑/↓ — the keyboard alternative to dragging.
// Emits the full new order; the parent saves it and rolls back on failure.
import { computed, nextTick, ref } from 'vue';
import ElIcon from '../../components/ElIcon.vue';

const props = defineProps<{ items: T[] }>();
const emit = defineEmits<{ reorder: [T[]] }>();
defineSlots<{ default(p: { item: T; index: number }): unknown; actions(p: { item: T }): unknown }>();

const list = ref<HTMLElement | null>(null);
const announce = ref('');
const dragging = ref<string | null>(null);
const draft = ref<T[]>([]) as { value: T[] };
const shown = computed(() => (dragging.value ? draft.value : props.items));

function moved(next: T[], item: T) {
  announce.value = `${item.name} جای ${next.indexOf(item) + 1} از ${next.length}`;
  emit('reorder', next);
}

async function key(e: KeyboardEvent, i: number) {
  const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
  if (!dir || i + dir < 0 || i + dir >= props.items.length) return;
  e.preventDefault();
  const next = [...props.items];
  const [item] = next.splice(i, 1);
  next.splice(i + dir, 0, item!);
  moved(next, item!);
  await nextTick();
  list.value?.querySelectorAll<HTMLElement>('.ad-grip')[i + dir]?.focus();
}

function down(e: PointerEvent, item: T) {
  dragging.value = item.id;
  draft.value = [...props.items];
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!dragging.value || !list.value) return;
  const rows = [...list.value.querySelectorAll<HTMLElement>('.ad-list-row')];
  const target = rows.findIndex((r) => {
    const b = r.getBoundingClientRect();
    return e.clientY < b.top + b.height / 2;
  });
  const next = [...draft.value];
  const from = next.findIndex((x) => x.id === dragging.value);
  const to = target < 0 ? next.length - 1 : target > from ? target - 1 : target;
  if (to === from) return;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  draft.value = next; // shown while dragging; saved once on drop
}
function up() {
  const id = dragging.value;
  dragging.value = null;
  const item = draft.value.find((x) => x.id === id);
  const changed = draft.value.some((x, i) => x.id !== props.items[i]?.id);
  if (item && changed) moved(draft.value, item);
}
</script>

<template>
  <div ref="list" style="border-top: 1px solid var(--line-strong)">
    <div v-for="(item, i) in shown" :key="item.id" class="ad-list-row" :class="{ 'is-dragging': dragging === item.id }">
      <button
        type="button"
        class="ad-grip ad-icon-btn"
        style="border: 0; touch-action: none; cursor: grab"
        :aria-label="`جابه‌جایی ${item.name}؛ با کلیدهای بالا و پایین`"
        @keydown="key($event, i)"
        @pointerdown="down($event, item)"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
      >
        <ElIcon name="grip" />
      </button>
      <slot :item="item" :index="i" />
      <slot name="actions" :item="item" />
    </div>
    <span class="visually-hidden" aria-live="polite">{{ announce }}</span>
  </div>
</template>

<style scoped>
.is-dragging {
  background: var(--surface);
}
</style>
