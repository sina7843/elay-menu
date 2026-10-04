<script setup lang="ts">
// Logo (stall or foodcourt) on the cream plate, exactly as the menu shows it. SVG is sent as is (the
// server sanitises and rasterises it); PNG goes through the square cropper first. Upload happens here;
// the parent saves the returned media name with its form.
import { ref } from 'vue';
import ElIcon from '../../components/ElIcon.vue';
import { ApiRequestError, api } from '../../api';
import ImageCropper from './ImageCropper.vue';

const props = defineProps<{ url: string | null; alt: string; endpoint: string; hint: string }>();
const emit = defineEmits<{ uploaded: [{ name: string; url: string }] }>();

const input = ref<HTMLInputElement | null>(null);
const cropFile = ref<File | null>(null);
const busy = ref(false);
const error = ref('');

async function send(blob: Blob, type: string) {
  busy.value = true;
  error.value = '';
  try {
    emit('uploaded', await api<{ name: string; url: string }>(props.endpoint, { method: 'POST', raw: blob, type }));
  } catch (e) {
    error.value = e instanceof ApiRequestError && e.body ? e.body.error.message : 'آپلود نشد. دوباره امتحان کنید.';
  } finally {
    busy.value = false;
  }
}

function chosen(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!file) return;
  if (file.type === 'image/svg+xml') void send(file, 'image/svg+xml');
  else if (file.type === 'image/png') cropFile.value = file;
  else error.value = 'فقط PNG یا SVG.';
}
function cropped(blob: Blob) {
  cropFile.value = null;
  void send(blob, blob.type || 'image/png');
}
</script>

<template>
  <div class="ad-upload">
    <span class="ad-stall-card__plate" style="width: 132px; height: 132px; padding: 14px">
      <img v-if="url" :src="url" :alt="alt" />
    </span>
    <div class="ad-upload__side">
      <input ref="input" type="file" accept="image/png,image/svg+xml" class="visually-hidden" tabindex="-1" aria-hidden="true" @change="chosen" />
      <button type="button" class="ad-btn ad-btn--ghost" style="height: 44px" :disabled="busy" :aria-busy="busy" @click="input?.click()">
        <span v-if="busy" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="image" />
        {{ busy ? 'در حال آپلود…' : url ? 'تغییر لوگو' : 'افزودن لوگو' }}
      </button>
      <span class="ad-hint"><span>{{ hint }}</span></span>
      <span v-if="error" class="ad-error" role="alert">{{ error }}</span>
    </div>
  </div>
  <ImageCropper v-if="cropFile" :file="cropFile" output-type="image/png" :min-side="128" @done="cropped" @cancel="cropFile = null" @another="(cropFile = null), input?.click()" />
</template>
