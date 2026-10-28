import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getServerConfig } from "../../lib/config";
import { middleware } from "../../middleware";
import { NextRequest } from "next/server";
import { GET as readinessGET } from "../../app/api/health/ready/route";

describe("Production Environment Validation & Visitor Access Control", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Environment Validation & SSRF URL Defense", () => {
    it("validates default configuration safely in development", () => {
      delete process.env.SOROTTL_BACKEND_URL;
      delete process.env.SOROTTL_BACKEND_AUTH_TOKEN;
      delete process.env.SOROTTL_ACCESS_MODE;
      delete process.env.SOROTTL_ACCESS_PASSWORD;

      const config = getServerConfig();
      expect(config.backendUrl).toBe("http://127.0.0.1:8080");
      expect(config.accessMode).toBe("public");
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

  describe("Visitor Access Control Middleware", () => {
    it("permits all routes when accessMode is public", () => {
      process.env.SOROTTL_ACCESS_MODE = "public";

      const req = new NextRequest("http://localhost:3000/watchlist");
      const res = middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("redirects unauthenticated visitors to /login when accessMode is private", () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      const req = new NextRequest("http://localhost:3000/watchlist");
      const res = middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login?returnUrl=%2Fwatchlist");
    });

    it("prevents open redirect bypasses by enforcing relative return path", () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      // Attempted open redirect via double slash
      const req = new NextRequest("http://localhost:3000//evil.com");
      const res = middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login?returnUrl=%2F");
    });

    it("rejects unauthenticated API requests with 401 in private mode", () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      const req = new NextRequest("http://localhost:3000/api/backend/health");
      const res = middleware(req);

      expect(res.status).toBe(401);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("authorizes visitor requests with valid cookie or header in private mode", () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      process.env.SOROTTL_ACCESS_PASSWORD = "super-secret-operator-pass";

      const reqCookie = new NextRequest("http://localhost:3000/watchlist");
      reqCookie.cookies.set("sorottl_access_token", "super-secret-operator-pass");
      const resCookie = middleware(reqCookie);
      expect(resCookie.status).toBe(200);

      const reqHeader = new NextRequest("http://localhost:3000/api/backend/health", {
        headers: {
          "x-sorottl-access-password": "super-secret-operator-pass",
        },
      });
      const resHeader = middleware(reqHeader);
      expect(resHeader.status).toBe(200);
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

    it("returns 500 not_ready when configuration is invalid", async () => {
      process.env.SOROTTL_ACCESS_MODE = "private";
      delete process.env.SOROTTL_ACCESS_PASSWORD;

      const res = await readinessGET();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.status).toBe("not_ready");
      expect(json.error).toBeDefined();
    });
  });
});
