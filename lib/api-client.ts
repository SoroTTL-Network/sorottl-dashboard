import { z } from "zod";
import {
  BackendHealthDataSchema,
  HealthLiveDataSchema,
  HealthReadyDataSchema,
  WatchlistListResponseSchema,
  ObservationsListResponseSchema,
  AlertsListResponseSchema,
  createApiResponseSchema,
} from "./schemas";
import type {
  ApiResponse,
  BackendHealthData,
  WatchlistRecord,
  TTLObservationRecord,
  AlertRecord,
} from "./types";
import {
  ApiClientError,
  ApiHttpError,
  ApiValidationError,
  ApiTimeoutError,
  ApiNetworkError,
} from "./errors";

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface WatchlistQueryOptions extends RequestOptions {
  network?: string;
  enabledOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ObservationsQueryOptions extends RequestOptions {
  watchlistId?: number;
  network?: string;
  status?: "live" | "ttlReached" | "unknown";
  limit?: number;
  offset?: number;
}

export interface AlertsQueryOptions extends RequestOptions {
  watchlistId?: number;
  network?: string;
  category?: "low_ttl" | "ttl_reached" | "unknown_status" | "rpc_failure" | "config_failure";
  deliveryStatus?: "pending" | "delivered" | "failed";
  limit?: number;
  offset?: number;
}

export class SoroTTLClient {
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor(options?: { baseUrl?: string; defaultTimeoutMs?: number }) {
    // Default to the relative internal server proxy endpoint
    this.baseUrl = (options?.baseUrl ?? "/api/backend").replace(/\/+$/, "");
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 10000;
  }

  /**
   * Internal fetch method with timeout, abort signal, error normalization, and schema validation.
   */
  private async request<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    queryParams?: Record<string, string | number | boolean | undefined>,
    options?: RequestOptions,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint.replace(/^\/+/, "")}`, "http://localhost");

    if (queryParams) {
      for (const [key, val] of Object.entries(queryParams)) {
        if (val !== undefined && val !== null) {
          url.searchParams.set(key, String(val));
        }
      }
    }

    const effectiveTimeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), effectiveTimeoutMs);

    // Support caller-provided AbortSignal
    const combinedSignal = options?.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal;

    const requestUrl = `${url.pathname}${url.search}`;

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: combinedSignal,
        cache: "no-store",
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          if (options?.signal?.aborted) {
            throw new ApiClientError("Request aborted by caller", "REQUEST_ABORTED");
          }
          throw new ApiTimeoutError(`Request timed out after ${effectiveTimeoutMs}ms`);
        }
        throw new ApiNetworkError(err.message);
      }
      throw new ApiNetworkError("Unknown network error");
    } finally {
      clearTimeout(timeoutId);
    }

    let responseJson: unknown;
    try {
      responseJson = await response.json();
    } catch {
      throw new ApiHttpError(
        response.status,
        `HTTP ${response.status}: Failed to parse JSON response`,
      );
    }

    if (!response.ok) {
      // Attempt to extract structured error code/message from backend envelope
      const errorObj = (responseJson as { error?: { code?: string; message?: string } })?.error;
      const code = errorObj?.code || `HTTP_${response.status}`;
      const message = errorObj?.message || `Request failed with status ${response.status}`;
      throw new ApiHttpError(response.status, message, code);
    }

    const parseResult = schema.safeParse(responseJson);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new ApiValidationError("Response failed schema validation", issues);
    }

    return parseResult.data;
  }

  /**
   * Fetch system health status.
   */
  async getHealth(options?: RequestOptions): Promise<ApiResponse<BackendHealthData>> {
    const schema = createApiResponseSchema(BackendHealthDataSchema);
    return this.request("health", schema, undefined, options) as Promise<
      ApiResponse<BackendHealthData>
    >;
  }

  /**
   * Fetch process liveness.
   */
  async getHealthLive(
    options?: RequestOptions,
  ): Promise<ApiResponse<{ status: "alive"; uptimeSeconds: number }>> {
    const schema = createApiResponseSchema(HealthLiveDataSchema);
    return this.request("health/live", schema, undefined, options) as Promise<
      ApiResponse<{ status: "alive"; uptimeSeconds: number }>
    >;
  }

  /**
   * Fetch process readiness.
   */
  async getHealthReady(
    options?: RequestOptions,
  ): Promise<ApiResponse<{ status: "ready"; database: "connected" }>> {
    const schema = createApiResponseSchema(HealthReadyDataSchema);
    return this.request("health/ready", schema, undefined, options) as Promise<
      ApiResponse<{ status: "ready"; database: "connected" }>
    >;
  }

  /**
   * Fetch monitored contracts watchlist.
   */
  async getWatchlist(options?: WatchlistQueryOptions): Promise<ApiResponse<WatchlistRecord[]>> {
    const { signal, timeoutMs, ...queryParams } = options || {};
    return this.request("api/v1/watchlist", WatchlistListResponseSchema, queryParams, {
      signal,
      timeoutMs,
    }) as Promise<ApiResponse<WatchlistRecord[]>>;
  }

  /**
   * Fetch TTL observations list.
   */
  async getObservations(
    options?: ObservationsQueryOptions,
  ): Promise<ApiResponse<TTLObservationRecord[]>> {
    const { signal, timeoutMs, ...queryParams } = options || {};
    return this.request("api/v1/observations", ObservationsListResponseSchema, queryParams, {
      signal,
      timeoutMs,
    }) as Promise<ApiResponse<TTLObservationRecord[]>>;
  }

  /**
   * Fetch alerts list.
   */
  async getAlerts(options?: AlertsQueryOptions): Promise<ApiResponse<AlertRecord[]>> {
    const { signal, timeoutMs, ...queryParams } = options || {};
    return this.request("api/v1/alerts", AlertsListResponseSchema, queryParams, {
      signal,
      timeoutMs,
    }) as Promise<ApiResponse<AlertRecord[]>>;
  }
}

/**
 * Singleton instance of the SoroTTL API Client for use across frontend components.
 */
export const apiClient = new SoroTTLClient();
