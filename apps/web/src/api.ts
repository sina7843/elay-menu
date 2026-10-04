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

/** Called when the server says the session is gone (expired, revoked, password reset by the super admin). */
let onSessionLost: () => void = () => undefined;
export const setSessionLostHandler = (fn: () => void) => (onSessionLost = fn);

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; raw?: Blob; type?: string } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init.raw) headers['content-type'] = init.type ?? init.raw.type;
  else if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });
  } catch {
    throw new ApiRequestError(0, null);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Expired or revoked session: forget it so the router guard sends the admin back to login.
    if (res.status === 401 && path !== '/api/auth/login' && account.value) {
      apply(null);
      onSessionLost();
    }
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

/** Clears the local session only once the server session is gone (204, or already 401). */
export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    if (!(e instanceof ApiRequestError && e.status === 401)) throw e;
  }
  apply(null);
}

export const adminHome = (a: AccountResponse) => (a.role === 'super_admin' ? '/admin/super' : '/admin/stall');
