import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Role } from '@elay/shared';
import type { AccountDoc, SessionDoc } from '../db.js';
import { AppError, forbidden, unauthenticated } from '../errors.js';
import { SESSION_COOKIE, findSession } from './sessions.js';

export interface Auth {
  account: AccountDoc;
  session: SessionDoc;
}

declare module 'fastify' {
  interface FastifyRequest {
    authCache?: Promise<Auth | null>;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Requires a valid session. For state-changing methods also requires the per-session CSRF token
 * in the `x-csrf-token` header (in addition to SameSite=Strict cookies and the Origin check).
 */
export async function requireAccount(req: FastifyRequest): Promise<Auth> {
  req.authCache ??= findSession(req.server.ctx.c, req.cookies[SESSION_COOKIE]);
  const auth = await req.authCache;
  if (!auth) throw unauthenticated();
  if (!SAFE_METHODS.has(req.method)) {
    const header = req.headers['x-csrf-token'];
    if (typeof header !== 'string' || !sameToken(header, auth.session.csrfToken)) {
      throw new AppError(403, 'CSRF_FAILED', 'نشست نامعتبر است. صفحه را دوباره باز کنید.');
    }
  }
  return auth;
}

export async function requireRole(req: FastifyRequest, role: Role): Promise<Auth> {
  const auth = await requireAccount(req);
  if (auth.account.role !== role) throw forbidden();
  return auth;
}

/**
 * Ownership guard for anything scoped to a stall. Super admins may access every stall;
 * a stall admin only the stall bound to their account on the server. Client-supplied
 * ownership is never trusted, and the check runs before any existence lookup.
 */
export async function requireStallAccess(req: FastifyRequest, stallId: string): Promise<Auth> {
  const auth = await requireAccount(req);
  if (auth.account.role === 'super_admin') return auth;
  if (auth.account.role === 'stall_admin' && auth.account.stallId?.toHexString() === stallId) return auth;
  throw forbidden();
}

/**
 * Rejects cross-site state-changing requests: a present Origin must match the request host,
 * and browsers' Sec-Fetch-Site must not be cross-site.
 */
export function checkOrigin(req: FastifyRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      /* "null" or malformed */
    }
    if (host === null || host !== req.host) throw new AppError(403, 'CSRF_FAILED', 'درخواست از مبدا نامعتبر است.');
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    throw new AppError(403, 'CSRF_FAILED', 'درخواست از مبدا نامعتبر است.');
  }
}
