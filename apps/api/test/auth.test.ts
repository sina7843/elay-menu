import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorSchema, NewPasswordSchema } from '@elay/shared';
import type { ObjectId } from 'mongodb';
import { collections } from '../src/db.js';
import { resetToTemporaryPassword, deleteAccount } from '../src/auth/sessions.js';
import { authed, createAccount, createStall, login, setup, type TestEnv } from './helpers.js';

let t: TestEnv;
let stallA: ObjectId;
let stallB: ObjectId;

beforeAll(async () => {
  t = await setup({ LOGIN_RATE_LIMIT_PER_15M: '1000' }); // limit itself is covered in rate-limit-seed.test.ts
  stallA = await createStall(t.db, 'A');
  stallB = await createStall(t.db, 'B');
  await createAccount(t.db, 'root', 'rootpass1', 'super_admin');
  await createAccount(t.db, 'alpha', 'alphapass1', 'stall_admin', stallA);
  await createAccount(t.db, 'beta', 'betapass1', 'stall_admin', stallB);
});
afterAll(() => t?.close());

const expectError = (res: { statusCode: number; json: () => unknown }, status: number, code: string) => {
  expect(res.statusCode).toBe(status);
  const body = ApiErrorSchema.parse(res.json());
  expect(body.error.code).toBe(code);
};

describe('health', () => {
  it('live and ready report ok with a reachable DB', async () => {
    expect((await t.app.inject('/health/live')).json()).toEqual({ status: 'ok' });
    const ready = await t.app.inject('/health/ready');
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready', db: 'ok' });
  });
});

describe('login / me / logout', () => {
  it('rejects wrong password and unknown user identically', async () => {
    for (const payload of [{ username: 'alpha', password: 'nope' }, { username: 'ghost', password: 'nope' }]) {
      expectError(await t.app.inject({ method: 'POST', url: '/api/auth/login', payload }), 401, 'INVALID_CREDENTIALS');
    }
  });

  it('rejects malformed bodies with field details', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'alpha', extra: 1 } });
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('sets a hardened cookie, never returns password hashes, and logout invalidates the session', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'ALPHA', password: 'alphapass1' } });
    expect(res.statusCode).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\/api/);
    expect(res.body).not.toContain('passwordHash');
    expect(res.json().account).toEqual({ id: expect.any(String), username: 'alpha', role: 'stall_admin', stallId: stallA.toHexString() });

    const s = { cookie: cookie.split(';')[0]!, csrf: res.json().csrfToken };
    const me = await t.app.inject({ url: '/api/auth/me', headers: authed(s) });
    expect(me.statusCode).toBe(200);
    expect(me.body).not.toContain('passwordHash');

    expectError(await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: authed(s, false) }), 403, 'CSRF_FAILED');
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: authed(s) })).statusCode).toBe(204);
    expectError(await t.app.inject({ url: '/api/auth/me', headers: authed(s) }), 401, 'UNAUTHENTICATED');
  });

  it('accepts Persian or Arabic-Indic digits for ASCII digits in passwords (Rokh FaNum shows them as Persian)', async () => {
    await createAccount(t.db, 'digits', 'abc12345x', 'super_admin');
    for (const password of ['abc12345x', 'abc۱۲۳۴۵x', 'abc١٢٣٤٥x']) await login(t.app, 'digits', password);
    await expect(login(t.app, 'digits', 'abc12346x')).rejects.toThrow();
  });

  it('rejects unauthenticated and forged-cookie requests', async () => {
    expectError(await t.app.inject('/api/auth/me'), 401, 'UNAUTHENTICATED');
    expectError(await t.app.inject({ url: '/api/auth/me', headers: { cookie: 'elay_sid=forged' } }), 401, 'UNAUTHENTICATED');
  });

  it('rejects cross-origin state-changing requests', async () => {
    const res = await t.app.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'alpha', password: 'alphapass1' },
      headers: { origin: 'https://evil.example', host: 'menu.example' },
    });
    expectError(res, 403, 'CSRF_FAILED');
    const sameOrigin = await t.app.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'alpha', password: 'alphapass1' },
      headers: { origin: 'https://menu.example', host: 'menu.example' },
    });
    expect(sameOrigin.statusCode).toBe(200);
    const crossSite = await t.app.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'alpha', password: 'alphapass1' },
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expectError(crossSite, 403, 'CSRF_FAILED');
  });
});

