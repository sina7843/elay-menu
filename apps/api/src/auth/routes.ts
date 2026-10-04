import type { FastifyInstance, FastifyReply } from 'fastify';
import { ChangePasswordInputSchema, LoginInputSchema, type SessionResponse } from '@elay/shared';
import { AppError, parse } from '../errors.js';
import { requireAccount } from './guards.js';
import { DUMMY_HASH, verifyPassword } from './password.js';
import { SESSION_COOKIE, createSession, revokeSession, setPassword, toAccountResponse } from './sessions.js';

export async function authRoutes(app: FastifyInstance) {
  const { c, config } = app.ctx;
  const cookieOptions = {
    path: '/api',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.COOKIE_SECURE,
  };
  const clearCookie = (reply: FastifyReply) => reply.clearCookie(SESSION_COOKIE, cookieOptions);

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: config.LOGIN_RATE_LIMIT_PER_15M,
          timeWindow: '15 minutes',
          // Keyed per IP + username so staff sharing the food court's NAT/Wi-Fi do not lock each other out.
          // ponytail: no global per-username cap across IPs; add a Mongo failure counter if distributed guessing shows up.
          hook: 'preHandler',
          keyGenerator: (req) => {
            const u = (req.body as { username?: unknown } | undefined)?.username;
            return `${req.ip}|${typeof u === 'string' ? u.trim().toLowerCase().slice(0, 64) : ''}`;
          },
        },
      },
    },
    async (req, reply) => {
      const input = parse(LoginInputSchema, req.body);
      const account = await c.accounts.findOne({ username: input.username });
      // Always run one hash verification so response time does not reveal whether the username exists.
      const ok = await verifyPassword(input.password, account?.passwordHash ?? DUMMY_HASH);
      if (!account || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'نام کاربری یا رمز درست نیست.');

      const { token, session } = await createSession(c, account._id, config.SESSION_TTL_HOURS);
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, expires: session.expiresAt });
      return { account: toAccountResponse(account), csrfToken: session.csrfToken } satisfies SessionResponse;
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const { session } = await requireAccount(req);
    await revokeSession(c, session._id);
    clearCookie(reply);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (req) => {
    const { account, session } = await requireAccount(req);
    return { account: toAccountResponse(account), csrfToken: session.csrfToken } satisfies SessionResponse;
  });

  app.post(
    '/api/auth/change-password',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { account, session } = await requireAccount(req);
      const input = parse(ChangePasswordInputSchema, req.body);
      if (!(await verifyPassword(input.currentPassword, account.passwordHash))) {
        throw new AppError(400, 'VALIDATION_ERROR', 'رمز فعلی درست نیست.', [
          { path: 'currentPassword', message: 'رمز فعلی درست نیست.' },
        ]);
      }
      if (input.newPassword === input.currentPassword) {
        throw new AppError(400, 'VALIDATION_ERROR', 'رمز تازه باید با رمز فعلی فرق داشته باشد.', [
          { path: 'newPassword', message: 'رمز تازه باید با رمز فعلی فرق داشته باشد.' },
        ]);
      }
      // Other devices are signed out; this session stays.
      await setPassword(c, account._id, input.newPassword, session._id);
      return reply.status(204).send();
    },
  );
}
