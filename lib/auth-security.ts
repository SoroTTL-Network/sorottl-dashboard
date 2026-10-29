import { timingSafeArrayEqual } from "./session";

interface RateLimitRecord {
  attempts: number;
  firstAttemptTime: number;
  blockedUntil: number;
}

// In-memory rate limiting state
const attemptRecords = new Map<string, RateLimitRecord>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute window
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minute lockout after MAX_ATTEMPTS
const MAX_TRACKED_ENTRIES = 5000; // Memory bounding to avoid DoS memory leak

/**
 * Constant-time safe string equality check using Web Crypto SHA-256 digests.
 * Hashing both values to 32-byte fixed buffers avoids leaking password length through buffer length comparison.
 */
export async function safePasswordCompare(provided: string, expected: string): Promise<boolean> {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }

  const enc = new TextEncoder();
  const hashProvided = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(provided)));
  const hashExpected = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(expected)));

  return timingSafeArrayEqual(hashProvided, hashExpected);
}

/**
 * Checks and registers an authentication attempt for a given client identifier.
 * Returns:
 * - allowed: boolean
 * - retryAfterSeconds: number (0 if allowed)
 */
export function checkRateLimit(clientId: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();

  // Housekeeping: purge entries if map gets oversized
  if (attemptRecords.size > MAX_TRACKED_ENTRIES) {
    for (const [key, record] of attemptRecords.entries()) {
      if (now > record.blockedUntil && now - record.firstAttemptTime > WINDOW_MS) {
        attemptRecords.delete(key);
      }
    }
  }

  const record = attemptRecords.get(clientId);

  if (!record) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // If currently locked out
  if (now < record.blockedUntil) {
    const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  // If window has expired and not locked out, reset
  if (now - record.firstAttemptTime > WINDOW_MS) {
    attemptRecords.delete(clientId);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // If within window and attempts exceeded limit
  if (record.attempts >= MAX_ATTEMPTS) {
    record.blockedUntil = now + LOCKOUT_MS;
    const retryAfter = Math.ceil(LOCKOUT_MS / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Records a failed attempt for the given client identifier.
 */
export function recordFailedAttempt(clientId: string): void {
  const now = Date.now();
  const record = attemptRecords.get(clientId);

  if (!record || now - record.firstAttemptTime > WINDOW_MS) {
    attemptRecords.set(clientId, {
      attempts: 1,
      firstAttemptTime: now,
      blockedUntil: 0,
    });
    return;
  }

  record.attempts += 1;
  if (record.attempts >= MAX_ATTEMPTS) {
    record.blockedUntil = now + LOCKOUT_MS;
  }
}

/**
 * Clears rate limiting on successful login.
 */
export function recordSuccessfulAttempt(clientId: string): void {
  attemptRecords.delete(clientId);
}

/**
 * Testing helper: clears all in-memory rate limit records.
 */
export function resetRateLimits(): void {
  attemptRecords.clear();
}
