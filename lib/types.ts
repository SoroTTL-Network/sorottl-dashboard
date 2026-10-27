/**
 * Shared TypeScript domain models for the SoroTTL Dashboard.
 * These interfaces mirror the backend API contracts established in Phase 9.2.
 */

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  readonly pagination?: {
    readonly limit: number;
    readonly offset: number;
    readonly returned: number;
  };
  readonly timestamp: string;
}

export interface BackendHealthData {
  readonly status: "healthy" | "unhealthy";
  readonly uptimeSeconds: number;
  readonly network: string;
  readonly database: "connected" | "error";
  readonly rpc: "reachable" | "unreachable" | "unknown";
  readonly currentLedger: number | null;
  readonly keeperRunning: boolean;
}

export type WatchlistKeyType = "instance" | "contractCode" | "contractData";
export type TTLStatus = "live" | "ttlReached" | "unknown";

export interface LatestObservationSummary {
  readonly status: TTLStatus;
  readonly currentLedger: number;
  readonly liveUntilLedgerSeq: number | null;
  readonly remainingLedgers: number | null;
  readonly durability: string;
  readonly confidence: string;
  readonly observedAt: string;
}

export interface WatchlistRecord {
  readonly id: number;
  readonly network: string;
  readonly label: string;
  readonly keyType: WatchlistKeyType;
  readonly keyXdr: string;
  readonly contractId?: string | null;
  readonly warningThresholdLedgers: number;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestObservation?: LatestObservationSummary | null;
}

export interface TTLObservationRecord {
  readonly id: number;
  readonly watchlistId: number;
  readonly network: string;
  readonly currentLedger: number;
  readonly liveUntilLedgerSeq?: number | null;
  readonly remainingLedgers?: number | null;
  readonly lastModifiedLedgerSeq?: number | null;
  readonly status: TTLStatus;
  readonly durability: string;
  readonly confidence: string;
  readonly reason?: string | null;
  readonly observedAt: string;
}

export type AlertCategory =
  "low_ttl" | "ttl_reached" | "unknown_status" | "rpc_failure" | "config_failure";

export type AlertDeliveryStatus = "pending" | "delivered" | "failed";

export interface AlertRecord {
  readonly id: number;
  readonly watchlistId?: number | null;
  readonly network: string;
  readonly category: AlertCategory;
  readonly title: string;
  readonly message: string;
  readonly payloadJson?: string | null;
  readonly createdAt: string;
  readonly delivered: boolean;
  readonly deliveryStatus: AlertDeliveryStatus;
  readonly deliveryAttempts: number;
  readonly lastDeliveryError?: string | null;
  readonly deliveredAt?: string | null;
}
