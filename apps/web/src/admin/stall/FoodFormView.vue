<script setup lang="ts">
// Admin-FoodForm / Admin-FoodNew: photo (crop → upload) and tint, name, description (120), integer Toman
// price, foodcourt + stall category, availability, discount (1–90 %, Jalali dates, live rounded preview),
// delete with confirmation. Constraints come from the shared schema; server field errors are shown too.
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { FOOD_TINTS, FoodInputSchema, discountedPrice, type AdminFood, type FoodInput } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import FoodImage from '../../customer/components/FoodImage.vue';
import ModalLayer from '../../customer/components/ModalLayer.vue';
import { ApiRequestError, api } from '../../api';
import ImageCropper from '../components/ImageCropper.vue';
import PanelSwitch from '../components/PanelSwitch.vue';
import { fa, inDays, jalaliText, parseInteger, parseJalali, today } from '../format';
import { failedToast, savedToast, showToast } from '../toast';
import { base, customerLink, panel, putFood } from './store';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const existing = computed(() => (props.id ? panel.foods.find((f) => f.id === props.id) : undefined));

const f = existing.value;
const form = reactive({
  name: f?.name ?? '',
  description: f?.description ?? '',
  price: f ? fa(f.price) : '',
  image: f?.image ?? null,
  imageUrl: f?.imageUrl ?? null,
  tint: (f?.tint ?? 'food-tint-1') as FoodInput['tint'],
  categoryId: f?.categoryId ?? '',
  stallCategoryId: f?.stallCategoryId ?? (panel.stallCategories.length === 1 ? panel.stallCategories[0]!.id : ''),
  available: f?.available ?? true,
  discountOn: !!f?.discount,
  percent: f?.discount ? fa(f.discount.percent) : '',
  start: jalaliText(f?.discount?.startDate ?? today()),
  end: jalaliText(f?.discount?.endDate ?? inDays(6)),
});
const errors = reactive<Record<string, string>>({});
const busy = ref(false);
const confirming = ref(false);
const deleting = ref(false);
const uploading = ref(false);
const cropFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const price = computed(() => parseInteger(form.price));
const percent = computed(() => parseInteger(form.percent));
const preview = computed(() =>
  price.value !== null && percent.value !== null && percent.value >= 1 && percent.value <= 90 ? discountedPrice(price.value, percent.value) : null,
);
const tile = computed(() => ({ id: props.id ?? '000000000000000000000000', name: form.name || 'غذا', imageUrl: form.imageUrl, tint: form.tint }));

// ---------- photo ----------
function pick() {
  fileInput.value?.click();
}
function chosen(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    errors.image = 'فقط JPG، PNG یا WebP.';
    return;
  }
  delete errors.image;
  cropFile.value = file;
}
async function cropped(blob: Blob) {
  cropFile.value = null;
  uploading.value = true;
  try {
    const res = await api<{ name: string; url: string }>(`${base()}/media/food-image`, { method: 'POST', raw: blob });
    form.image = res.name;
    form.imageUrl = res.url;
    delete errors.image;
  } catch (e) {
    errors.image = e instanceof ApiRequestError && e.body ? e.body.error.message : 'آپلود نشد. دوباره امتحان کنید.';
  } finally {
    uploading.value = false;
  }
}
function another() {
  cropFile.value = null;
  pick();
}

// ---------- validation & save ----------
const FIELD: Record<string, string> = { 'discount.percent': 'percent', 'discount.startDate': 'start', 'discount.endDate': 'end' };

