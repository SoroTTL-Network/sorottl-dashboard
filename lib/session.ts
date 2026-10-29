const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours (1 day)

export interface SessionPayload {
  sessionId: string; // Unique cryptographic identifier for revocation tracking
  issuedAt: number; // Unix timestamp in seconds
  expiresAt: number; // Unix timestamp in seconds
}

// In-memory revocation set for revoked sessionId strings
// Maps sessionId -> expiresAt timestamp so expired entries can be pruned
const revokedSessions = new Map<string, number>();
const MAX_REVOKED_ENTRIES = 10000;

/**
 * Base64url encode a buffer or string in an Edge-safe manner.
 */
function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64url decode to Uint8Array in an Edge-safe manner.
 */
function fromBase64Url(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Constant-time comparison between two Uint8Arrays to prevent timing attacks.
 */
export function timingSafeArrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Generates an HMAC-SHA256 signature using the standard Web Crypto API.
 */
async function createHmacSha256(data: string, secret: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(signature);
}

/**
 * Generates a random session ID using Web Crypto.
 */
function generateRandomSessionId(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  return toBase64Url(randomBytes);
}

/**
 * Signs and packages a new visitor session token.
 * Token format: `<base64url(JSON-payload)>.<base64url(HMAC-SHA256)>`
 */
export async function createSessionToken(
  secret: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sessionId: generateRandomSessionId(),
    issuedAt: now,
    expiresAt: now + maxAgeSeconds,
  };

  const enc = new TextEncoder();
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = toBase64Url(enc.encode(payloadJson));
  const sigBytes = await createHmacSha256(payloadBase64, secret);
  const signatureBase64 = toBase64Url(sigBytes);

  return `${payloadBase64}.${signatureBase64}`;
}

/**
 * Extracts and decodes the session payload if token format is valid.
 */
export function parseSessionPayload(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  try {
    const payloadBytes = fromBase64Url(parts[0]);
    const jsonStr = new TextDecoder().decode(payloadBytes);
    return JSON.parse(jsonStr) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Explicitly revokes a session ID on the server side so subsequent requests with this token are rejected.
 */
export function revokeSession(token: string | undefined | null): void {
  const payload = parseSessionPayload(token);
  if (!payload || !payload.sessionId || !payload.expiresAt) {
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // Housekeeping: clean expired revocations if map grows too large
  if (revokedSessions.size > MAX_REVOKED_ENTRIES) {
    for (const [id, expires] of revokedSessions.entries()) {
      if (now > expires) {
        revokedSessions.delete(id);
      }
    }
  }

  revokedSessions.set(payload.sessionId, payload.expiresAt);
}

/**
 * Checks whether a session ID is currently marked as revoked.
 */
export function isSessionRevoked(sessionId: string): boolean {
  return revokedSessions.has(sessionId);
}

/**
 * Testing helper: clears in-memory revocation list.
 */
export function resetRevocationList(): void {
  revokedSessions.clear();
}

/**
 * Verifies a visitor session token:
 * - Checks token format
 * - Constant-time compares cryptographic HMAC signature
 * - Checks expiration time against current time
 * - Verifies the token has not been server-side revoked
 *
 * Returns true if valid and not expired, false otherwise.
 */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
): Promise<boolean> {
  if (!token || typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payloadBase64, providedSigBase64] = parts;
  if (!payloadBase64 || !providedSigBase64) {
    return false;
  }

  try {
    const providedSigBytes = fromBase64Url(providedSigBase64);
    const expectedSigBytes = await createHmacSha256(payloadBase64, secret);

    // Constant-time timing-safe comparison to prevent timing attacks
    if (!timingSafeArrayEqual(providedSigBytes, expectedSigBytes)) {
      return false;
    }

    // Parse and validate payload
    const payloadBytes = fromBase64Url(payloadBase64);
    const jsonStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(jsonStr) as Partial<SessionPayload>;

    if (
      typeof payload.sessionId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      typeof payload.issuedAt !== "number"
    ) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    // Token is valid only if current time does not exceed expiresAt
    if (now > payload.expiresAt) {
      return false;
    }

    // Protection against tokens issued unrealistically far in the future
    if (payload.issuedAt > now + 60) {
      return false;
    }

    // Check server-side revocation list
    if (isSessionRevoked(payload.sessionId)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
