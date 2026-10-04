import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { AccountResponse } from '@elay/shared';
import type { AccountDoc, Collections, SessionDoc } from '../db.js';
import { generateTemporaryPassword, hashPassword } from './password.js';

export const SESSION_COOKIE = 'elay_sid';

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(c: Collections, accountId: ObjectId, ttlHours: number) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const session: SessionDoc = {
    _id: new ObjectId(),
    tokenHash: sha256(token),
    accountId,
    csrfToken: randomBytes(24).toString('base64url'),
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlHours * 3600_000),
  };
  await c.sessions.insertOne(session);
  return { token, session };
}

/** Resolves a cookie token to a live session and its (still existing) account. */
export async function findSession(c: Collections, token: string | undefined) {
  if (!token || token.length > 100) return null;
  const session = await c.sessions.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const account = await c.accounts.findOne({ _id: session.accountId });
  if (!account) {
    await c.sessions.deleteOne({ _id: session._id });
    return null;
  }
  return { session, account };
}

export const revokeSession = (c: Collections, sessionId: ObjectId) => c.sessions.deleteOne({ _id: sessionId });

/** Invalidates every session of an account, optionally keeping the caller's current one. */
export const revokeAccountSessions = (c: Collections, accountId: ObjectId, keepSessionId?: ObjectId) =>
  c.sessions.deleteMany(keepSessionId ? { accountId, _id: { $ne: keepSessionId } } : { accountId });

export async function setPassword(c: Collections, accountId: ObjectId, password: string, keepSessionId?: ObjectId) {
  await c.accounts.updateOne(
    { _id: accountId },
    { $set: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() } },
  );
  await revokeAccountSessions(c, accountId, keepSessionId);
}

/**
 * Replaces the password with a fresh random one and revokes all sessions.
 * The returned value must be shown exactly once to the super admin and never logged.
 */
export async function resetToTemporaryPassword(c: Collections, accountId: ObjectId): Promise<string> {
  const temporary = generateTemporaryPassword();
  await setPassword(c, accountId, temporary);
  return temporary;
}

/** Deletes an account and all of its sessions. */
export async function deleteAccount(c: Collections, accountId: ObjectId) {
  await revokeAccountSessions(c, accountId);
  await c.accounts.deleteOne({ _id: accountId });
}

export const toAccountResponse = (a: AccountDoc): AccountResponse => ({
  id: a._id.toHexString(),
  username: a.username,
  role: a.role,
  stallId: a.stallId ? a.stallId.toHexString() : null,
});
