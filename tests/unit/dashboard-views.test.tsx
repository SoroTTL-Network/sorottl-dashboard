import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import OverviewPage from "../../app/page";
import WatchlistPage from "../../app/watchlist/page";
import ObservationsPage from "../../app/observations/page";
import AlertsPage from "../../app/alerts/page";
import { apiClient } from "../../lib/api-client";

describe("Milestone 3 — Operational Dashboard Views", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Overview Page", () => {
    it("renders healthy backend, database, and RPC status", async () => {
      vi.spyOn(apiClient, "getHealth").mockResolvedValue({
        success: true,
        data: {
          status: "healthy",
          uptimeSeconds: 3600,
          network: "testnet",
          database: "connected",
          rpc: "reachable",
          currentLedger: 5214820,
          keeperRunning: true,
        },
        timestamp: "2026-10-28T08:00:00.000Z",
      });

      render(<OverviewPage />);

      await waitFor(() => {
        expect(screen.getByText("System Overview")).toBeDefined();
        expect(screen.getByText("testnet")).toBeDefined();
        expect(screen.getByText("5,214,820")).toBeDefined();
        expect(screen.getByText("Uptime: 3600s")).toBeDefined();
        expect(screen.getByText("Observation Cycles Active")).toBeDefined();
      });
    });

    it("displays RPC degradation warning when RPC is unreachable while backend is healthy", async () => {
      vi.spyOn(apiClient, "getHealth").mockResolvedValue({
        success: true,
        data: {
          status: "healthy",
          uptimeSeconds: 3600,
          network: "testnet",
          database: "connected",
          rpc: "unreachable",
          currentLedger: null,
          keeperRunning: false,
        },
        timestamp: "2026-10-28T08:00:00.000Z",
      });

      render(<OverviewPage />);

      await waitFor(() => {
        expect(screen.getByText("RPC Connectivity Degraded")).toBeDefined();
        expect(screen.getByText("Unavailable")).toBeDefined();
      });
    });

    it("handles backend health fetch failure with clear error display", async () => {
      vi.spyOn(apiClient, "getHealth").mockRejectedValue(new Error("Connection refused"));

      render(<OverviewPage />);

      await waitFor(() => {
        expect(screen.getByText("Backend Unavailable")).toBeDefined();
        expect(screen.getByText("Connection refused")).toBeDefined();
      });
    });

    it("retains prior data as stale when manual refresh fails", async () => {
      let callCount = 0;
      vi.spyOn(apiClient, "getHealth").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            success: true,
            data: {
              status: "healthy",
              uptimeSeconds: 100,
              network: "testnet",
              database: "connected",
              rpc: "reachable",
              currentLedger: 100000,
              keeperRunning: true,
            },
            timestamp: "2026-10-28T08:00:00.000Z",
          };
        }
        throw new Error("Temporary network timeout");
      });

      render(<OverviewPage />);

      await waitFor(() => {
        expect(screen.getByText("100,000")).toBeDefined();
      });

      const refreshButton = screen.getByRole("button", { name: /Refresh/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(screen.getByText("Health Check Warning")).toBeDefined();
        expect(screen.getByText("Temporary network timeout")).toBeDefined();
        // Verifies previous data remains rendered
        expect(screen.getByText("100,000")).toBeDefined();
      });
    });
  });

  describe("Watchlist Page", () => {
    it("renders watchlist records with nullable latest observation and handles empty state", async () => {
      vi.spyOn(apiClient, "getWatchlist").mockResolvedValue({
        success: true,
        data: [
          {
            id: 1,
            network: "testnet",
            label: "AMM Pool Contract",
            keyType: "instance",
            keyXdr: "AAAA...",
            contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
            warningThresholdLedgers: 5000,
            enabled: true,
            createdAt: "2026-10-28T08:00:00.000Z",
            updatedAt: "2026-10-28T08:00:00.000Z",
            latestObservation: {
              status: "live",
              currentLedger: 5000000,
              liveUntilLedgerSeq: 5100000,
              remainingLedgers: 100000,
              durability: "persistent",
              confidence: "high",
              observedAt: "2026-10-28T08:00:00.000Z",
            },
          },
          {
            id: 2,
            network: "testnet",
            label: "Unobserved Contract",
            keyType: "contractData",
            keyXdr: "BBBB...",
            contractId: null,
            warningThresholdLedgers: 2000,
            enabled: false,
            createdAt: "2026-10-28T08:00:00.000Z",
            updatedAt: "2026-10-28T08:00:00.000Z",
            latestObservation: null,
          },
        ],
        timestamp: "2026-10-28T08:00:00.000Z",
      });

      render(<WatchlistPage />);

      await waitFor(() => {
        expect(screen.getByText("AMM Pool Contract")).toBeDefined();
        expect(screen.getByText("Unobserved Contract")).toBeDefined();
        expect(screen.getByText("100,000")).toBeDefined();
        expect(screen.getByText("No observation")).toBeDefined();
        expect(screen.getByText("2 entries loaded")).toBeDefined();
      });
    });

    it("displays empty state when no watchlist records are returned", async () => {
      vi.spyOn(apiClient, "getWatchlist").mockResolvedValue({
        success: true,
        data: [],
        timestamp: "2026-10-28T08:00:00.000Z",
      });

      render(<WatchlistPage />);

      await waitFor(() => {
        expect(
          screen.getByText("No monitored contracts found matching current filters."),
        ).toBeDefined();
        expect(screen.getByText("0 entries loaded")).toBeDefined();
      });
    });
  });

  describe("Observations Page", () => {
    it("renders observation records for live, ttlReached, and unknown states", async () => {
      vi.spyOn(apiClient, "getObservations").mockResolvedValue({
        success: true,
        data: [
          {
            id: 10,
            watchlistId: 1,
            network: "testnet",
            currentLedger: 5000000,
            liveUntilLedgerSeq: 5001000,
            remainingLedgers: 1000,
            lastModifiedLedgerSeq: 4900000,
            status: "live",
            durability: "persistent",
            confidence: "high",
            observedAt: "2026-10-28T08:00:00.000Z",
          },
          {
            id: 11,
            watchlistId: 2,
            network: "testnet",
            currentLedger: 5000000,
            liveUntilLedgerSeq: 5000000,
            remainingLedgers: 0,
            lastModifiedLedgerSeq: 4900000,
            status: "ttlReached",
            durability: "persistent",
            confidence: "high",
            observedAt: "2026-10-28T08:00:00.000Z",
          },
          {
            id: 12,
            watchlistId: 3,
            network: "testnet",
            currentLedger: 5000000,
            liveUntilLedgerSeq: null,
            remainingLedgers: null,
            lastModifiedLedgerSeq: null,
            status: "unknown",
            durability: "persistent",
            confidence: "low",
            reason: "RPC rate limited",
            observedAt: "2026-10-28T08:00:00.000Z",
          },
        ],
        timestamp: "2026-10-28T08:00:00.000Z",
      });

      render(<ObservationsPage />);

      await waitFor(() => {
        expect(screen.getByText("TTL Observations Timeline")).toBeDefined();
        expect(screen.getByText("Watchlist #1")).toBeDefined();
        expect(screen.getByText("Watchlist #2")).toBeDefined();
        expect(screen.getByText("Watchlist #3")).toBeDefined();
        expect(screen.getByText("RPC rate limited")).toBeDefined();
        expect(screen.getByText("3 records loaded")).toBeDefined();
      });
    });
  });

  describe("Alerts Page", () => {
    it("renders alert records across categories and delivery statuses", async () => {
      vi.spyOn(apiClient, "getAlerts").mockResolvedValue({
        success: true,
        data: [
          {
            id: 101,
            watchlistId: 1,
            network: "testnet",
            category: "low_ttl",
            title: "Entry Near Expiration",
            message: "Remaining ledgers below warning threshold",
            payloadJson: '{"remainingLedgers":500}',
            createdAt: "2026-10-28T08:00:00.000Z",
            delivered: true,
            deliveryStatus: "delivered",
            deliveryAttempts: 1,
            deliveredAt: "2026-10-28T08:01:00.000Z",
          },
          {
            id: 102,
            watchlistId: null,
            network: "testnet",
            category: "rpc_failure",
            title: "RPC Disconnected",
            message: "Soroban RPC probe failed",
            payloadJson: null,
            createdAt: "2026-10-28T08:00:00.000Z",
            delivered: false,
            deliveryStatus: "failed",
            deliveryAttempts: 3,
            lastDeliveryError: "HTTP 503 Provider Unavailable",
            deliveredAt: null,
          },
        ],
        timestamp: "2026-10-28T08:00:00.000Z",
      });

      render(<AlertsPage />);

      await waitFor(() => {
        expect(screen.getByText("Alert Dispatch Inspection")).toBeDefined();
        expect(screen.getByText("Entry Near Expiration")).toBeDefined();
        expect(screen.getByText("RPC Disconnected")).toBeDefined();
        expect(screen.getByText("Watchlist #1")).toBeDefined();
        expect(screen.getByText("System")).toBeDefined();
        expect(screen.getByText("2 alerts loaded")).toBeDefined();
      });
    });
  });
});
