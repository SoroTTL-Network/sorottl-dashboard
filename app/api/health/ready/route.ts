import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";

/**
 * Process readiness health probe for production deployments and orchestrators (e.g. Kubernetes, Docker, Nomad).
 * Returns:
 * - 200 OK: Configuration validated and server ready to handle proxy requests.
 * - 500 Internal Error: Server configuration is missing or invalid.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const config = getServerConfig();
    return NextResponse.json(
      {
        status: "ready",
        accessMode: config.accessMode,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Configuration invalid";
    return NextResponse.json(
      {
        status: "not_ready",
        error: message,
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}
