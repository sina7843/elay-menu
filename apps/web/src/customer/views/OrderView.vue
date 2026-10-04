<script setup lang="ts">
// لیست سفارش (Editorial-Order, Cust-EmptyOrder): one group per stall to read to that stall's cashier.
// Not an order: nothing is sent anywhere. Unavailable items stay visible, explained and out of the totals.
import { computed, nextTick, ref } from 'vue';
import ElIcon from '../../components/ElIcon.vue';
import CustHeader from '../components/CustHeader.vue';
import FoodImage from '../components/FoodImage.vue';
import ModalLayer from '../components/ModalLayer.vue';
import PriceTag from '../components/PriceTag.vue';
import { cartView, clearCart, decrement, increment, itemCount, removeItem, stallCount, type Line } from '../cart';
import { fa, faTime, itemsFromStalls } from '../format';

const confirming = ref(false);
const unavailableCount = computed(() => cartView.value.groups.flatMap((g) => g.lines).filter((l) => l.status !== 'ok').length + cartView.value.missing.length);

function note(line: Line) {
  if (line.status === 'soldout') return 'تموم شد · در جمع حساب نمی‌شود';
  const opens = cartView.value.groups.find((g) => g.stall.id === line.food.stallId)?.stall.opensAt;
  return opens ? `غرفه بسته است؛ از ${faTime(opens)} · در جمع حساب نمی‌شود` : 'غرفه بسته است · در جمع حساب نمی‌شود';
}

async function less(line: Line) {
  const wasLast = line.qty === 1;
  decrement(line.id);
  if (wasLast) {
    await nextTick();
    document.querySelector<HTMLElement>('.order-focus-target')?.focus();
  }
}
function clearAll() {
  clearCart();
  confirming.value = false;
}
</script>

