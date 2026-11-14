const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(request: Request, username: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const ip = forwarded || request.headers.get('x-real-ip')?.trim() || 'local';
  return `${ip}|${username.trim().toLowerCase()}`;
}

/** Returns true when the attempt is still allowed. */
export function allowLoginAttempt(request: Request, username: string): boolean {
  const now = Date.now();
  const key = clientKey(request, username);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= MAX_ATTEMPTS;
}

export function clearLoginAttempts(request: Request, username: string): void {
  buckets.delete(clientKey(request, username));
}
