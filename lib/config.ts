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
     * - In 'production', this MUST be explicitly set to 'public' or 'private' to prevent accidental exposure.
     * - In 'development' or 'test', defaults to 'public' for frictionless local development.
     * - 'public': Unauthenticated read-only access.
     * - 'private': Requires visitors to authenticate with the operator password.
     */
    accessMode: z
      .enum(["public", "private"], {
        message: "SOROTTL_ACCESS_MODE must be either 'public' or 'private'",
      })
      .optional(),

    /**
     * Required when accessMode is 'private'.
     * Pre-shared secret or operator passphrase to gate dashboard access.
     */
    accessPassword: z
      .string()
      .min(8, "SOROTTL_ACCESS_PASSWORD (minimum 8 characters) is required")
      .optional(),

    /**
     * Independent cryptographic session signing secret used to HMAC-SHA256 sign visitor session tokens.
     * Must be at least 32 characters long.
     * In 'production' with 'private' mode, this secret is strictly mandatory.
     */
    sessionSecret: z
      .string()
      .min(32, "SOROTTL_SESSION_SECRET must be at least 32 characters long")
      .optional(),

    /**
     * Whether the application is behind a trusted reverse proxy (e.g. Nginx, Cloudflare, AWS ALB).
     * When true, x-forwarded-for and x-real-ip headers are evaluated for rate limiting.
     * When false (default), client IP headers are ignored to prevent header spoofing.
     */
    trustProxy: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // 1. Fail-closed production enforcement:
    // When running in production, SOROTTL_ACCESS_MODE cannot be omitted or defaulted.
    if (data.nodeEnv === "production" && !data.accessMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accessMode"],
        message:
          "SOROTTL_ACCESS_MODE must be explicitly defined as 'public' or 'private' in production environments to prevent accidental exposure.",
      });
    }

    // 2. Private mode requirements
    const resolvedMode = data.accessMode ?? (data.nodeEnv === "production" ? undefined : "public");
    if (resolvedMode === "private") {
      if (!data.accessPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["accessPassword"],
          message:
            "SOROTTL_ACCESS_PASSWORD (minimum 8 characters) is required when SOROTTL_ACCESS_MODE is 'private'",
        });
      }

      // In production private mode, sessionSecret is strictly required to sign session tokens independently
      if (data.nodeEnv === "production" && !data.sessionSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sessionSecret"],
          message:
            "SOROTTL_SESSION_SECRET (minimum 32 characters) is strictly required in production private mode for secure cryptographic token signing",
        });
      }
    }
  });

export interface ServerEnv {
  nodeEnv: "development" | "test" | "production";
  backendUrl: string;
  backendAuthToken?: string;
  accessMode: "public" | "private";
  accessPassword?: string;
  sessionSecret: string;
  trustProxy: boolean;
}

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
  const nodeEnv = (process.env.NODE_ENV || "development") as "development" | "test" | "production";

  // Parse raw access mode without silent fallback to "public"
  let rawAccessMode: string | undefined = undefined;
  if (process.env.SOROTTL_ACCESS_MODE !== undefined && process.env.SOROTTL_ACCESS_MODE !== "") {
    rawAccessMode = process.env.SOROTTL_ACCESS_MODE.trim().toLowerCase();
  }

  const rawTrustProxy = process.env.SOROTTL_TRUST_PROXY?.toLowerCase();
  const trustProxy = rawTrustProxy === "true" || rawTrustProxy === "1";

  const result = ServerEnvSchema.safeParse({
    nodeEnv,
    backendUrl: process.env.SOROTTL_BACKEND_URL || "http://127.0.0.1:8080",
    backendAuthToken: process.env.SOROTTL_BACKEND_AUTH_TOKEN || undefined,
    accessMode: rawAccessMode,
    accessPassword: process.env.SOROTTL_ACCESS_PASSWORD || undefined,
    sessionSecret: process.env.SOROTTL_SESSION_SECRET || undefined,
    trustProxy,
  });

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment configuration: ${issues}`);
  }

  // Resolved mode: if accessMode was omitted in dev/test, default to "public"
  const finalAccessMode = result.data.accessMode ?? "public";

  // In non-production development/test mode, if sessionSecret is not provided, use a deterministic dev fallback
  const finalSessionSecret =
    result.data.sessionSecret ||
    (nodeEnv !== "production" ? "dev-secret-only-insecure-change-in-production-min-32-chars" : "");

  return {
    ...result.data,
    accessMode: finalAccessMode,
    sessionSecret: finalSessionSecret,
  };
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
