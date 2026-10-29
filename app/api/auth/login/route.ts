import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { createSessionToken } from "@/lib/session";
import {
  safePasswordCompare,
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
} from "@/lib/auth-security";

const ACCESS_COOKIE_NAME = "sorottl_access_token";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours (1 day)

/**
 * Resolves client identifier for rate limiting:
 * - If trustProxy is enabled in serverConfig, inspects x-real-ip or leftmost x-forwarded-for entry.
 * - If trustProxy is disabled (default), ignores client-supplied headers to prevent spoofing bypasses
 *   and falls back to 'default-client' bucket (or remote IP when provided by node/socket).
 */
function getClientIdentifier(request: NextRequest, trustProxy: boolean): string {
  if (trustProxy) {
    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
      return realIp.trim();
    }
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }
  }

  // When not behind a verified proxy or headers are untrusted, use a shared bound client bucket
  return "untrusted-client-bucket";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let serverConfig;
  try {
    serverConfig = getServerConfig();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }

  if (serverConfig.accessMode !== "private") {
    return NextResponse.json(
      { success: true, message: "Dashboard is in public mode; authentication not required." },
      { status: 200, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }

  // Enforce payload size limit BEFORE reading or parsing the full payload
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 4096) {
    return NextResponse.json(
      { success: false, error: "Request payload too large" },
      { status: 413, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }

  const clientId = getClientIdentifier(request, serverConfig.trustProxy);

  // Check rate limit
  const rateLimit = checkRateLimit(clientId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many authentication attempts. Please retry after ${rateLimit.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  // Parse request safely with stream/text size check
  let body: { password?: unknown };
  try {
    const rawText = await request.text();
    if (rawText.length > 4096) {
      return NextResponse.json(
        { success: false, error: "Request payload too large" },
        { status: 413, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
      );
    }
    body = JSON.parse(rawText);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request payload" },
      { status: 400, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }

  const { password } = body;
  const isStringPassword = typeof password === "string";

  const isPasswordValid =
    isStringPassword &&
    !!serverConfig.accessPassword &&
    (await safePasswordCompare(password, serverConfig.accessPassword));

  if (!isPasswordValid || !serverConfig.accessPassword) {
    recordFailedAttempt(clientId);
    return NextResponse.json(
      { success: false, error: "Invalid operator credentials" },
      { status: 401, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }

  // Success: reset rate limit attempts
  recordSuccessfulAttempt(clientId);

  // Generate cryptographically signed HMAC-SHA256 session token using the independent session secret
  const sessionToken = await createSessionToken(
    serverConfig.sessionSecret,
    SESSION_MAX_AGE_SECONDS,
  );

  const response = NextResponse.json(
    { success: true, message: "Authentication successful" },
    { status: 200, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );

  // Set secure HTTP-only session cookie
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: serverConfig.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { success: false, error: "Method GET is not allowed on /api/auth/login" },
    { status: 405, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