<template>
  <CustHeader title="لیست سفارش" action="back" />
  <main v-if="itemCount > 0" class="pad mt-7">
    <h1 class="el-page-title order-focus-target" tabindex="-1">لیست سفارش</h1>
    <div style="display: flex; align-items: center; justify-content: space-between">
      <p class="el-page-sub">{{ itemsFromStalls(itemCount, stallCount) }}</p>
      <button type="button" class="el-btn el-btn--text" aria-haspopup="dialog" @click="confirming = true">پاک کردن لیست</button>
    </div>
    <div class="el-rule el-rule--double mt-3"></div>
    <div class="el-notice mt-4">
      <ElIcon name="info" />
      <span>این لیست هنوز سفارش نیست. <b>هر بخش را برای صندوقدار همان غرفه بخوانید</b> و همان‌جا پرداخت کنید.</span>
    </div>
    <div v-if="unavailableCount" class="el-closed-note mt-4" role="note">
      <ElIcon name="info" />
      <span>{{ fa(unavailableCount) }} مورد از لیست الان قابل سفارش نیست و در جمع‌ها حساب نشده است.</span>
    </div>

    <section v-for="g in cartView.groups" :key="g.stall.id" class="mt-7" :aria-label="`سفارش ${g.stall.name}`">
      <div class="el-order-group__head">
        <span class="el-order-group__logo"><img v-if="g.stall.logoUrl" :src="g.stall.logoUrl" alt="" /></span>
        <span>
          <span class="el-order-group__name">{{ g.stall.name }}</span>
          <span class="el-order-group__hint">این بخش را برای صندوقدار {{ g.stall.name }} بخوانید</span>
        </span>
      </div>
      <div v-for="line in g.lines" :key="line.id" class="el-order-row" :class="{ 'order-row--off': line.status !== 'ok' }">
        <FoodImage :food="line.food" />
        <div class="el-order-row__body">
          <span class="el-order-row__name"><span class="el-order-row__qty">{{ fa(line.qty) }} ×</span>{{ line.food.name }}</span>
          <span v-if="line.food.description" class="el-order-row__opts">{{ line.food.description }}</span>
          <span v-if="line.status !== 'ok'" class="el-sold" style="align-self: flex-start">{{ note(line) }}</span>
        </div>
        <div class="el-order-row__end">
          <PriceTag
            v-if="line.status === 'ok'"
            :price="line.food.price * line.qty"
            :final="line.amount"
            sm
          />
          <span class="el-stepper el-stepper--outline" role="group" :aria-label="`تعداد ${line.food.name}`">
            <button type="button" aria-label="یکی بیشتر" :disabled="line.status !== 'ok'" @click="increment(line.food)">
              <ElIcon name="plus" />
            </button>
            <b aria-live="polite">{{ fa(line.qty) }}</b>
            <button type="button" :aria-label="line.qty === 1 ? 'حذف از لیست' : 'یکی کمتر'" @click="less(line)">
              <ElIcon :name="line.qty === 1 ? 'trash' : 'minus'" />
            </button>
          </span>
        </div>
      </div>
      <div class="el-order-group__sum">
        <span>جمع این غرفه</span><b>{{ fa(g.subtotal) }}<small>تومان</small></b>
      </div>
    </section>

    <section v-if="cartView.missing.length" class="mt-7" aria-label="موارد حذف‌شده از منو">
      <div class="el-order-group__head">
        <span><span class="el-order-group__name">دیگر در منو نیست</span>
          <span class="el-order-group__hint">این غذاها از منو برداشته شده‌اند و جایگزینی برایشان انتخاب نمی‌شود.</span></span>
      </div>
      <div v-for="m in cartView.missing" :key="m.id" class="el-order-row order-row--off">
        <div class="el-order-row__body">
          <span class="el-order-row__name"><span class="el-order-row__qty">{{ fa(m.qty) }} ×</span>غذایی که دیگر در منو نیست</span>
        </div>
        <div class="el-order-row__end">
          <button type="button" class="el-btn el-btn--outline" @click="removeItem(m.id)"><ElIcon name="trash" />حذف از لیست</button>
        </div>
      </div>
    </section>

    <div class="el-order-total mt-7">
      <span><b>جمع کل لیست</b><span>پرداخت جداگانه در هر غرفه</span></span>
      <strong>{{ fa(cartView.total) }} <small style="font-size: 12px; font-weight: 500">تومان</small></strong>
    </div>
    <div style="height: 32px"></div>
  </main>

  <template v-else>
    <div class="pad mt-7">
      <h1 class="el-page-title" style="font-size: 40px; line-height: 48px">لیست سفارش</h1>
      <div class="el-rule el-rule--double mt-4"></div>
    </div>
    <main class="el-empty" style="padding-top: 64px">
      <svg class="el-empty__art" viewBox="0 0 120 120" aria-hidden="true">
        <rect x="28" y="20" width="64" height="84" fill="none" stroke="currentColor" stroke-width="3" />
        <path d="M40 42h40M40 56h40M40 70h24" stroke="#1B1512" stroke-width="3" stroke-linecap="round" />
        <path d="M28 104L34 96L40 104L46 96L52 104L58 96L64 104L70 96L76 104L82 96L88 104L92 99" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
      </svg>
      <h2>لیست شما خالی است</h2>
      <p>از منو، کنار هر غذا دکمه‌ی + را بزنید تا به این لیست اضافه شود.</p>
      <RouterLink class="el-btn el-btn--inverse mt-4" to="/" style="height: 52px; padding: 0 24px">رفتن به منو</RouterLink>
    </main>
  </template>

  <ModalLayer v-if="confirming" @close="confirming = false">
    <div class="ad-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-desc">
      <h2 id="clear-title">لیست سفارش پاک شود؟</h2>
      <p id="clear-desc">همه‌ی {{ fa(itemCount) }} مورد از لیست روی این گوشی برداشته می‌شود و برنمی‌گردد.</p>
      <div class="ad-dialog__actions">
        <button type="button" class="ad-btn ad-btn--accent" @click="clearAll"><ElIcon name="trash" />پاک کردن</button>
        <button type="button" class="ad-btn ad-btn--ghost" style="flex: 1" @click="confirming = false">انصراف</button>
      </div>
    </div>
  </ModalLayer>
</template>

<style scoped>
.order-row--off .el-food-img,
.order-row--off .el-order-row__name,
.order-row--off .el-order-row__opts {
  opacity: 0.45;
}
.el-stepper button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.el-page-title:focus {
  outline: none;
}
</style>
