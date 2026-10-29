import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "./lib/config";
import { verifySessionToken } from "./lib/session";
import { safePasswordCompare } from "./lib/auth-security";

const ACCESS_COOKIE_NAME = "sorottl_access_token";

/**
 * Middleware handling visitor access control and security header enforcement.
 */
export async function middleware(request: NextRequest) {
  let serverConfig;
  try {
    serverConfig = getServerConfig();
  } catch {
    // If configuration is completely invalid in production, block access safely with 500
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: { code: "CONFIG_ERROR", message: "Server configuration error" } },
        { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
      );
    }
    return new NextResponse("Server Configuration Error", {
      status: 500,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  }

  const { pathname } = request.nextUrl;

  // Static assets and internal Next.js requests bypass visitor auth
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js")
  ) {
    return NextResponse.next();
  }

  // Handle visitor authentication when in private mode
  if (serverConfig.accessMode === "private") {
    const isLoginPath = pathname === "/login";
    const isAuthApiPath = pathname.startsWith("/api/auth/");
    const isReadinessProbe = pathname === "/api/health/ready";

    const cookieToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
    const isCookieAuthorized =
      !!serverConfig.sessionSecret &&
      (await verifySessionToken(cookieToken, serverConfig.sessionSecret));

    // Machine-to-machine password header is restricted strictly to /api/backend/ proxy routes
    const isBackendApiRoute = pathname.startsWith("/api/backend/");
    const headerToken = isBackendApiRoute ? request.headers.get("x-sorottl-access-password") : null;
    const isHeaderAuthorized =
      !!headerToken &&
      !!serverConfig.accessPassword &&
      (await safePasswordCompare(headerToken, serverConfig.accessPassword));

    const isAuthorized = isCookieAuthorized || isHeaderAuthorized;

    if (!isAuthorized && !isLoginPath && !isAuthApiPath && !isReadinessProbe) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VISITOR_AUTH_REQUIRED",
              message: "Dashboard is configured in private mode. Visitor authentication required.",
            },
          },
          { status: 401, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
        );
      }

      // Redirect browser visitors to /login preserving intended destination safely
      const loginUrl = new URL("/login", request.url);
      if (pathname !== "/") {
        // Enforce relative return path to prevent open redirect vulnerabilities
        const safeReturnPath =
          pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
        loginUrl.searchParams.set("returnUrl", safeReturnPath);
      }
      return NextResponse.redirect(loginUrl);
    }

    // If visitor is already authorized and visits /login, redirect to destination or home
    if (isAuthorized && isLoginPath) {
      const rawReturnUrl = request.nextUrl.searchParams.get("returnUrl") || "/";
      const safeReturnUrl =
        rawReturnUrl.startsWith("/") && !rawReturnUrl.startsWith("//") ? rawReturnUrl : "/";
      return NextResponse.redirect(new URL(safeReturnUrl, request.url));
    }
  }

  // Response passes with Next.js standard headers
  const response = NextResponse.next();

  // Enforce security headers on response
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
