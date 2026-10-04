<script setup lang="ts">
// Admin-Stall: current state with the temporary open/close switch (until the next scheduled opening),
// short intro (40) and seven days of hours (overnight allowed, «۲۴:۰۰» = midnight). Saved automatically.
import { computed, reactive, ref, watch } from 'vue';
import { StallProfileInputSchema, type AdminStall, type WeeklySchedule } from '@elay/shared';
import ElIcon from '../../components/ElIcon.vue';
import { faCloseTime, faTime } from '../../customer/format';
import { api } from '../../api';
import PanelSwitch from '../components/PanelSwitch.vue';
import TimeSelect from '../components/TimeSelect.vue';
import { fa } from '../format';
import { failedToast, showToast } from '../toast';
import { base, panel } from './store';

const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const stall = computed(() => panel.stall!);

const form = reactive({ intro: stall.value.intro, days: stall.value.weeklyHours.map((d) => ({ ...d })) });
const errors = ref<string[]>([]);
const switching = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();

function payload() {
  const weeklyHours = form.days.map((d) => ({ ...d })) as WeeklySchedule;
  return { intro: form.intro, weeklyHours };
}

watch(
  form,
  () => {
    clearTimeout(timer);
    const r = StallProfileInputSchema.safeParse(payload());
    errors.value = form.days.map((d) => (!d.closed && d.open === d.close ? 'ساعت شروع و پایان یکی است.' : ''));
    if (!r.success) return;
    timer = setTimeout(() => (saving = saving.then(save)), 700);
  },
  { deep: true },
);

async function save() {
  try {
    panel.stall = await api<AdminStall>(`${base()}/profile`, { method: 'PUT', body: payload() });
    showToast('اطلاعات غرفه ذخیره شد');
  } catch {
    failedToast();
  }
}

async function flip() {
  if (switching.value) return;
  switching.value = true;
  const before = panel.stall;
  try {
    panel.stall = await api<AdminStall>(`${base()}/manual-status`, { method: 'PUT', body: { isOpen: !stall.value.isOpen } });
    showToast(panel.stall.isOpen ? 'غرفه باز شد' : 'غرفه بسته شد');
  } catch {
    panel.stall = before;
    failedToast();
  } finally {
    switching.value = false;
  }
}

const status = computed(() => {
  const s = stall.value;
  const temp = !!s.manualOverride;
  if (s.isOpen) {
    const until = s.closesAt ? ` تا ${faCloseTime(s.closesAt)}` : '';
    return { title: 'الان باز است', hint: `${temp ? 'باز موقت' : 'طبق ساعت کاری'}${until}. برای بستن موقت خاموش کنید.` };
  }
  const next = s.opensAt ? `از ${faTime(s.opensAt)} باز می‌شود` : 'ساعت باز شدنی تعریف نشده است';
  return { title: 'الان بسته است', hint: `${temp ? 'بسته‌ی موقت؛ ' : ''}${next}. برای باز کردن موقت روشن کنید.` };
});
</script>

<template>
  <main class="pad mt-6 panel-page">
    <h1 class="ad-h1">غرفه</h1>
    <div class="ad-status-card mt-4">
      <span id="status-label"><b>{{ status.title }}</b><span>{{ status.hint }}</span></span>
      <PanelSwitch :checked="stall.isOpen" labelledby="status-label" :disabled="switching" @toggle="flip" />
    </div>

    <section class="ad-section">
      <h2><label for="intro">معرفی کوتاه</label></h2>
      <div class="ad-input"><input id="intro" v-model="form.intro" maxlength="40" aria-describedby="intro-hint" /></div>
      <span id="intro-hint" class="ad-hint mt-2"><span>زیر نام غرفه در منو نمایش داده می‌شود.</span><span>{{ fa(form.intro.length) }} / ۴۰</span></span>
    </section>

    <section class="ad-section" aria-labelledby="hours-h">
      <h2 id="hours-h">ساعت کاری</h2>
      <div v-for="(d, i) in form.days" :key="i" class="ad-day" :class="{ 'ad-day--off': d.closed }">
        <b :id="`day-${i}`">{{ DAYS[i] }}</b>
        <span v-if="d.closed" class="ad-day__time">تعطیل</span>
        <span v-else class="ad-day__time">
          <TimeSelect v-model="d.open" :label="`${DAYS[i]} از ساعت`" />تا
          <TimeSelect v-model="d.close" closing :label="`${DAYS[i]} تا ساعت`" />
        </span>
        <PanelSwitch :checked="!d.closed" :label="`${DAYS[i]} باز است`" @toggle="d.closed = !d.closed" />
        <span v-if="errors[i]" class="ad-error" style="grid-column: 1 / -1" role="alert">{{ errors[i] }}</span>
      </div>
      <p class="ad-hint mt-3"><span>اگر ساعت پایان کمتر از شروع باشد، یعنی تا بامداد روز بعد باز است. ۲۴:۰۰ یعنی تا نیمه‌شب.</span></p>
    </section>

    <section class="ad-section" style="border-bottom: 0">
      <div class="el-closed-note" style="background: var(--surface-sunken); color: var(--ink)">
        <ElIcon name="info" /><span>نام و لوگوی غرفه را مدیر فودکورت تغییر می‌دهد.</span>
      </div>
    </section>
  </main>
</template>
