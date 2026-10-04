// Customer menu state: one /api/public/menu snapshot, cached on the device for offline use.
import { computed, reactive } from 'vue';
import type { PublicFood, PublicMenu, PublicStall } from '@elay/shared';

const CACHE_KEY = 'elay.menu.v1';
export const MENU_TIMEOUT_MS = 8000;

export const menuState = reactive({
  menu: null as PublicMenu | null,
  /** loading: nothing to show yet; error: first load failed with no cache; ready: `menu` is set. */
  status: 'loading' as 'loading' | 'ready' | 'error',
  /** The menu on screen could not be refreshed (offline or server unreachable): keep the banner up. */
  offline: false,
});

function readCache(): PublicMenu | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as PublicMenu) : null;
  } catch {
    return null;
  }
}

let seq = 0;

/** Fetches the menu; a newer call always wins over an older one that resolves later. */
export async function loadMenu(): Promise<void> {
  const mine = ++seq;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MENU_TIMEOUT_MS);
  try {
    const res = await fetch('/api/public/menu', { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const menu = (await res.json()) as PublicMenu;
    if (mine !== seq) return;
    Object.assign(menuState, { menu, status: 'ready', offline: false });
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(menu));
    } catch {
      /* storage full or disabled: still usable online */
    }
  } catch {
    if (mine !== seq) return;
    if (menuState.menu) Object.assign(menuState, { status: 'ready', offline: true });
    else menuState.status = 'error';
  } finally {
    clearTimeout(timer);
  }
}

export function retryMenu() {
  if (!menuState.menu) menuState.status = 'loading';
  return loadMenu();
}

let started = false;
export function startMenu() {
  if (started) return;
  started = true;
  const cached = readCache();
  if (cached) Object.assign(menuState, { menu: cached, status: 'ready', offline: !navigator.onLine });
  void loadMenu();
  window.addEventListener('online', () => void loadMenu());
  window.addEventListener('offline', () => {
    if (menuState.menu) menuState.offline = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadMenu();
  });
}

// ---------- lookups ----------

export const isClosed = computed(() => menuState.menu?.foodcourt.menuOpen === false);
export const foodsById = computed(() => new Map((menuState.menu?.foods ?? []).map((f) => [f.id, f])));
export const stallsById = computed(() => new Map((menuState.menu?.stalls ?? []).map((s) => [s.id, s])));
export const popularRank = computed(() => new Map((menuState.menu?.popularIds ?? []).map((id, i) => [id, i + 1])));

export const stallOf = (food: PublicFood): PublicStall | undefined => stallsById.value.get(food.stallId);

/** A food can be added when it is available and its stall is open (by the last known menu). */
export const canAdd = (food: PublicFood) => food.available && !!stallOf(food)?.isOpen;
