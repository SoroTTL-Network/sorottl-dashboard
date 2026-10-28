import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";

const ACCESS_COOKIE_NAME = "sorottl_access_token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let serverConfig;
  try {
    serverConfig = getServerConfig();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (serverConfig.accessMode !== "private") {
    return NextResponse.json(
      { success: true, message: "Dashboard is in public mode; authentication not required." },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request payload" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { password } = body;
  if (!password || password !== serverConfig.accessPassword) {
    return NextResponse.json(
      { success: false, error: "Incorrect operator password" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.json(
    { success: true, message: "Authentication successful" },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );

  // Set secure HTTP-only session cookie
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: serverConfig.accessPassword,
    httpOnly: true,
    secure: serverConfig.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
