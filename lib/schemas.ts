import { z } from "zod";

/**
 * Common API error schema.
 */
export const ApiErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
});

/**
 * Common pagination metadata schema.
 */
export const PaginationMetadataSchema = z.object({
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
});

/**
 * Common response envelope factory.
 */
export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: ApiErrorPayloadSchema.optional(),
    pagination: PaginationMetadataSchema.optional(),
    timestamp: z.string(),
  });
}

/**
 * System health schema.
 */
export const BackendHealthDataSchema = z.object({
  status: z.enum(["healthy", "unhealthy"]),
  uptimeSeconds: z.number().nonnegative(),
  network: z.string(),
  database: z.enum(["connected", "error"]),
  rpc: z.enum(["reachable", "unreachable", "unknown"]),
  currentLedger: z.number().int().nullable(),
  keeperRunning: z.boolean(),
});

/**
 * Process liveness schema.
 */
export const HealthLiveDataSchema = z.object({
  status: z.literal("alive"),
  uptimeSeconds: z.number().nonnegative(),
});

/**
 * Process readiness schema.
 */
export const HealthReadyDataSchema = z.object({
  status: z.literal("ready"),
  database: z.literal("connected"),
});

/**
 * Latest observation summary attached to watchlist entries.
 */
export const LatestObservationSummarySchema = z.object({
  status: z.enum(["live", "ttlReached", "unknown"]),
  currentLedger: z.number().int(),
  liveUntilLedgerSeq: z.number().int().nullable(),
  remainingLedgers: z.number().int().nullable(),
  durability: z.string(),
  confidence: z.string(),
  observedAt: z.string(),
});

/**
 * Watchlist entry record schema.
 */
export const WatchlistRecordSchema = z.object({
  id: z.number().int().positive(),
  network: z.string(),
  label: z.string(),
  keyType: z.enum(["instance", "contractCode", "contractData"]),
  keyXdr: z.string(),
  contractId: z.string().nullable().optional(),
  warningThresholdLedgers: z.number().int().nonnegative(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestObservation: LatestObservationSummarySchema.nullable().optional(),
});

export const WatchlistListResponseSchema = createApiResponseSchema(z.array(WatchlistRecordSchema));

/**
 * TTL observation record schema.
 */
export const TTLObservationRecordSchema = z.object({
  id: z.number().int().positive(),
  watchlistId: z.number().int().positive(),
  network: z.string(),
  currentLedger: z.number().int(),
  liveUntilLedgerSeq: z.number().int().nullable().optional(),
  remainingLedgers: z.number().int().nullable().optional(),
  lastModifiedLedgerSeq: z.number().int().nullable().optional(),
  status: z.enum(["live", "ttlReached", "unknown"]),
  durability: z.string(),
  confidence: z.string(),
  reason: z.string().nullable().optional(),
  observedAt: z.string(),
});

export const ObservationsListResponseSchema = createApiResponseSchema(
  z.array(TTLObservationRecordSchema),
);

/**
 * Alert record schema.
 */
export const AlertRecordSchema = z.object({
  id: z.number().int().positive(),
  watchlistId: z.number().int().positive().nullable().optional(),
  network: z.string(),
  category: z.enum(["low_ttl", "ttl_reached", "unknown_status", "rpc_failure", "config_failure"]),
  title: z.string(),
  message: z.string(),
  payloadJson: z.string().nullable().optional(),
  createdAt: z.string(),
  delivered: z.boolean(),
  deliveryStatus: z.enum(["pending", "delivered", "failed"]),
  deliveryAttempts: z.number().int().nonnegative(),
  lastDeliveryError: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
});

export const AlertsListResponseSchema = createApiResponseSchema(z.array(AlertRecordSchema));
