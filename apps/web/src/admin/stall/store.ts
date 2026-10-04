// State of the stall panel. The stall id comes from the signed-in account (server-issued), never from the URL;
// every request is authorised again by the API.
import { computed, reactive } from 'vue';
import type { AdminCategory, AdminFood, AdminStall, AdminStallCategory } from '@elay/shared';
import { account, api } from '../../api';

export const panel = reactive({
  stall: null as AdminStall | null,
  foods: [] as AdminFood[],
  stallCategories: [] as AdminStallCategory[],
  categories: [] as AdminCategory[],
  loaded: false,
  error: '',
});

export const base = () => `/api/admin/stalls/${account.value!.stallId}`;

export async function loadPanel() {
  panel.error = '';
  try {
    const [stall, foods, stallCategories, categories] = await Promise.all([
      api<AdminStall>(base()),
      api<AdminFood[]>(`${base()}/foods`),
      api<AdminStallCategory[]>(`${base()}/categories`),
      api<AdminCategory[]>('/api/admin/categories'),
    ]);
    Object.assign(panel, { stall, foods, stallCategories, categories, loaded: true });
  } catch (e) {
    panel.error = (e as Error).message;
  }
}

export const refreshStall = async () => (panel.stall = await api<AdminStall>(base()));
export const refreshCategories = async () => (panel.stallCategories = await api<AdminStallCategory[]>(`${base()}/categories`));

export function putFood(food: AdminFood) {
  const i = panel.foods.findIndex((f) => f.id === food.id);
  if (i >= 0) panel.foods[i] = food;
  else panel.foods.push(food);
}

/** Customer stall page, for the «دیدن منوی غرفه» button and Toast links. */
export const customerLink = computed(() => (panel.stall ? `/stall/${panel.stall.id}` : '/'));
