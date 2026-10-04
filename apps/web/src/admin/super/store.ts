// Super-admin panel state. Every call is authorised again by the API (super_admin role only).
import { reactive } from 'vue';
import type { AdminCategory, AdminFoodcourt, AdminStall, TemporaryPasswordResponse } from '@elay/shared';
import { api } from '../../api';

export const sa = reactive({
  stalls: [] as AdminStall[],
  categories: [] as AdminCategory[],
  foodcourt: null as AdminFoodcourt | null,
  loaded: false,
  error: '',
  /** Temporary password handed over by create/reset; shown once on the stall form, then forgotten. */
  credentials: null as (TemporaryPasswordResponse & { stallId: string }) | null,
});

export async function loadSuper() {
  sa.error = '';
  try {
    const [stalls, categories, foodcourt] = await Promise.all([
      api<AdminStall[]>('/api/admin/stalls'),
      api<AdminCategory[]>('/api/admin/categories'),
      api<AdminFoodcourt>('/api/admin/foodcourt'),
    ]);
    Object.assign(sa, { stalls, categories, foodcourt, loaded: true });
  } catch (e) {
    sa.error = (e as Error).message;
  }
}

export const refreshStalls = async () => (sa.stalls = await api<AdminStall[]>('/api/admin/stalls'));
export const refreshCategories = async () => (sa.categories = await api<AdminCategory[]>('/api/admin/categories'));
