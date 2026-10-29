import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getServerConfig } from "../../lib/config";
import { middleware } from "../../middleware";
import { NextRequest } from "next/server";
import { GET as readinessGET } from "../../app/api/health/ready/route";
import { POST as loginPOST, GET as loginGET } from "../../app/api/auth/login/route";
import { POST as logoutPOST, GET as logoutGET } from "../../app/api/auth/logout/route";
import {
  createSessionToken,
  verifySessionToken,
  revokeSession,
  resetRevocationList,
} from "../../lib/session";
import { resetRateLimits } from "../../lib/auth-security";

describe("Production Environment Validation & Visitor Access Control", () => {
  const originalEnv = process.env;
  const validProductionSecret = "production-session-signing-key-32-chars-long";

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetRateLimits();
    resetRevocationList();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetRateLimits();
    resetRevocationList();
    vi.restoreAllMocks();
  });

  describe("Environment Validation & SSRF URL Defense", () => {
    it("validates default configuration safely in development with public access mode", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      delete process.env.SOROTTL_BACKEND_URL;
      delete process.env.SOROTTL_BACKEND_AUTH_TOKEN;
      delete process.env.SOROTTL_ACCESS_MODE;
      delete process.env.SOROTTL_ACCESS_PASSWORD;
      delete process.env.SOROTTL_SESSION_SECRET;

      const config = getServerConfig();
      expect(config.backendUrl).toBe("http://127.0.0.1:8080");
      expect(config.accessMode).toBe("public");
    });

    it("fails closed in production if SOROTTL_ACCESS_MODE is omitted", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.SOROTTL_ACCESS_MODE;
      delete process.env.SOROTTL_ACCESS_PASSWORD;
      delete process.env.SOROTTL_SESSION_SECRET;

      expect(() => getServerConfig()).toThrow(
        "SOROTTL_ACCESS_MODE must be explicitly defined as 'public' or 'private' in production",
      );
    });

    it("rejects invalid SOROTTL_ACCESS_MODE without silent fallback to public", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      process.env.SOROTTL_ACCESS_MODE = "open";

      expect(() => getServerConfig()).toThrow(
        "SOROTTL_ACCESS_MODE must be either 'public' or 'private'",
      );
    });

    it("accepts explicit public mode in production without requiring session secret", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.SOROTTL_ACCESS_MODE = "public";

      const config = getServerConfig();
      expect(config.accessMode).toBe("public");
    });

    it("requires SOROTTL_SESSION_SECRET (min 32 chars) in private production mode", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";
      delete process.env.SOROTTL_SESSION_SECRET;

      expect(() => getServerConfig()).toThrow(
        "SOROTTL_SESSION_SECRET (minimum 32 characters) is strictly required",
      );

      // Too short
      process.env.SOROTTL_SESSION_SECRET = "too-short-secret";
      expect(() => getServerConfig()).toThrow(
        "SOROTTL_SESSION_SECRET must be at least 32 characters long",
      );
    });

    it("rejects non-http/https backend URLs", () => {
      process.env.SOROTTL_BACKEND_URL = "ftp://127.0.0.1:8080";
      expect(() => getServerConfig()).toThrow("backendUrl must be a valid http: or https: URL");

      process.env.SOROTTL_BACKEND_URL = "javascript:alert(1)";
      expect(() => getServerConfig()).toThrow();
    });

    it("rejects backend URLs with embedded credentials (SSRF / credential leak protection)", () => {
      process.env.SOROTTL_BACKEND_URL = "http://admin:secret@127.0.0.1:8080";
      expect(() => getServerConfig()).toThrow("without embedded credentials");
    });

    it("fails when private mode is enabled without SOROTTL_ACCESS_PASSWORD", () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      delete process.env.SOROTTL_ACCESS_PASSWORD;

      expect(() => getServerConfig()).toThrow(
        "SOROTTL_ACCESS_PASSWORD (minimum 8 characters) is required",
      );
    });

    it("fails when private mode password is under 8 characters", () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "short";

      expect(() => getServerConfig()).toThrow(
        "SOROTTL_ACCESS_PASSWORD (minimum 8 characters) is required",
      );
    });
  });

  describe("Session Token Lifecycle & Cryptographic Signing", () => {
    const secret = "test-operator-secret-at-least-32-chars-long";

    it("creates a signed token and verifies it successfully", async () => {
      const token = await createSessionToken(secret, 3600);
      expect(token).toContain(".");
      expect(await verifySessionToken(token, secret)).toBe(true);
    });

    it("rejects tokens signed with a different secret (key rotation test)", async () => {
      const token = await createSessionToken(secret, 3600);
      // Changing secret invalidates previous tokens
      expect(await verifySessionToken(token, "rotated-session-secret-key-32-chars-long")).toBe(
        false,
      );
    });

    it("rejects tampered token payloads", async () => {
      const token = await createSessionToken(secret, 3600);
      const [, sig] = token.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sessionId: "fake-id", issuedAt: 0, expiresAt: 9999999999 }),
      ).toString("base64url");
      const tamperedToken = `${tamperedPayload}.${sig}`;

      expect(await verifySessionToken(tamperedToken, secret)).toBe(false);
    });

    it("rejects expired session tokens", async () => {
      // Token created with maxAge of -10 seconds (already expired)
      const expiredToken = await createSessionToken(secret, -10);
      expect(await verifySessionToken(expiredToken, secret)).toBe(false);
    });

    it("rejects malformed, empty, or non-string tokens", async () => {
      expect(await verifySessionToken("", secret)).toBe(false);
      expect(await verifySessionToken("just-a-plain-string", secret)).toBe(false);
      expect(await verifySessionToken("a.b.c", secret)).toBe(false);
      expect(await verifySessionToken(null, secret)).toBe(false);
    });

    it("rejects tokens after immediate server-side revocation", async () => {
      const token = await createSessionToken(secret, 3600);
      expect(await verifySessionToken(token, secret)).toBe(true);

      // Server explicitly revokes the session
      revokeSession(token);
      expect(await verifySessionToken(token, secret)).toBe(false);
    });
  });

  describe("Authentication API Routes (/api/auth/login and /api/auth/logout)", () => {
    beforeEach(() => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "secure-operator-pass";
      process.env.SOROTTL_SESSION_SECRET = validProductionSecret;
    });

    it("issues a signed session cookie signed by SOROTTL_SESSION_SECRET", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "secure-operator-pass" }),
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(200);

      const cookie = res.cookies.get("sorottl_access_token");
      expect(cookie).toBeDefined();
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe("lax");
      // Cookie value must NOT be the raw password
      expect(cookie?.value).not.toBe("secure-operator-pass");
      // Token must NOT verify with password
      expect(await verifySessionToken(cookie?.value, "secure-operator-pass")).toBe(false);
      // Token MUST verify with the independent session secret
      expect(await verifySessionToken(cookie?.value, validProductionSecret)).toBe(true);
    });

    it("returns 401 on incorrect credentials without leaking details", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong-password" }),
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid operator credentials");
    });

    it("enforces rate-limiting lockout after repeated failed attempts", async () => {
      process.env.SOROTTL_TRUST_PROXY = "true";
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: { "x-real-ip": "192.168.1.100" },
          body: JSON.stringify({ password: `wrong-password-${i}` }),
        });
        const res = await loginPOST(req);
        expect(res.status).toBe(401);
      }

      // 6th attempt should be blocked by rate limit
      const blockedReq = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "x-real-ip": "192.168.1.100" },
        body: JSON.stringify({ password: "secure-operator-pass" }),
      });
      const blockedRes = await loginPOST(blockedReq);
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
    });

    it("ignores spoofed client headers when trustProxy is disabled (default)", async () => {
      delete process.env.SOROTTL_TRUST_PROXY; // default: false
      // Attacker sends 5 requests with spoofed IPs
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: { "x-forwarded-for": `10.0.0.${i}` },
          body: JSON.stringify({ password: `wrong-password-${i}` }),
        });
        const res = await loginPOST(req);
        expect(res.status).toBe(401);
      }

      // 6th attempt with a new spoofed IP is STILL blocked because trustProxy is false
      const blockedReq = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.99" },
        body: JSON.stringify({ password: "secure-operator-pass" }),
      });
      const blockedRes = await loginPOST(blockedReq);
      expect(blockedRes.status).toBe(429);
    });

    it("rejects oversized request bodies with 413 based on Content-Length header", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-length": "5000" },
        body: JSON.stringify({ password: "a" }),
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(413);
    });

    it("rejects oversized request stream with 413", async () => {
      const oversizedPayload = JSON.stringify({ password: "a".repeat(5000) });
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: oversizedPayload,
      });

      const res = await loginPOST(req);
      expect(res.status).toBe(413);
    });

    it("rejects GET method on login route with 405", async () => {
      const res = await loginGET();
      expect(res.status).toBe(405);
    });

    it("handles logout by revoking the session token and clearing the cookie", async () => {
      // First issue a valid token
      const token = await createSessionToken(validProductionSecret, 3600);

      const logoutReq = new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
      });
      logoutReq.cookies.set("sorottl_access_token", token);

      const res = await logoutPOST(logoutReq);
      expect(res.status).toBe(200);

      // Verify cookie is cleared
      const cookie = res.cookies.get("sorottl_access_token");
      expect(cookie).toBeDefined();
      expect(cookie?.maxAge).toBe(0);
      expect(cookie?.value).toBe("");

      // Verify token is now revoked on the server
      expect(await verifySessionToken(token, validProductionSecret)).toBe(false);

      // Verify logout followed by a request using the copied pre-logout token through middleware is rejected
      const replayReq = new NextRequest("http://localhost:3000/watchlist");
      replayReq.cookies.set("sorottl_access_token", token);
      const replayRes = await middleware(replayReq);
      expect(replayRes.status).toBe(307);
      expect(replayRes.headers.get("location")).toContain("/login?returnUrl=%2Fwatchlist");
    });

    it("rejects GET method on logout route with 405", async () => {
      const res = await logoutGET();
      expect(res.status).toBe(405);
    });
  });

  describe("Visitor Access Control Middleware", () => {
    beforeEach(() => {
      process.env.SOROTTL_SESSION_SECRET = validProductionSecret;
    });

    it("permits all routes when accessMode is public", async () => {
      process.env.SOROTTL_ACCESS_MODE = "public";

      const req = new NextRequest("http://localhost:3000/watchlist");
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("redirects unauthenticated visitors to /login when accessMode is private", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      const req = new NextRequest("http://localhost:3000/watchlist");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login?returnUrl=%2Fwatchlist");
    });

    it("prevents open redirect bypasses by enforcing relative return path", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      // Attempted open redirect via double slash
      const req = new NextRequest("http://localhost:3000//evil.com");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login?returnUrl=%2F");
    });

    it("rejects unauthenticated API requests with 401 in private mode", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      const req = new NextRequest("http://localhost:3000/api/backend/health");
      const res = await middleware(req);

      expect(res.status).toBe(401);
      expect(res.headers.get("Cache-Control")).toContain("no-store");
    });

    it("authorizes visitor requests with valid signed session cookie in private mode", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      const validToken = await createSessionToken(validProductionSecret, 3600);
      const reqCookie = new NextRequest("http://localhost:3000/watchlist");
      reqCookie.cookies.set("sorottl_access_token", validToken);
      const resCookie = await middleware(reqCookie);
      expect(resCookie.status).toBe(200);
    });

    it("rejects revoked session token in middleware", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      const validToken = await createSessionToken(validProductionSecret, 3600);
      revokeSession(validToken);

      const reqCookie = new NextRequest("http://localhost:3000/watchlist");
      reqCookie.cookies.set("sorottl_access_token", validToken);
      const resCookie = await middleware(reqCookie);
      expect(resCookie.status).toBe(307);
      expect(resCookie.headers.get("location")).toContain("/login");
    });

    it("permits custom password header strictly on /api/backend/ routes, but rejects on page and other routes", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      // Valid on /api/backend/ proxy route
      const reqApiHeader = new NextRequest("http://localhost:3000/api/backend/health", {
        headers: {
          "x-sorottl-access-password": "super-secret-operator-pass",
        },
      });
      const resApi = await middleware(reqApiHeader);
      expect(resApi.status).toBe(200);

      // Denied on browser page route
      const reqPageHeader = new NextRequest("http://localhost:3000/watchlist", {
        headers: {
          "x-sorottl-access-password": "super-secret-operator-pass",
        },
      });
      const resPage = await middleware(reqPageHeader);
      expect(resPage.status).toBe(307);
      expect(resPage.headers.get("location")).toContain("/login");
    });

    it("allows /api/health/ready unauthenticated for orchestrator probes", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      const reqProbe = new NextRequest("http://localhost:3000/api/health/ready");
      const resProbe = await middleware(reqProbe);
      expect(resProbe.status).toBe(200);
    });
  });

  describe("Readiness Health Probe", () => {
    it("returns 200 ready when configuration is valid", async () => {
      process.env.SOROTTL_ACCESS_MODE = "public";

      const res = await readinessGET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ready");
      expect(json.accessMode).toBe("public");
    });

    it("returns 500 not_ready when configuration is invalid without exposing internal paths", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      delete process.env.SOROTTL_ACCESS_PASSWORD;

      const res = await readinessGET();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.status).toBe("not_ready");
      expect(json.error).toBeDefined();
      expect(json.error).not.toContain("C:\\");
    });
  });
});
