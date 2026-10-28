import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, HEAD, POST, PUT, DELETE, PATCH } from "../../app/api/backend/[...path]/route";

describe("Backend Proxy Security and Routing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      SOROTTL_BACKEND_URL: "http://127.0.0.1:8080",
      SOROTTL_BACKEND_AUTH_TOKEN: "secret-token-123",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects unauthorized HTTP mutation methods with 405 Method Not Allowed", async () => {
    const postRes = await POST();
    expect(postRes.status).toBe(405);
    const postJson = await postRes.json();
    expect(postJson.error.code).toBe("METHOD_NOT_ALLOWED");

    const putRes = await PUT();
    expect(putRes.status).toBe(405);

    const deleteRes = await DELETE();
    expect(deleteRes.status).toBe(405);

    const patchRes = await PATCH();
    expect(patchRes.status).toBe(405);
  });

  it("rejects path traversal attempts with 400 Bad Request", async () => {
    const req = new NextRequest("http://localhost:3000/api/backend/../secret");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["..", "secret"] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("BAD_REQUEST");
    expect(json.error.message).toContain("Path traversal");
  });

  it("rejects multi-encoded path traversal attempts with 400 Bad Request", async () => {
    const req = new NextRequest("http://localhost:3000/api/backend/%252e%252e/secret");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["%252e%252e", "secret"] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("BAD_REQUEST");
    expect(json.error.message).toContain("Path traversal");
  });

  it("rejects malformed percent-encoding with 400 Bad Request", async () => {
    const req = new NextRequest("http://localhost:3000/api/backend/%E0%A4%A/health");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["%E0%A4%A", "health"] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("BAD_REQUEST");
    expect(json.error.message).toContain("Malformed percent-encoding");
  });

  it("rejects encoded separators (%2f, %5c) attempting path traversal", async () => {
    const req = new NextRequest("http://localhost:3000/api/backend/health%2f..%2fsecret");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["health%2f..%2fsecret"] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("BAD_REQUEST");
    expect(json.error.message).toContain("Path traversal");
  });

  it("normalizes percent-encoded valid route to decoded exact match", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      expect(String(url)).toBe("http://127.0.0.1:8080/health");
      return new Response(JSON.stringify({ success: true, data: { status: "healthy" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/backend/h%65alth");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["h%65alth"] }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("rejects unpermitted routes with 404 Not Found", async () => {
    const req = new NextRequest("http://localhost:3000/api/backend/api/v1/unknown");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["api", "v1", "unknown"] }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
    expect(json.error.message).toContain("not permitted");
  });

  it("rejects repeated query parameters with 400 Invalid Query Params", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/backend/api/v1/watchlist?network=testnet&network=mainnet",
    );
    const res = await GET(req, {
      params: Promise.resolve({ path: ["api", "v1", "watchlist"] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_QUERY_PARAMS");
    expect(json.error.message).toContain("Repeated query parameter: 'network'");
  });

  it("rejects disallowed query parameters with 400 Invalid Query Params", async () => {
    const req = new NextRequest("http://localhost:3000/api/backend/health?extra=bad");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["health"] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_QUERY_PARAMS");
    expect(json.error.message).toContain("Disallowed query parameter: 'extra'");
  });

  it("validates query parameter boundaries (e.g. limit > 100 or non-standard network)", async () => {
    const req = new NextRequest("http://localhost:3000/api/backend/api/v1/watchlist?limit=500");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["api", "v1", "watchlist"] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_QUERY_PARAMS");
    expect(json.error.message).toContain("limit");

    const reqNet = new NextRequest(
      "http://localhost:3000/api/backend/api/v1/watchlist?network=othernet",
    );
    const resNet = await GET(reqNet, {
      params: Promise.resolve({ path: ["api", "v1", "watchlist"] }),
    });
    expect(resNet.status).toBe(400);
    const jsonNet = await resNet.json();
    expect(jsonNet.error.code).toBe("INVALID_QUERY_PARAMS");
    expect(jsonNet.error.message).toContain("Network must be 'testnet' or 'mainnet'");
  });

  it("injects backend auth token and strips client Authorization header", async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedUrl: string | undefined;

    vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ success: true, data: { status: "healthy" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/backend/health", {
      headers: {
        authorization: "Bearer browser-untrusted-token",
      },
    });

    const res = await GET(req, {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(res.status).toBe(200);
    expect(capturedUrl).toBe("http://127.0.0.1:8080/health");
    expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(
      "Bearer secret-token-123",
    );
    expect((capturedHeaders as Record<string, string>)["authorization"]).toBeUndefined();

    // Verify cache control headers
    expect(res.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
  });

  it("supports HEAD requests without returning a body", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(null, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/backend/health", {
      method: "HEAD",
    });

    const res = await HEAD(req, {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    const text = await res.text();
    expect(text).toBe("");
  });

  it("handles upstream connection failure gracefully with 502 Bad Gateway", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Connection refused"));

    const req = new NextRequest("http://localhost:3000/api/backend/health");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("BAD_GATEWAY");
    expect(json.error.message).toBe("Failed to connect to upstream SoroTTL backend");
  });

  it("handles missing or invalid server configuration with 500 CONFIG_ERROR", async () => {
    process.env.SOROTTL_BACKEND_URL = "not-a-valid-url";

    const req = new NextRequest("http://localhost:3000/api/backend/health");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe("CONFIG_ERROR");
    expect(json.error.message).toBe("Server configuration error");
  });

  it("handles upstream 4xx and 5xx structured responses without leaking secrets", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Missing or invalid Authorization header",
          },
          timestamp: "2026-10-28T07:00:00.000Z",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const req = new NextRequest("http://localhost:3000/api/backend/api/v1/watchlist");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["api", "v1", "watchlist"] }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(res.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
  });

  it("handles upstream non-JSON response with normalized 502 error", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response("<html><body>502 Bad Gateway NGINX</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/backend/health");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_UPSTREAM_RESPONSE");
    expect(json.error.message).toBe("Upstream response is not valid JSON");
  });

  it("enforces response size limit when streaming even with missing Content-Length", async () => {
    // Create a ReadableStream delivering > 2MB without Content-Length
    const chunk = new Uint8Array(512 * 1024); // 512KB
    let sentChunks = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (sentChunks < 5) {
          // 5 * 512KB = 2.5MB > 2MB limit
          controller.enqueue(chunk);
          sentChunks++;
        } else {
          controller.close();
        }
      },
    });

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/backend/health");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("RESPONSE_TOO_LARGE");
  });

  it("cancels upstream fetch when client aborts the request", async () => {
    const clientController = new AbortController();
    let upstreamAborted = false;

    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          if (init.signal.aborted) {
            upstreamAborted = true;
            const err = new Error("AbortError");
            err.name = "AbortError";
            reject(err);
            return;
          }
          init.signal.addEventListener("abort", () => {
            upstreamAborted = true;
            const err = new Error("AbortError");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    const req = new NextRequest("http://localhost:3000/api/backend/health", {
      signal: clientController.signal,
    });

    const resPromise = GET(req, {
      params: Promise.resolve({ path: ["health"] }),
    });

    // Abort client request while upstream request is in-flight
    setTimeout(() => {
      clientController.abort();
    }, 10);

    const res = await resPromise;

    expect(upstreamAborted).toBe(true);
    expect(res.status).toBe(499);
    const json = await res.json();
    expect(json.error.code).toBe("CLIENT_CLOSED_REQUEST");
  });
});
