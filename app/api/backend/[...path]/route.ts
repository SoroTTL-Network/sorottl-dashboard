import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";

/**
 * Route parameter definitions and allowed query parameter keys.
 */
interface AllowedRouteConfig {
  allowedQueryParams: Set<string>;
}

const ALLOWED_ROUTES: Record<string, AllowedRouteConfig> = {
  health: { allowedQueryParams: new Set() },
  "health/live": { allowedQueryParams: new Set() },
  "health/ready": { allowedQueryParams: new Set() },
  "api/v1/watchlist": {
    allowedQueryParams: new Set(["network", "enabledOnly", "limit", "offset"]),
  },
  "api/v1/observations": {
    allowedQueryParams: new Set(["watchlistId", "network", "status", "limit", "offset"]),
  },
  "api/v1/alerts": {
    allowedQueryParams: new Set([
      "watchlistId",
      "network",
      "category",
      "deliveryStatus",
      "limit",
      "offset",
    ]),
  },
};

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2MB
const REQUEST_TIMEOUT_MS = 10_000; // 10s

function createErrorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers: {
        ...NO_CACHE_HEADERS,
      },
    },
  );
}

/**
 * Validates path against directory traversal, decodes all percent-encodings,
 * and returns the normalized decoded path string.
 */
function normalizeAndValidatePath(paramsPath: string[] | undefined): {
  normalizedPath?: string;
  error?: string;
} {
  if (!paramsPath || paramsPath.length === 0) {
    return { error: "Missing route path" };
  }

  const decodedSegments: string[] = [];

  for (const segment of paramsPath) {
    // Decode segment repeatedly to catch nested or double encodings
    let decoded = segment;
    try {
      while (decoded.includes("%")) {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      }
    } catch {
      return { error: "Malformed percent-encoding" };
    }

    if (
      segment === ".." ||
      segment === "." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      decoded === ".." ||
      decoded === "." ||
      decoded.includes("..") ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      return { error: "Path traversal detected" };
    }

    decodedSegments.push(decoded);
  }

  const normalizedPath = decodedSegments.join("/");
  return { normalizedPath };
}

/**
 * Validates query parameters against allowed keys and value patterns.
 * Also detects and rejects repeated query parameter keys.
 */
function validateQueryParams(
  searchParams: URLSearchParams,
  config: AllowedRouteConfig,
): { sanitizedParams?: URLSearchParams; error?: string } {
  const sanitized = new URLSearchParams();
  const seenKeys = new Set<string>();

  for (const [key, value] of searchParams.entries()) {
    if (seenKeys.has(key)) {
      return { error: `Repeated query parameter: '${key}'` };
    }
    seenKeys.add(key);

    if (!config.allowedQueryParams.has(key)) {
      return { error: `Disallowed query parameter: '${key}'` };
    }

    if (key === "limit") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        return { error: "Query param 'limit' must be an integer between 1 and 100" };
      }
      sanitized.set(key, String(parsed));
    } else if (key === "offset") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return { error: "Query param 'offset' must be a non-negative integer" };
      }
      sanitized.set(key, String(parsed));
    } else if (key === "watchlistId") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return { error: "Query param 'watchlistId' must be a positive integer" };
      }
      sanitized.set(key, String(parsed));
    } else if (key === "enabledOnly") {
      if (value !== "true" && value !== "false") {
        return { error: "Query param 'enabledOnly' must be 'true' or 'false'" };
      }
      sanitized.set(key, value);
    } else if (key === "status") {
      if (!["live", "ttlReached", "unknown"].includes(value)) {
        return { error: `Invalid status: '${value}'` };
      }
      sanitized.set(key, value);
    } else if (key === "category") {
      if (
        !["low_ttl", "ttl_reached", "unknown_status", "rpc_failure", "config_failure"].includes(
          value,
        )
      ) {
        return { error: `Invalid category: '${value}'` };
      }
      sanitized.set(key, value);
    } else if (key === "deliveryStatus") {
      if (!["pending", "delivered", "failed"].includes(value)) {
        return { error: `Invalid deliveryStatus: '${value}'` };
      }
      sanitized.set(key, value);
    } else if (key === "network") {
      if (value !== "testnet" && value !== "mainnet") {
        return { error: "Network must be 'testnet' or 'mainnet'" };
      }
      sanitized.set(key, value);
    } else {
      sanitized.set(key, value);
    }
  }

  return { sanitizedParams: sanitized };
}

/**
 * Reads stream with strict byte counting to abort immediately once MAX_RESPONSE_SIZE is exceeded,
 * handling missing or inaccurate Content-Length headers securely.
 */
