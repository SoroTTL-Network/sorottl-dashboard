import { describe, it, expect } from "vitest";
import { formatLedger, truncateAddress, formatDateTime } from "../../lib/formatters";
import { getServerConfig, getClientConfig } from "../../lib/config";

describe("Formatters", () => {
  it("formats ledger sequence with commas", () => {
    expect(formatLedger(5214820)).toBe("5,214,820");
    expect(formatLedger(0)).toBe("0");
    expect(formatLedger(null)).toBe("—");
    expect(formatLedger(undefined)).toBe("—");
  });

  it("truncates address with ellipsis preserving start and end characters", () => {
    const contractId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    expect(truncateAddress(contractId, 6)).toBe("CDLZFC...HGCYSC");
    expect(truncateAddress("short")).toBe("short");
    expect(truncateAddress(null)).toBe("—");
  });

  it("formats date time or returns dash for invalid input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("invalid-date")).toBe("—");
    expect(formatDateTime("2026-10-27T12:00:00.000Z")).not.toBe("—");
  });
});

describe("Configuration Validation", () => {
  it("loads default client configuration safely", () => {
    const config = getClientConfig();
    expect(config.appName).toBe("SoroTTL Dashboard");
    expect(config.defaultNetwork).toBe("testnet");
    expect(config.pollIntervalMs).toBe(10000);
  });

  it("loads server configuration with default backend URL", () => {
    const config = getServerConfig();
    expect(config.backendUrl).toBe("http://127.0.0.1:8080");
    expect(config.backendAuthToken).toBeUndefined();
  });
});