describe('roles and stall ownership', () => {
  it('super-admin-only endpoint rejects anonymous and stall admins', async () => {
    expectError(await t.app.inject('/api/admin/foodcourt'), 401, 'UNAUTHENTICATED');
    const alpha = await login(t.app, 'alpha', 'alphapass1');
    expectError(await t.app.inject({ url: '/api/admin/foodcourt', headers: authed(alpha) }), 403, 'FORBIDDEN');
    const root = await login(t.app, 'root', 'rootpass1');
    const ok = await t.app.inject({ url: '/api/admin/foodcourt', headers: authed(root) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().publicMenuUrl).toBeNull(); // unconfigured, never invented
  });

  it('stall admin can only reach their own stall; super admin reaches all', async () => {
    const alpha = await login(t.app, 'alpha', 'alphapass1');
    const own = await t.app.inject({ url: `/api/admin/stalls/${stallA}`, headers: authed(alpha) });
    expect(own.statusCode).toBe(200);
    expect(own.json().id).toBe(stallA.toHexString());
    expectError(await t.app.inject({ url: `/api/admin/stalls/${stallB}`, headers: authed(alpha) }), 403, 'FORBIDDEN');
    // Non-existent stall: still 403 for a stall admin (no existence oracle).
    expectError(await t.app.inject({ url: `/api/admin/stalls/${'f'.repeat(24)}`, headers: authed(alpha) }), 403, 'FORBIDDEN');
    expectError(await t.app.inject(`/api/admin/stalls/${stallA}`), 401, 'UNAUTHENTICATED');

    const root = await login(t.app, 'root', 'rootpass1');
    for (const id of [stallA, stallB]) {
      expect((await t.app.inject({ url: `/api/admin/stalls/${id}`, headers: authed(root) })).statusCode).toBe(200);
    }
    expectError(await t.app.inject({ url: `/api/admin/stalls/${'f'.repeat(24)}`, headers: authed(root) }), 404, 'NOT_FOUND');
    expectError(await t.app.inject({ url: '/api/admin/stalls/not-an-id', headers: authed(root) }), 400, 'VALIDATION_ERROR');
  });
});

describe('passwords and session invalidation', () => {
  it('change-password validates, keeps the current session and revokes others', async () => {
    await createAccount(t.db, 'gamma', 'gammapass1', 'stall_admin', await createStall(t.db, 'C'));
    const here = await login(t.app, 'gamma', 'gammapass1');
    const elsewhere = await login(t.app, 'gamma', 'gammapass1');
    const change = (payload: object, s = here) =>
      t.app.inject({ method: 'POST', url: '/api/auth/change-password', headers: authed(s), payload });

    expectError(await change({ currentPassword: 'wrong', newPassword: 'newpass12', confirmPassword: 'newpass12' }), 400, 'VALIDATION_ERROR');
    expectError(await change({ currentPassword: 'gammapass1', newPassword: 'newpass12', confirmPassword: 'newpass13' }), 400, 'VALIDATION_ERROR');
    expectError(await change({ currentPassword: 'gammapass1', newPassword: 'short1', confirmPassword: 'short1' }), 400, 'VALIDATION_ERROR');
    expect((await change({ currentPassword: 'gammapass1', newPassword: 'newpass12', confirmPassword: 'newpass12' })).statusCode).toBe(204);

    expect((await t.app.inject({ url: '/api/auth/me', headers: authed(here) })).statusCode).toBe(200);
    expect((await t.app.inject({ url: '/api/auth/me', headers: authed(elsewhere) })).statusCode).toBe(401);
    await expect(login(t.app, 'gamma', 'gammapass1')).rejects.toThrow();
    await login(t.app, 'gamma', 'newpass12');
  });

  it('temporary password reset invalidates the old password and every session', async () => {
    const id = await createAccount(t.db, 'delta', 'deltapass1', 'stall_admin', await createStall(t.db, 'D'));
    const s = await login(t.app, 'delta', 'deltapass1');
    const temp = await resetToTemporaryPassword(collections(t.db), id);
    expect(NewPasswordSchema.safeParse(temp).success).toBe(true);
    expect((await t.app.inject({ url: '/api/auth/me', headers: authed(s) })).statusCode).toBe(401);
    await expect(login(t.app, 'delta', 'deltapass1')).rejects.toThrow();
    await login(t.app, 'delta', temp);
  });

  it('deleting an account revokes its sessions', async () => {
    const id = await createAccount(t.db, 'eps', 'epspass12', 'stall_admin', await createStall(t.db, 'E'));
    const s = await login(t.app, 'eps', 'epspass12');
    await deleteAccount(collections(t.db), id);
    expect((await t.app.inject({ url: '/api/auth/me', headers: authed(s) })).statusCode).toBe(401);
    expect(await collections(t.db).sessions.countDocuments({ accountId: id })).toBe(0);
  });
});

describe('review hardening', () => {
  it('rejects expired sessions', async () => {
    const s = await login(t.app, 'beta', 'betapass1');
    await collections(t.db).sessions.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expectError(await t.app.inject({ url: '/api/auth/me', headers: authed(s) }), 401, 'UNAUTHENTICATED');
  });

  it('change-password needs the right CSRF token and a different password', async () => {
    const s = await login(t.app, 'beta', 'betapass1');
    const payload = { currentPassword: 'betapass1', newPassword: 'betapass1', confirmPassword: 'betapass1' };
    const res = await t.app.inject({
      method: 'POST', url: '/api/auth/change-password', payload, headers: { cookie: s.cookie, 'x-csrf-token': 'wrong' },
    });
    expectError(res, 403, 'CSRF_FAILED');
    expectError(await t.app.inject({ method: 'POST', url: '/api/auth/change-password', payload, headers: authed(s) }), 400, 'VALIDATION_ERROR');
  });

  it('malformed JSON and stored hashes fail safely', async () => {
    const bad = await t.app.inject({
      method: 'POST', url: '/api/auth/login', payload: '{"username":', headers: { 'content-type': 'application/json' },
    });
    expectError(bad, 400, 'VALIDATION_ERROR');
    const { verifyPassword } = await import('../src/auth/password.js');
    expect(await verifyPassword('x', 'scrypt$1073741824$8$1$AAAA$AAAA')).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('stall admin bound to a deleted stall gets no access', async () => {
    const orphanStall = await createStall(t.db, 'Gone');
    await createAccount(t.db, 'orphan', 'orphanpass1', 'stall_admin', orphanStall);
    const s = await login(t.app, 'orphan', 'orphanpass1');
    await collections(t.db).stalls.deleteOne({ _id: orphanStall });
    expectError(await t.app.inject({ url: `/api/admin/stalls/${orphanStall}`, headers: authed(s) }), 404, 'NOT_FOUND');
    expectError(await t.app.inject({ url: `/api/admin/stalls/${stallA}`, headers: authed(s) }), 403, 'FORBIDDEN');
  });
});

describe('origin check behind the proxy (TRUST_PROXY=true, as in compose)', () => {
  it('uses X-Forwarded-Host set by nginx', async () => {
    const p = await setup({ TRUST_PROXY: 'true', LOGIN_RATE_LIMIT_PER_15M: '100' });
    try {
      const payload = { username: 'nobody', password: 'x' };
      const same = await p.app.inject({
        method: 'POST', url: '/api/auth/login', payload,
        headers: { host: 'api:3000', 'x-forwarded-host': 'menu.example', origin: 'https://menu.example' },
      });
      expect(same.statusCode).toBe(401); // passed origin check, failed credentials
      const cross = await p.app.inject({
        method: 'POST', url: '/api/auth/login', payload,
        headers: { host: 'api:3000', 'x-forwarded-host': 'menu.example', origin: 'https://evil.example' },
      });
      expectError(cross, 403, 'CSRF_FAILED');
    } finally {
      await p.close();
    }
  });
});

describe('configured public menu URL', () => {
  it('is returned read-only exactly as deployed and cannot be changed through the API', async () => {
    const p = await setup({ PUBLIC_MENU_URL: 'https://menu.example.com/' });
    try {
      await createAccount(p.db, 'root', 'rootpass1', 'super_admin');
      const s = await login(p.app, 'root', 'rootpass1');
      const res = await p.app.inject({ url: '/api/admin/foodcourt', headers: authed(s) });
      expect(res.json().publicMenuUrl).toBe('https://menu.example.com/');
      const put = await p.app.inject({
        method: 'PUT', url: '/api/admin/foodcourt', headers: authed(s),
        payload: { name: 'x', logo: null, menuOpen: true, closedMessage: '', publicMenuUrl: 'https://evil.example/' },
      });
      expectError(put, 400, 'VALIDATION_ERROR');
      expect((await p.app.inject({ url: '/api/admin/foodcourt', headers: authed(s) })).json().publicMenuUrl).toBe('https://menu.example.com/');
    } finally {
      await p.close();
    }
  });
});

describe('media', () => {
  it('rejects traversal and unknown names', async () => {
    expect((await t.app.inject('/api/media/..%2F..%2Fetc%2Fpasswd')).statusCode).toBe(404);
    expect((await t.app.inject('/api/media/missing.png')).statusCode).toBe(404);
  });
});