async function readBodyWithLimit(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<{ bodyText?: string; exceeded?: boolean }> {
  if (!response.body) {
    const text = await response.text();
    if (text.length > limit) {
      return { exceeded: true };
    }
    return { bodyText: text };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let result = "";

  try {
    while (true) {
      if (signal.aborted) {
        throw new Error("AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.byteLength;
      if (receivedBytes > limit) {
        await reader.cancel();
        return { exceeded: true };
      }

      result += decoder.decode(value, { stream: true });
    }

    result += decoder.decode();
    return { bodyText: result };
  } catch (err: unknown) {
    await reader.cancel().catch(() => {});
    throw err;
  }
}

/**
 * Main proxy handler.
 */
async function handleProxy(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
  isHead: boolean = false,
): Promise<NextResponse> {
  const { path: paramsPath } = await context.params;

  const { normalizedPath, error: pathError } = normalizeAndValidatePath(paramsPath);
  if (pathError || !normalizedPath) {
    return createErrorResponse(400, "BAD_REQUEST", pathError || "Invalid path");
  }

  const routeConfig = ALLOWED_ROUTES[normalizedPath];
  if (!routeConfig) {
    return createErrorResponse(404, "NOT_FOUND", `Route '/${normalizedPath}' is not permitted`);
  }

  const { sanitizedParams, error: paramError } = validateQueryParams(
    request.nextUrl.searchParams,
    routeConfig,
  );
  if (paramError || !sanitizedParams) {
    return createErrorResponse(
      400,
      "INVALID_QUERY_PARAMS",
      paramError || "Invalid query parameters",
    );
  }

  let serverConfig;
  try {
    serverConfig = getServerConfig();
  } catch {
    return createErrorResponse(500, "CONFIG_ERROR", "Server configuration error");
  }

  const queryString = sanitizedParams.toString();
  const upstreamUrl = `${serverConfig.backendUrl.replace(/\/+$/, "")}/${normalizedPath}${
    queryString ? `?${queryString}` : ""
  }`;

  // Headers to forward upstream
  const upstreamHeaders: Record<string, string> = {
    Accept: "application/json",
  };

  // Strip client authorization and inject server-side backend token if configured
  if (serverConfig.backendAuthToken) {
    upstreamHeaders["Authorization"] = `Bearer ${serverConfig.backendAuthToken}`;
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  // Link client abort to upstream abort controller to ensure cleanup
  const clientSignal = request.signal;
  let onClientAbort: (() => void) | undefined;
  if (clientSignal) {
    if (clientSignal.aborted) {
      timeoutController.abort();
      clearTimeout(timeoutId);
      return createErrorResponse(499, "CLIENT_CLOSED_REQUEST", "Client closed request");
    }
    onClientAbort = () => timeoutController.abort();
    clientSignal.addEventListener("abort", onClientAbort);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: isHead ? "HEAD" : "GET",
      headers: upstreamHeaders,
      signal: timeoutController.signal,
      cache: "no-store",
    });

    if (isHead) {
      clearTimeout(timeoutId);
      return new NextResponse(null, {
        status: upstreamResponse.status,
        headers: {
          ...NO_CACHE_HEADERS,
          "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
        },
      });
    }

    const contentLength = upstreamResponse.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_RESPONSE_SIZE) {
      clearTimeout(timeoutId);
      return createErrorResponse(502, "RESPONSE_TOO_LARGE", "Upstream response exceeds size limit");
    }

    // Stream-read body with real-time byte limit enforcement under the 10s timeout
    const { bodyText, exceeded } = await readBodyWithLimit(
      upstreamResponse,
      MAX_RESPONSE_SIZE,
      timeoutController.signal,
    );

    clearTimeout(timeoutId);

    if (exceeded) {
      return createErrorResponse(502, "RESPONSE_TOO_LARGE", "Upstream response exceeds size limit");
    }

    // If upstream returns non-JSON content type or malformed body
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyText ?? "");
    } catch {
      // If upstream failed to produce valid JSON, return safe normalized JSON error
      return createErrorResponse(
        upstreamResponse.status >= 500 ? 502 : upstreamResponse.status,
        "INVALID_UPSTREAM_RESPONSE",
        "Upstream response is not valid JSON",
      );
    }

    // Pass through status and sanitized payload with no-store headers
    return NextResponse.json(parsedBody, {
      status: upstreamResponse.status,
      headers: {
        ...NO_CACHE_HEADERS,
      },
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (clientSignal?.aborted) {
      return createErrorResponse(499, "CLIENT_CLOSED_REQUEST", "Client closed request");
    }

    if (
      (err instanceof Error && (err.name === "AbortError" || err.message === "AbortError")) ||
      timeoutController.signal.aborted
    ) {
      return createErrorResponse(504, "UPSTREAM_TIMEOUT", "Upstream backend request timed out");
    }

    return createErrorResponse(502, "BAD_GATEWAY", "Failed to connect to upstream SoroTTL backend");
  } finally {
    if (clientSignal && onClientAbort) {
      clientSignal.removeEventListener("abort", onClientAbort);
    }
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<NextResponse> {
  return handleProxy(request, context, false);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<NextResponse> {
  return handleProxy(request, context, true);
}

export async function POST(): Promise<NextResponse> {
  return createErrorResponse(405, "METHOD_NOT_ALLOWED", "Method POST is not allowed");
}

export async function PUT(): Promise<NextResponse> {
  return createErrorResponse(405, "METHOD_NOT_ALLOWED", "Method PUT is not allowed");
}

export async function DELETE(): Promise<NextResponse> {
  return createErrorResponse(405, "METHOD_NOT_ALLOWED", "Method DELETE is not allowed");
}

export async function PATCH(): Promise<NextResponse> {
  return createErrorResponse(405, "METHOD_NOT_ALLOWED", "Method PATCH is not allowed");
}
