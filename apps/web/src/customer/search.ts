import type { LocationQuery } from 'vue-router';
import { matchesTokens, searchTokens, type PublicMenu, type PublicSearchResponse } from '@elay/shared';
import { menuState, retryMenu } from './menu';

export type PriceBand = 'all' | 'lt200' | '200to400' | 'gt400';
export type SortKey = 'default' | 'cheapest' | 'priciest' | 'popular';

export interface Filters {
  onlyOpen: boolean;
  onlyDiscounted: boolean;
  price: PriceBand;
  sort: SortKey;
}

export const NO_FILTERS: Filters = { onlyOpen: false, onlyDiscounted: false, price: 'all', sort: 'default' };

export const PRICE_BANDS: [PriceBand, string][] = [
  ['all', 'همه'],
  ['lt200', 'تا ۲۰۰ هزار'],
  ['200to400', '۲۰۰ تا ۴۰۰ هزار'],
  ['gt400', 'بالای ۴۰۰ هزار'],
];
export const SORTS: [SortKey, string][] = [
  ['default', 'پیشنهادی'],
  ['cheapest', 'ارزان‌ترین'],
  ['priciest', 'گران‌ترین'],
  ['popular', 'پرطرفدارترین'],
];

const BOUNDS: Record<PriceBand, [number | undefined, number | undefined]> = {
  all: [undefined, undefined],
  lt200: [undefined, 200_000],
  '200to400': [200_000, 400_000],
  gt400: [400_001, undefined],
};

export const activeFilterCount = (f: Filters) =>
  Number(f.onlyOpen) + Number(f.onlyDiscounted) + Number(f.price !== 'all') + Number(f.sort !== 'default');

// ---------- URL <-> filters (search page state is shareable and survives reload) ----------

const one = (v: LocationQuery[string] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export function filtersFromQuery(q: LocationQuery): Filters {
  const price = one(q.price);
  const sort = one(q.sort);
  return {
    onlyOpen: one(q.open) === '1',
    onlyDiscounted: one(q.deal) === '1',
    price: PRICE_BANDS.some(([k]) => k === price) ? (price as PriceBand) : 'all',
    sort: SORTS.some(([k]) => k === sort) ? (sort as SortKey) : 'default',
  };
}

export function queryFor(text: string, f: Filters): Record<string, string> {
  const q: Record<string, string> = {};
  if (text.trim()) q.q = text.trim();
  if (f.onlyOpen) q.open = '1';
  if (f.onlyDiscounted) q.deal = '1';
  if (f.price !== 'all') q.price = f.price;
  if (f.sort !== 'default') q.sort = f.sort;
  return q;
}

// ---------- running a search ----------

function apiParams(text: string, f: Filters) {
  const p = new URLSearchParams();
  if (text.trim()) p.set('q', text.trim());
  if (f.onlyOpen) p.set('onlyOpen', 'true');
  if (f.onlyDiscounted) p.set('onlyDiscounted', 'true');
  const [min, max] = BOUNDS[f.price];
  if (min !== undefined) p.set('minPrice', String(min));
  if (max !== undefined) p.set('maxPrice', String(max));
  if (f.sort !== 'default') p.set('sort', f.sort);
  return p;
}

/**
 * Offline fallback over the cached menu with the same shared normalisation as the server.
 * ponytail: "popular" sort uses the cached top-five order only (weekly counts are not in the snapshot).
 */
export function searchLocally(menu: PublicMenu, text: string, f: Filters): PublicSearchResponse {
  const tokens = searchTokens(text);
  const stallById = new Map(menu.stalls.map((s) => [s.id, s]));
  const catName = new Map(menu.categories.map((c) => [c.id, c.name]));
  const [min, max] = BOUNDS[f.price];
  const foods = menu.foods.filter((food) => {
    const stall = stallById.get(food.stallId)!;
    return (
      (!f.onlyOpen || stall.isOpen) &&
      (!f.onlyDiscounted || food.discountPercent !== null) &&
      (min === undefined || food.finalPrice >= min) &&
      (max === undefined || food.finalPrice <= max) &&
      matchesTokens(tokens, food.name, food.description, stall.name, catName.get(food.categoryId) ?? '')
    );
  });
  const rank = (id: string) => {
    const i = menu.popularIds.indexOf(id);
    return i < 0 ? 99 : i;
  };
  if (f.sort === 'cheapest') foods.sort((a, b) => a.finalPrice - b.finalPrice);
  if (f.sort === 'priciest') foods.sort((a, b) => b.finalPrice - a.finalPrice);
  if (f.sort === 'popular') foods.sort((a, b) => rank(a.id) - rank(b.id));
  const stalls = tokens.length ? menu.stalls.filter((s) => matchesTokens(tokens, s.name) && (!f.onlyOpen || s.isOpen)) : [];
  return { stalls, foods };
}

/**
 * Creates a searcher whose results can never be overwritten by an older, slower request:
 * every call aborts the previous one and stale responses are dropped by sequence number.
 */
export function createSearcher() {
  let seq = 0;
  let ctrl: AbortController | null = null;
  return async function run(text: string, f: Filters): Promise<PublicSearchResponse | null> {
    const mine = ++seq;
    ctrl?.abort();
    ctrl = new AbortController();
    try {
      const res = await fetch(`/api/public/search?${apiParams(text, f)}`, { signal: ctrl.signal, cache: 'no-store' });
      if (res.status === 403) {
        void retryMenu(); // menu was closed meanwhile: refresh so the closed screen shows everywhere
        return null;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as PublicSearchResponse;
      return mine === seq ? data : null;
    } catch (e) {
      if (mine !== seq || (e instanceof DOMException && e.name === 'AbortError')) return null;
      if (!menuState.menu) return null;
      menuState.offline = true; // results now come from the cached menu: say so
      return searchLocally(menuState.menu, text, f);
    }
  };
}
