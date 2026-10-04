import { createRouter, createWebHistory } from 'vue-router';
import type { Role } from '@elay/shared';
import { adminHome, ensureSession } from './api';

declare module 'vue-router' {
  interface RouteMeta {
    role?: Role;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/CustomerHome.vue') },
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
