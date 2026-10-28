import { describe, it, expect, vi, beforeEach } from "vitest";
import { SoroTTLClient } from "../../lib/api-client";
import {
  ApiHttpError,
  ApiValidationError,
  ApiNetworkError,
  ApiClientError,
} from "../../lib/errors";

describe("SoroTTLClient API Integration", () => {
  let client: SoroTTLClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new SoroTTLClient({ baseUrl: "/api/backend", defaultTimeoutMs: 1000 });
  });

  it("fetches backend health and validates schema successfully", async () => {
    const mockHealthPayload = {
      success: true,
      data: {
        status: "healthy",
        uptimeSeconds: 1234,
        network: "testnet",
        database: "connected",
        rpc: "reachable",
        currentLedger: 5000000,
        keeperRunning: true,
      },
      timestamp: "2026-10-28T06:00:00.000Z",
    };

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(mockHealthPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await client.getHealth();
    expect(res.success).toBe(true);
    expect(res.data?.status).toBe("healthy");
    expect(res.data?.keeperRunning).toBe(true);
    expect(res.data?.currentLedger).toBe(5000000);
  });

  it("fetches liveness and readiness probes", async () => {
    const mockLive = {
      success: true,
      data: { status: "alive", uptimeSeconds: 500 },
      timestamp: "2026-10-28T06:00:00.000Z",
    };
    const mockReady = {
      success: true,
      data: { status: "ready", database: "connected" },
      timestamp: "2026-10-28T06:00:00.000Z",
    };

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockLive), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockReady), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const liveRes = await client.getHealthLive();
    expect(liveRes.data?.status).toBe("alive");

    const readyRes = await client.getHealthReady();
    expect(readyRes.data?.status).toBe("ready");
  });

  it("fetches watchlist records with query options and nullable fields", async () => {
    const mockWatchlistPayload = {
      success: true,
      data: [
        {
          id: 1,
          network: "testnet",
          label: "Test Contract",
          keyType: "instance",
          keyXdr: "AAAA...",
          contractId: null,
          warningThresholdLedgers: 1000,
          enabled: true,
          createdAt: "2026-10-27T10:00:00.000Z",
          updatedAt: "2026-10-27T10:00:00.000Z",
          latestObservation: null,
        },
      ],
      pagination: {
        limit: 10,
        offset: 0,
        returned: 1,
      },
      timestamp: "2026-10-28T06:00:00.000Z",
    };

    let requestedUrl = "";
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify(mockWatchlistPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await client.getWatchlist({ network: "testnet", limit: 10, offset: 0 });
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(1);
    expect(res.data?.[0]?.contractId).toBeNull();
    expect(res.data?.[0]?.latestObservation).toBeNull();
    expect(requestedUrl).toContain("network=testnet");
    expect(requestedUrl).toContain("limit=10");
  });

  it("fetches observations with nullable optional fields", async () => {
    const mockObservationsPayload = {
      success: true,
      data: [
        {
          id: 101,
          watchlistId: 1,
          network: "testnet",
          currentLedger: 5000000,
          liveUntilLedgerSeq: null,
          remainingLedgers: null,
          lastModifiedLedgerSeq: null,
          status: "unknown",
          durability: "persistent",
          confidence: "low",
          reason: "RPC timeout",
          observedAt: "2026-10-28T06:00:00.000Z",
        },
      ],
      pagination: {
        limit: 50,
        offset: 0,
        returned: 1,
      },
      timestamp: "2026-10-28T06:00:00.000Z",
    };

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockObservationsPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await client.getObservations({ watchlistId: 1 });
    expect(res.success).toBe(true);
    expect(res.data?.[0]?.status).toBe("unknown");
    expect(res.data?.[0]?.remainingLedgers).toBeNull();
  });

  it("fetches alerts matching all categories and delivery statuses", async () => {
    const mockAlertsPayload = {
      success: true,
      data: [
        {
          id: 201,
          watchlistId: null,
          network: "testnet",
          category: "rpc_failure",
          title: "RPC Disconnected",
          message: "RPC health check failed",
          payloadJson: null,
          createdAt: "2026-10-28T06:00:00.000Z",
          delivered: false,
          deliveryStatus: "failed",
          deliveryAttempts: 3,
          lastDeliveryError: "Connection timeout",
          deliveredAt: null,
        },
      ],
      pagination: {
        limit: 50,
        offset: 0,
        returned: 1,
      },
      timestamp: "2026-10-28T06:00:00.000Z",
    };

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockAlertsPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await client.getAlerts({ category: "rpc_failure" });
    expect(res.success).toBe(true);
    expect(res.data?.[0]?.deliveryStatus).toBe("failed");
    expect(res.data?.[0]?.watchlistId).toBeNull();
  });

  it("throws ApiValidationError when upstream returns malformed schema or invalid enum", async () => {
    const malformedPayload = {
      success: true,
      data: {
        status: "not_a_valid_health_status",
      },
      timestamp: "2026-10-28T06:00:00.000Z",
    };

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(malformedPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(client.getHealth()).rejects.toThrow(ApiValidationError);
  });

  it("throws ApiHttpError with backend code and message on error response", async () => {
    const errorPayload = {
      success: false,
      error: {
        code: "INVALID_QUERY_PARAMS",
        message: "limit exceeds 100",
      },
      timestamp: "2026-10-28T06:00:00.000Z",
    };

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(errorPayload), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    });

    try {
      await client.getWatchlist({ limit: 500 });
      expect.fail("Should have thrown ApiHttpError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiHttpError);
      const httpErr = err as ApiHttpError;
      expect(httpErr.status).toBe(400);
      expect(httpErr.backendCode).toBe("INVALID_QUERY_PARAMS");
      expect(httpErr.message).toBe("limit exceeds 100");
    }
  });

  it("handles abort signal cancellation cleanly", async () => {
    const controller = new AbortController();
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        }
      });
    });

    const promise = client.getHealth({ signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow(ApiClientError);
    await expect(promise).rejects.toMatchObject({
      code: "REQUEST_ABORTED",
    });
  });

  it("normalizes network failures into ApiNetworkError", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(client.getHealth()).rejects.toThrow(ApiNetworkError);
  });
});
