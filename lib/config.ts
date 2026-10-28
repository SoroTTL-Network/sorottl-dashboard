import { z } from "zod";

/**
 * Validates whether a URL string is safe for server-side proxy use:
 * - Must be http: or https:
 * - Must NOT contain embedded username/password credentials (e.g. http://user:pass@host)
 * - Must have a valid hostname
 */
function isValidBackendUrl(val: string): boolean {
  try {
    const parsed = new URL(val);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (!parsed.hostname) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-side environment schema.
 * Validates variables used by server components, middleware, and internal API proxy routes.
 * Strictly prevents exposure of backend credentials to browser bundles.
 */
export const ServerEnvSchema = z
  .object({
    /** Node environment */
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),

    /** Base URL for the SoroTTL Backend HTTP API */
    backendUrl: z
      .string()
      .refine(isValidBackendUrl, {
        message:
          "backendUrl must be a valid http: or https: URL without embedded credentials (e.g. user:pass@)",
      })
      .default("http://127.0.0.1:8080"),

    /** Optional Bearer token for authenticating with the backend API */
    backendAuthToken: z.string().min(1).optional(),

    /**
     * Visitor access control mode:
     * - 'public': Unauthenticated read-only access (default for public block explorer / status portals).
     * - 'private': Requires visitors to supply the configured session password via cookie/header.
     */
    accessMode: z.enum(["public", "private"]).default("public"),

    /**
     * Required when accessMode is 'private'.
     * Pre-shared secret or operator passphrase to gate dashboard access.
     */
    accessPassword: z
      .string()
      .min(8, "SOROTTL_ACCESS_PASSWORD (minimum 8 characters) is required")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accessMode === "private" && !data.accessPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accessPassword"],
        message:
          "SOROTTL_ACCESS_PASSWORD (minimum 8 characters) is required when SOROTTL_ACCESS_MODE is 'private'",
      });
    }
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
    nodeEnv: process.env.NODE_ENV || "development",
    backendUrl: process.env.SOROTTL_BACKEND_URL || "http://127.0.0.1:8080",
    backendAuthToken: process.env.SOROTTL_BACKEND_AUTH_TOKEN || undefined,
    accessMode:
      (process.env.SOROTTL_ACCESS_MODE?.toLowerCase() as "public" | "private") || "public",
    accessPassword: process.env.SOROTTL_ACCESS_PASSWORD || undefined,
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
