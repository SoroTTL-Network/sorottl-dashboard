import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/lib/session";
import { getServerConfig } from "@/lib/config";

const ACCESS_COOKIE_NAME = "sorottl_access_token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let serverConfig;
  try {
    serverConfig = getServerConfig();
  } catch {
    // Fail gracefully with standard error
  }

  // Extract session token from cookie to revoke on the server
  const cookieToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  if (cookieToken) {
    revokeSession(cookieToken);
  }

  const response = NextResponse.json(
    { success: true, message: "Logged out successfully" },
    { status: 200, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );

  // Expire and clear the session cookie with exact matching attributes (path, httpOnly, sameSite, secure)
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: serverConfig?.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { success: false, error: "Method GET is not allowed on /api/auth/logout" },
    { status: 405, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