function build(): FoodInput | null {
  for (const k of Object.keys(errors)) delete errors[k];
  if (price.value === null) errors.price = form.price.trim() ? 'قیمت را فقط با عدد بنویسید.' : 'قیمت را وارد کنید.';
  if (!form.categoryId) errors.categoryId = 'یک دسته انتخاب کنید.';
  if (!form.stallCategoryId) errors.stallCategoryId = 'دسته‌ی منوی غرفه را انتخاب کنید.';
  let discount: FoodInput['discount'] = null;
  if (form.discountOn) {
    const startDate = parseJalali(form.start);
    const endDate = parseJalali(form.end);
    if (percent.value === null || percent.value < 1 || percent.value > 90) errors.percent = 'درصد بین ۱ تا ۹۰.';
    if (!startDate) errors.start = 'تاریخ را مثل ۱۴۰۵/۰۷/۱۲ بنویسید.';
    if (!endDate) errors.end = 'تاریخ را مثل ۱۴۰۵/۰۷/۱۸ بنویسید.';
    if (startDate && endDate && startDate > endDate) errors.end = 'تاریخ پایان باید بعد از تاریخ شروع باشد.';
    if (percent.value !== null && startDate && endDate) discount = { percent: percent.value, startDate, endDate };
  }
  const body = {
    name: form.name,
    description: form.description,
    price: price.value ?? -1,
    image: form.image,
    tint: form.tint,
    categoryId: form.categoryId,
    stallCategoryId: form.stallCategoryId,
    available: form.available,
    discount,
  };
  const r = FoodInputSchema.safeParse(body);
  if (!r.success) {
    for (const issue of r.error.issues) {
      const key = FIELD[issue.path.join('.')] ?? String(issue.path[0]);
      if (!errors[key]) errors[key] = key === 'name' ? 'نام غذا را بنویسید (حداکثر ۶۰ حرف).' : key === 'description' ? 'حداکثر ۱۲۰ حرف.' : issue.message;
    }
  }
  if (Object.keys(errors).length) {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    return null;
  }
  return r.success ? r.data : null;
}

async function save() {
  if (busy.value || uploading.value) return;
  const body = build();
  if (!body) return;
  busy.value = true;
  try {
    const saved = props.id
      ? await api<AdminFood>(`${base()}/foods/${props.id}`, { method: 'PUT', body })
      : await api<AdminFood>(`${base()}/foods`, { method: 'POST', body });
    putFood(saved);
    savedToast(saved.name, customerLink.value);
    await router.push('/admin/stall');
  } catch (e) {
    const details = e instanceof ApiRequestError ? e.body?.error.details : undefined;
    if (details?.length) for (const d of details) errors[FIELD[d.path] ?? d.path.split('.')[0]!] = d.message;
    else failedToast(e instanceof ApiRequestError && e.body ? e.body.error.message : undefined);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!props.id || deleting.value) return;
  deleting.value = true;
  try {
    await api(`${base()}/foods/${props.id}`, { method: 'DELETE' });
    panel.foods = panel.foods.filter((x) => x.id !== props.id);
    confirming.value = false;
    showToast(`«${existing.value?.name ?? form.name}» حذف شد`);
    await router.push('/admin/stall');
  } catch {
    failedToast('حذف نشد. دوباره امتحان کنید.');
  } finally {
    deleting.value = false;
  }
}

const err = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `err-${k}` } : {});
</script>

