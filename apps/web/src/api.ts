import { ref } from 'vue';
import type { AccountResponse, ApiError, SessionResponse } from '@elay/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.error.message ?? 'ارتباط با سرور برقرار نشد.');
  }
}

let csrfToken: string | null = null;

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(0, null);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Expired or revoked session: forget it so the router guard sends the admin back to login.
    if (res.status === 401 && path !== '/api/auth/login') apply(null);
    throw new ApiRequestError(res.status, data as ApiError | null);
  }
  return data as T;
}

// ---------- admin session ----------

export const account = ref<AccountResponse | null>(null);
let loaded = false;

function apply(s: SessionResponse | null) {
  account.value = s?.account ?? null;
  csrfToken = s?.csrfToken ?? null;
  loaded = true;
}

/** Loads the current session once (cookie is HttpOnly; the CSRF token comes from /me). */
export async function ensureSession(): Promise<AccountResponse | null> {
  if (loaded) return account.value;
  try {
    apply(await api<SessionResponse>('/api/auth/me'));
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) apply(null);
    else throw e;
  }
  return account.value;
}

export async function login(username: string, password: string) {
  apply(await api<SessionResponse>('/api/auth/login', { method: 'POST', body: { username, password } }));
  return account.value!;
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    apply(null);
  }
}

export const adminHome = (a: AccountResponse) => (a.role === 'super_admin' ? '/admin/super' : '/admin/stall');
