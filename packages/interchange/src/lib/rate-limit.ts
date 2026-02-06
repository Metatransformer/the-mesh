const buckets = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export function checkRateLimit(participantId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(participantId);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(participantId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= MAX_REQUESTS;
}
