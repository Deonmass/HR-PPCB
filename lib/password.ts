import 'server-only';

import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const PREFIX = 'scrypt';

export function isHashedPassword(value: string): boolean {
  const [scheme, salt, hash] = String(value || '').split('$');
  return scheme === PREFIX && Boolean(salt) && Boolean(hash);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${PREFIX}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !isHashedPassword(stored)) return false;
  const [, salt, expected] = stored.split('$');
  if (!salt || !expected) return false;
  const actual = (await scryptAsync(password, salt, 32)) as Buffer;
  const expectedBuf = Buffer.from(expected, 'base64url');
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}