<template>
  <header class="ad-top">
    <h1 class="ad-top__title" style="margin: 0">{{ id ? 'ویرایش غذا' : 'غذای جدید' }}</h1>
    <RouterLink class="ad-icon-btn" to="/admin/stall" aria-label="بازگشت"><ElIcon name="back" /></RouterLink>
  </header>

  <main v-if="id && !existing" class="el-empty" style="padding-top: 64px">
    <h2>این غذا پیدا نشد</h2>
    <RouterLink class="el-btn el-btn--inverse mt-4" to="/admin/stall" style="height: 52px; padding: 0 24px">بازگشت به غذاها</RouterLink>
  </main>

  <form v-else class="pad panel-form" novalidate @submit.prevent="save">
    <section class="ad-section">
      <h2>عکس غذا</h2>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="visually-hidden" tabindex="-1" aria-hidden="true" @change="chosen" />
      <div class="ad-upload">
        <FoodImage v-if="form.imageUrl" :food="tile" />
        <button v-else type="button" class="ad-upload__drop" :aria-busy="uploading" v-bind="err('image')" @click="pick">
          <span v-if="uploading" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="image" />
          {{ uploading ? 'در حال آپلود…' : 'افزودن عکس' }}<span style="font-weight: 500">مربعی · JPG، PNG یا WebP</span>
        </button>
        <div class="ad-upload__side">
          <template v-if="form.imageUrl">
            <button type="button" class="ad-btn ad-btn--ghost" style="height: 44px" :disabled="uploading" @click="pick"><ElIcon name="image" />تغییر عکس</button>
            <button type="button" class="ad-btn ad-btn--danger" style="height: 44px" @click="(form.image = null), (form.imageUrl = null)"><ElIcon name="trash" />حذف عکس</button>
          </template>
          <p v-else class="ad-hint" style="margin: 0"><span>بدون عکس هم می‌شود ذخیره کرد؛ در منو کاشی نقش قبیله‌ای نشان داده می‌شود.</span></p>
        </div>
      </div>
      <span v-if="errors.image" id="err-image" class="ad-error">{{ errors.image }}</span>
      <p class="ad-hint mt-3"><span>عکس به مربع برش می‌خورد. عکس بدون پس‌زمینه بهتر دیده می‌شود.</span></p>
      <div class="ad-field mt-3" style="margin-bottom: 0" role="group" aria-labelledby="tint-label">
        <span id="tint-label" class="ad-field-label">رنگ زمینه‌ی عکس</span>
        <div class="ad-swatches">
          <button
            v-for="(t, i) in FOOD_TINTS"
            :key="t"
            type="button"
            class="ad-swatch"
            :style="{ background: `var(--${t})` }"
            :aria-pressed="form.tint === t"
            :aria-label="`زمینه‌ی ${fa(i + 1)}`"
            @click="form.tint = t"
          ></button>
        </div>
      </div>
    </section>

    <section class="ad-section">
      <h2>اطلاعات غذا</h2>
      <div class="ad-field">
        <label for="f-name">نام غذا <i>*</i></label>
        <div class="ad-input" :class="{ 'ad-input--error': errors.name }"><input id="f-name" v-model="form.name" maxlength="60" v-bind="err('name')" /></div>
        <span v-if="errors.name" id="err-name" class="ad-error">{{ errors.name }}</span>
      </div>
      <div class="ad-field">
        <label for="f-desc">محتویات و توضیحات</label>
        <textarea
          id="f-desc"
          v-model="form.description"
          class="ad-textarea"
          maxlength="120"
          placeholder="مثلاً: سس گوجه، موزارلا، ریحان تازه"
          aria-describedby="f-desc-hint"
          v-bind="err('description')"
        ></textarea>
        <span id="f-desc-hint" class="ad-hint"><span>اندازه و نوع نان را همین‌جا بنویسید.</span><span>{{ fa(form.description.length) }} / ۱۲۰</span></span>
        <span v-if="errors.description" id="err-description" class="ad-error">{{ errors.description }}</span>
      </div>
      <div class="ad-field" style="margin-bottom: 0">
        <label for="f-price">قیمت <i>*</i></label>
        <div class="ad-input" :class="{ 'ad-input--error': errors.price }">
          <input
            id="f-price"
            v-model="form.price"
            inputmode="numeric"
            placeholder="مثلاً ۳۵۰٬۰۰۰"
            v-bind="err('price')"
            @blur="price !== null && (form.price = fa(price))"
          /><span class="ad-input__suffix">تومان</span>
        </div>
        <span v-if="errors.price" id="err-price" class="ad-error">{{ errors.price }}</span>
      </div>
    </section>

    <section class="ad-section">
      <h2>دسته‌بندی</h2>
      <div class="ad-field" role="group" aria-labelledby="cat-label">
        <span id="cat-label" class="ad-field-label">دسته در منوی فودکورت <i>*</i></span>
        <div class="ad-cat-pick">
          <button
            v-for="c in panel.categories"
            :key="c.id"
            type="button"
            :aria-pressed="form.categoryId === c.id"
            v-bind="err('categoryId')"
            @click="form.categoryId = c.id"
          >
            <ElIcon :name="`cat:${c.icon}`" />{{ c.name }}
          </button>
        </div>
        <span v-if="errors.categoryId" id="err-categoryId" class="ad-error">{{ errors.categoryId }}</span>
        <span v-else class="ad-hint"><span>غذا در صفحه‌ی این دسته کنار غذاهای غرفه‌های دیگر دیده می‌شود.</span></span>
      </div>
      <div class="ad-field" style="margin-bottom: 0">
        <label for="f-sc">دسته در منوی غرفه <i>*</i></label>
        <div class="ad-select" :class="{ 'ad-input--error': errors.stallCategoryId }">
          <select id="f-sc" v-model="form.stallCategoryId" v-bind="err('stallCategoryId')">
            <option value="" disabled>انتخاب کنید</option>
            <option v-for="sc in panel.stallCategories" :key="sc.id" :value="sc.id">{{ sc.name }}</option>
          </select>
          <ElIcon name="chevron-down" />
        </div>
        <span v-if="errors.stallCategoryId" id="err-stallCategoryId" class="ad-error">{{ errors.stallCategoryId }}</span>
        <span v-if="!panel.stallCategories.length" class="ad-hint">
          <span>هنوز دسته‌ای ندارید. <RouterLink to="/admin/stall/categories">اول یک دسته بسازید</RouterLink>.</span>
        </span>
      </div>
    </section>

    <section class="ad-section">
      <div class="sw">
        <span id="sw-avail">موجود است<span class="sw__sub">خاموش کنید تا در منو «تموم شد» نشان داده شود</span></span>
        <PanelSwitch :checked="form.available" labelledby="sw-avail" @toggle="form.available = !form.available" />
      </div>
    </section>

    <section class="ad-section" :style="id ? undefined : 'border-bottom:0'">
      <div class="sw">
        <span id="sw-deal">تخفیف<span class="sw__sub">در بخش «تخفیف امروز» صفحه‌ی اول هم می‌آید</span></span>
        <PanelSwitch :checked="form.discountOn" labelledby="sw-deal" @toggle="form.discountOn = !form.discountOn" />
      </div>
      <div v-if="form.discountOn" class="ad-row2 mt-3">
        <div class="ad-field">
          <label for="f-pct">درصد تخفیف</label>
          <div class="ad-input" :class="{ 'ad-input--error': errors.percent }">
            <input id="f-pct" v-model="form.percent" inputmode="numeric" v-bind="err('percent')" /><span class="ad-input__suffix">٪</span>
          </div>
          <span v-if="errors.percent" id="err-percent" class="ad-error">{{ errors.percent }}</span>
        </div>
        <div class="ad-field">
          <span class="ad-field-label" id="pv-label">قیمت بعد از تخفیف</span>
          <div class="ad-preview-price" style="height: 48px; align-items: center" aria-labelledby="pv-label" aria-live="polite">
            <template v-if="preview !== null"><b>{{ fa(preview) }}</b><s>{{ fa(price!) }}</s></template>
            <template v-else>—</template>
          </div>
        </div>
        <div class="ad-field" style="margin-bottom: 0">
          <label for="f-start">از</label>
          <div class="ad-input" :class="{ 'ad-input--error': errors.start }">
            <ElIcon name="calendar" /><input id="f-start" v-model="form.start" inputmode="numeric" placeholder="۱۴۰۵/۰۷/۱۲" v-bind="err('start')" />
          </div>
          <span v-if="errors.start" id="err-start" class="ad-error">{{ errors.start }}</span>
        </div>
        <div class="ad-field" style="margin-bottom: 0">
          <label for="f-end">تا</label>
          <div class="ad-input" :class="{ 'ad-input--error': errors.end }">
            <ElIcon name="calendar" /><input id="f-end" v-model="form.end" inputmode="numeric" placeholder="۱۴۰۵/۰۷/۱۸" v-bind="err('end')" />
          </div>
          <span v-if="errors.end" id="err-end" class="ad-error">{{ errors.end }}</span>
        </div>
      </div>
    </section>

    <section v-if="id" class="ad-section" style="border-bottom: 0">
      <button type="button" class="ad-btn ad-btn--danger ad-btn--block" aria-haspopup="dialog" @click="confirming = true">
        <ElIcon name="trash" />حذف این غذا
      </button>
    </section>

    <div class="ad-actions">
      <button type="submit" class="ad-btn ad-btn--primary" :disabled="busy || uploading" :aria-busy="busy">
        <span v-if="busy" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="check" />
        {{ busy ? 'در حال ذخیره…' : id ? 'ذخیره‌ی تغییرات' : 'افزودن به منو' }}
      </button>
    </div>
  </form>

  <ImageCropper v-if="cropFile" :file="cropFile" @done="cropped" @cancel="cropFile = null" @another="another" />

  <ModalLayer v-if="confirming" @close="confirming = false">
    <div class="ad-dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc">
      <h2 id="del-title">«{{ existing?.name }}» حذف شود؟</h2>
      <p id="del-desc">از منو و از لیست سفارش مشتری‌ها برداشته می‌شود و برنمی‌گردد. اگر فقط امروز تمام شده، به جای حذف آن را «تموم شد» کنید.</p>
      <div class="ad-dialog__actions">
        <button type="button" class="ad-btn ad-btn--accent" :disabled="deleting" :aria-busy="deleting" @click="remove">
          <span v-if="deleting" class="el-spinner" aria-hidden="true"></span><ElIcon v-else name="trash" />{{ deleting ? 'در حال حذف…' : 'حذف' }}
        </button>
        <button type="button" class="ad-btn ad-btn--ghost" style="flex: 1" @click="confirming = false">انصراف</button>
      </div>
    </div>
  </ModalLayer>
</template>
