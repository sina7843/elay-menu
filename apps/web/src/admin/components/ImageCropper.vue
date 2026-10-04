<script setup lang="ts">
// ImageCropper (Admin-Crop): square frame 28px inside a square stage; drag (pointer or arrow keys) and
// zoom (slider, +/− keys, wheel). The image can never leave the frame empty. Output: square WebP
// (PNG where the browser cannot encode WebP), up to 1024×1024, transparency kept.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ElIcon from '../../components/ElIcon.vue';
import ModalLayer from '../../customer/components/ModalLayer.vue';

const props = withDefaults(defineProps<{ file: File; outputType?: 'image/webp' | 'image/png'; minSide?: number }>(), {
  outputType: 'image/webp',
  minSide: 256,
});
const emit = defineEmits<{ done: [Blob]; cancel: []; another: [] }>();

const INSET = 28;
const stage = ref<HTMLElement | null>(null);
const img = new Image();
const url = URL.createObjectURL(props.file);
const size = ref(0); // stage width
const nat = ref({ w: 0, h: 0 });
const zoom = ref(0); // 0..100 → 1×..3× of the minimum cover scale
const offset = ref({ x: 0, y: 0 }); // image centre relative to stage centre, px
const failed = ref(false);
const busy = ref(false);

const frame = computed(() => Math.max(0, size.value - INSET * 2));
const scale = computed(() => {
  const minSide = Math.min(nat.value.w, nat.value.h);
  return minSide ? (frame.value / minSide) * (1 + (zoom.value / 100) * 2) : 1;
});

function clamp() {
  const maxX = Math.max(0, (nat.value.w * scale.value - frame.value) / 2);
  const maxY = Math.max(0, (nat.value.h * scale.value - frame.value) / 2);
  offset.value = { x: Math.min(maxX, Math.max(-maxX, offset.value.x)), y: Math.min(maxY, Math.max(-maxY, offset.value.y)) };
}

const imgStyle = computed(() => {
  const w = nat.value.w * scale.value;
  const h = nat.value.h * scale.value;
  return {
    width: `${w}px`,
    height: `${h}px`,
    left: `${size.value / 2 + offset.value.x - w / 2}px`,
    top: `${size.value / 2 + offset.value.y - h / 2}px`,
  };
});

let ro: ResizeObserver | null = null;
onMounted(() => {
  img.onload = () => {
    nat.value = { w: img.naturalWidth, h: img.naturalHeight };
    clamp();
  };
  img.onerror = () => (failed.value = true);
  img.src = url;
  ro = new ResizeObserver(() => {
    size.value = stage.value?.clientWidth ?? 0;
    clamp();
  });
  if (stage.value) ro.observe(stage.value);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  URL.revokeObjectURL(url);
});

// ---------- interaction ----------
let drag: { id: number; x: number; y: number } | null = null;
function down(e: PointerEvent) {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!drag || drag.id !== e.pointerId) return;
  offset.value = { x: offset.value.x + e.clientX - drag.x, y: offset.value.y + e.clientY - drag.y };
  drag = { ...drag, x: e.clientX, y: e.clientY };
  clamp();
}
const up = () => (drag = null);
function setZoom(v: number) {
  zoom.value = Math.min(100, Math.max(0, v));
  clamp();
}
function key(e: KeyboardEvent) {
  const step = e.shiftKey ? 40 : 10;
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) {
    e.preventDefault();
    offset.value = { x: offset.value.x + moves[e.key]![0], y: offset.value.y + moves[e.key]![1] };
    clamp();
  } else if (e.key === '+' || e.key === '=') setZoom(zoom.value + 10);
  else if (e.key === '-') setZoom(zoom.value - 10);
}
const wheel = (e: WheelEvent) => setZoom(zoom.value - Math.sign(e.deltaY) * 8);

// ---------- output ----------
async function use() {
  if (busy.value || !nat.value.w) return;
  busy.value = true;
  const left = size.value / 2 + offset.value.x - (nat.value.w * scale.value) / 2;
  const top = size.value / 2 + offset.value.y - (nat.value.h * scale.value) / 2;
  const src = frame.value / scale.value; // side of the cropped square in source pixels
  const out = Math.round(Math.min(1024, Math.max(props.minSide, src)));
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  canvas.getContext('2d')!.drawImage(img, (INSET - left) / scale.value, (INSET - top) / scale.value, src, src, 0, 0, out, out);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, props.outputType, 0.9));
  busy.value = false;
  if (blob) emit('done', blob);
}
</script>

<template>
  <ModalLayer fullscreen @close="emit('cancel')">
    <div role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <header class="ad-top">
        <span id="crop-title" class="ad-top__title">برش عکس</span>
        <button type="button" class="ad-icon-btn" aria-label="بازگشت" @click="emit('cancel')"><ElIcon name="back" /></button>
      </header>
      <p v-if="failed" class="el-closed-note" style="margin: 16px">این فایل باز نشد. عکس دیگری انتخاب کنید.</p>
      <div
        v-else
        ref="stage"
        class="ad-crop"
        tabindex="0"
        role="application"
        aria-label="قاب برش. با کلیدهای جهت عکس را جابه‌جا و با + و − بزرگ و کوچک کنید."
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
        @keydown="key"
        @wheel.prevent="wheel"
      >
        <img class="ad-crop__img" :src="url" alt="" :style="imgStyle" draggable="false" />
        <div class="ad-crop__frame"></div>
      </div>
      <div class="pad mt-4 panel-form">
        <p class="ad-hint" style="justify-content: center"><span>عکس را بکشید تا غذا وسط قاب باشد. بیرون قاب بریده می‌شود.</span></p>
        <div class="ad-range mt-3">
          <ElIcon name="minus" />
          <span class="ad-range__track" aria-hidden="true">
            <span class="ad-range__fill" :style="{ width: `${zoom}%` }"></span>
            <span class="ad-range__thumb" :style="{ right: `${zoom}%` }"></span>
          </span>
          <input type="range" min="0" max="100" :value="zoom" aria-label="بزرگنمایی" @input="setZoom(Number(($event.target as HTMLInputElement).value))" />
          <ElIcon name="plus" />
        </div>
        <div style="display: flex; gap: 10px" class="mt-3">
          <button type="button" class="ad-btn ad-btn--ghost" style="flex: 1" @click="emit('another')"><ElIcon name="image" />عکس دیگر</button>
        </div>
      </div>
      <div class="ad-actions">
        <button type="button" class="ad-btn ad-btn--primary" :disabled="busy || failed || !nat.w" :aria-busy="busy" @click="use">
          <span v-if="busy" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="check" />{{ busy ? 'در حال آماده‌سازی…' : 'استفاده از این برش' }}
        </button>
      </div>
    </div>
  </ModalLayer>
</template>
