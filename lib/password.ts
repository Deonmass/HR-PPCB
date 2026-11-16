import 'server-only';

import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const PREFIX = 'scrypt';

export function isHashedPassword(value: string): boolean {
  const parts = String(value || '').split('$');
  return parts.length === 3 && parts[0] === PREFIX && Boolean(parts[1]) && Boolean(parts[2]);
}

function safeEqualStrings(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${PREFIX}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const storedValue = String(stored || '');
  if (!storedValue) return false;
  if (!isHashedPassword(storedValue)) {
    return safeEqualStrings(password, storedValue);
  }
  try {
    const [, salt, expected] = storedValue.split('$');
    if (!salt || !expected) return false;
    const actual = (await scryptAsync(password, salt, 32)) as Buffer;
    const expectedBuf = Buffer.from(expected, 'base64url');
    if (actual.length !== expectedBuf.length) return false;
    return timingSafeEqual(actual, expectedBuf);
  } catch {
    return false;
  }
}
