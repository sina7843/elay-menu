import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt from Node's OpenSSL-backed crypto module (memory-hard KDF; no native addon needed).
// Format: scrypt$<N>$<r>$<p>$<salt b64>$<hash b64> so parameters can be raised later without breaking old hashes.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFC'), salt, KEYLEN, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const [cost, block, par] = [Number(n), Number(r), Number(p)];
  // Bound parameters read from storage so a corrupted record cannot trigger huge memory/CPU use.
  if (!(cost >= 2 ** 14 && cost <= 2 ** 17 && block >= 8 && block <= 16 && par >= 1 && par <= 4)) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), cost, block, par).catch(() => null);
  return key !== null && key.length === expected.length && timingSafeEqual(key, expected);
}

/** Used to spend equal time when the username does not exist. */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Random temporary password satisfying the policy (letters + digits, 12 chars). Shown once, never logged. */
export function generateTemporaryPassword(): string {
  for (;;) {
    let out = '';
    for (let i = 0; i < 12; i++) out += ALPHABET[randomInt(ALPHABET.length)];
    if (/[a-zA-Z]/.test(out) && /\d/.test(out)) return out;
  }
}
