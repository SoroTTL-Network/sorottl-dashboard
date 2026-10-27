import { z } from "zod";

/**
 * Server-side environment schema.
 * Validates variables used by server components and internal API proxy routes.
 * Strictly prevents exposure of backend credentials to browser bundles.
 */
export const ServerEnvSchema = z.object({
  /** Base URL for the SoroTTL Backend HTTP API */
  backendUrl: z.string().url().default("http://127.0.0.1:8080"),
  /** Optional Bearer token for authenticating with the backend API */
  backendAuthToken: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Public client-side configuration schema.
 */
export const ClientEnvSchema = z.object({
  appName: z.string().default("SoroTTL Dashboard"),
  defaultNetwork: z.enum(["testnet", "mainnet"]).default("testnet"),
  pollIntervalMs: z.coerce.number().int().positive().default(10000),
});

export type ClientEnv = z.infer<typeof ClientEnvSchema>;

/**
 * Validates and returns the server-side environment variables.
 * Fails fast with descriptive errors if configuration is malformed.
 */
export function getServerConfig(): ServerEnv {
  const result = ServerEnvSchema.safeParse({
    backendUrl: process.env.SOROTTL_BACKEND_URL || "http://127.0.0.1:8080",
    backendAuthToken: process.env.SOROTTL_BACKEND_AUTH_TOKEN || undefined,
  });

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment configuration: ${issues}`);
  }

  return result.data;
}

/**
 * Validates and returns the public client environment settings.
 */
export function getClientConfig(): ClientEnv {
  const result = ClientEnvSchema.safeParse({
    appName: process.env.NEXT_PUBLIC_APP_NAME || "SoroTTL Dashboard",
    defaultNetwork: process.env.NEXT_PUBLIC_DEFAULT_NETWORK || "testnet",
    pollIntervalMs: process.env.NEXT_PUBLIC_POLL_INTERVAL_MS || 10000,
  });

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid client environment configuration: ${issues}`);
  }

  return result.data;
}
