// The order list lives only on this device: food ids and positive integer quantities, nothing else.
// Prices, names and availability always come from the current menu, so they reconcile automatically.
import { computed, reactive, watch } from 'vue';
import type { PublicFood, PublicStall } from '@elay/shared';
import { canAdd, foodsById, menuState, stallsById } from './menu';

const KEY = 'elay.cart.v1';
const MAX_QTY = 99;
const ID = /^[a-f0-9]{24}$/;

interface Item {
  id: string;
  qty: number;
}

function load(): Item[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const merged = new Map<string, number>();
    for (const it of raw) {
      if (it && typeof it.id === 'string' && ID.test(it.id) && Number.isInteger(it.qty) && it.qty > 0) {
        merged.set(it.id, Math.min(MAX_QTY, (merged.get(it.id) ?? 0) + it.qty));
      }
    }
    return [...merged].map(([id, qty]) => ({ id, qty }));
  } catch {
    return [];
  }
}

export const cart = reactive({ items: load() });

watch(
  () => cart.items,
  (items) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items.map(({ id, qty }) => ({ id, qty }))));
    } catch {
      /* private mode: list still works for this visit */
    }
  },
  { deep: true },
);
// Keep several open tabs in step.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) cart.items = load();
});

export const qtyOf = (id: string) => cart.items.find((i) => i.id === id)?.qty ?? 0;

/** Anonymous popularity "+" (fire-and-forget; counts are approximate by design). */
function countAdd(foodId: string) {
  if (!navigator.onLine) return;
  void fetch('/api/public/popularity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ foodId }),
    keepalive: true,
  }).catch(() => undefined);
}

/** "+" from a menu row, card or the order list. Refused for sold-out foods and closed stalls. */
export function increment(food: PublicFood): boolean {
  if (!canAdd(food)) return false;
  const item = cart.items.find((i) => i.id === food.id);
  if (item && item.qty >= MAX_QTY) return false;
  if (item) item.qty++;
  else cart.items.push({ id: food.id, qty: 1 });
  countAdd(food.id);
  return true;
}

/** "−" / trash; works offline and for unavailable items. */
export function decrement(id: string) {
  const i = cart.items.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (cart.items[i]!.qty > 1) cart.items[i]!.qty--;
  else cart.items.splice(i, 1);
}

export const removeItem = (id: string) => {
  cart.items = cart.items.filter((i) => i.id !== id);
};
export const clearCart = () => {
  cart.items = [];
};

// ---------- reconciled view ----------

export type LineStatus = 'ok' | 'soldout' | 'closed';

export interface Line {
  id: string;
  qty: number;
  food: PublicFood;
  status: LineStatus;
  /** finalPrice × qty from the server's pricing; 0 for unavailable lines. */
  amount: number;
}

export interface Group {
  stall: PublicStall;
  lines: Line[];
  subtotal: number;
}

export const cartView = computed(() => {
  const groups = new Map<string, Group>();
  const missing: Item[] = []; // deleted or hidden foods / stalls: never substituted, only removable
  for (const it of cart.items) {
    const food = foodsById.value.get(it.id);
    const stall = food && stallsById.value.get(food.stallId);
    if (!food || !stall) {
      missing.push(it);
      continue;
    }
    const status: LineStatus = !food.available ? 'soldout' : !stall.isOpen ? 'closed' : 'ok';
    const amount = status === 'ok' ? food.finalPrice * it.qty : 0;
    const g = groups.get(stall.id) ?? { stall, lines: [], subtotal: 0 };
    g.lines.push({ id: it.id, qty: it.qty, food, status, amount });
    g.subtotal += amount;
    groups.set(stall.id, g);
  }
  const ordered = [...groups.values()].sort((a, b) => a.stall.sortOrder - b.stall.sortOrder);
  return {
    groups: ordered,
    missing: menuState.menu ? missing : [], // without a menu nothing can be judged missing
    total: ordered.reduce((s, g) => s + g.subtotal, 0),
  };
});

/** Every item on the list (shown in the header and order bar), including ones that cannot be bought now. */
export const itemCount = computed(() => cart.items.reduce((s, i) => s + i.qty, 0));
export const stallCount = computed(() => cartView.value.groups.length);
