import { createRouter, createWebHistory } from 'vue-router';
import type { Role } from '@elay/shared';
import { adminHome, ensureSession } from './api';
// Customer screens are bundled eagerly so an offline reload (service worker) has every chunk.
import CustomerLayout from './customer/CustomerLayout.vue';
import CategoryView from './customer/views/CategoryView.vue';
import HomeView from './customer/views/HomeView.vue';
import OrderView from './customer/views/OrderView.vue';
import PromoListView from './customer/views/PromoListView.vue';
import SearchView from './customer/views/SearchView.vue';
import StallView from './customer/views/StallView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    role?: Role;
    noOrderBar?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    {
      path: '/',
      component: CustomerLayout,
      children: [
        { path: '', component: HomeView },
        { path: 'category/:id', component: CategoryView, props: true },
        { path: 'stall/:id', component: StallView, props: true },
        { path: 'deals', component: PromoListView, props: { kind: 'deals' } },
        { path: 'popular', component: PromoListView, props: { kind: 'popular' } },
        { path: 'search', component: SearchView },
        { path: 'order', component: OrderView, meta: { noOrderBar: true } },
      ],
    },
    { path: '/admin/login', component: () => import('./views/AdminLogin.vue') },
    { path: '/admin', redirect: '/admin/login' },
    { path: '/admin/stall', component: () => import('./views/AdminShell.vue'), meta: { role: 'stall_admin' } },
    { path: '/admin/super', component: () => import('./views/AdminShell.vue'), meta: { role: 'super_admin' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

// UX guard only; every permission is enforced by the API.
router.beforeEach(async (to) => {
  if (!to.path.startsWith('/admin')) return true;
  const account = await ensureSession().catch(() => null);
  if (to.path === '/admin/login') return account ? adminHome(account) : true;
  if (!account) return '/admin/login';
  if (to.meta.role && to.meta.role !== account.role) return adminHome(account);
  return true;
});
