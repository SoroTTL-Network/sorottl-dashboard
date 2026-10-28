"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import type { BackendHealthData, WatchlistRecord, AlertRecord } from "@/lib/types";
import { formatDateTime, formatLedger } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorDisplay } from "@/components/ui/error-display";
import {
  Server,
  Database,
  Globe,
  Cpu,
  AlertTriangle,
  ShieldCheck,
  Eye,
  Bell,
  ArrowRight,
} from "lucide-react";

export default function OverviewPage() {
  const [health, setHealth] = useState<BackendHealthData | null>(null);
  const [watchlistSummary, setWatchlistSummary] = useState<{
    loaded: number;
    atRisk: number;
  } | null>(null);
  const [alertSummary, setAlertSummary] = useState<{
    loaded: number;
    failedDelivery: number;
  } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const fetchOverviewData = useCallback(async (_isManual = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);

    try {
      const [healthRes, wlRes, alertsRes] = await Promise.allSettled([
        apiClient.getHealth(),
        apiClient.getWatchlist({ limit: 50 }),
        apiClient.getAlerts({ limit: 50 }),
      ]);

      if (healthRes.status === "fulfilled" && healthRes.value.success && healthRes.value.data) {
        setHealth(healthRes.value.data);
        setLastUpdated(formatDateTime(healthRes.value.timestamp));
        setError(null);
      } else {
        const errMsg =
          healthRes.status === "fulfilled"
            ? healthRes.value.error?.message || "Health check returned unsuccessful"
            : (healthRes.reason as Error)?.message || "Failed to reach backend";
        setError(errMsg);
      }

      if (wlRes.status === "fulfilled" && wlRes.value.success && wlRes.value.data) {
        const records: WatchlistRecord[] = wlRes.value.data;
        const atRiskCount = records.filter(
          (r) =>
            r.latestObservation?.remainingLedgers !== null &&
            r.latestObservation?.remainingLedgers !== undefined &&
            r.latestObservation.remainingLedgers <= r.warningThresholdLedgers,
        ).length;
        setWatchlistSummary({
          loaded: records.length,
          atRisk: atRiskCount,
        });
      }

      if (alertsRes.status === "fulfilled" && alertsRes.value.success && alertsRes.value.data) {
        const alerts: AlertRecord[] = alertsRes.value.data;
        const failedCount = alerts.filter((a) => a.deliveryStatus === "failed").length;
        setAlertSummary({
          loaded: alerts.length,
          failedDelivery: failedCount,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect to backend";
      setError(message);
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();

    // Conservative polling interval: 30 seconds
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchOverviewData();
      }
    }, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchOverviewData();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchOverviewData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Overview"
        description="Real-time operational health, upstream RPC connectivity, and keeper daemon status."
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        onRefresh={() => fetchOverviewData(true)}
        network={health?.network}
      />

      {error && (
        <ErrorDisplay
          title={health ? "Health Check Warning" : "Backend Unavailable"}
          message={error}
          isStale={!!health}
          onRetry={() => fetchOverviewData(true)}
        />
      )}

      {/* Main Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Overall Status */}
        <Card className="flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Backend API</span>
            <Server className="h-4 w-4 text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <StatusBadge status={health?.status ?? (isLoading ? "unknown" : "unhealthy")} />
            </div>
            <p className="text-xs text-slate-400 mt-2 font-mono">
              Uptime: {health?.uptimeSeconds !== undefined ? `${health.uptimeSeconds}s` : "—"}
            </p>
          </div>
        </Card>

        {/* RPC Reachability */}
        <Card className="flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Stellar Soroban RPC</span>
            <Globe className="h-4 w-4 text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <StatusBadge status={health?.rpc ?? (isLoading ? "unknown" : "unreachable")} />
            </div>
            <p className="text-xs text-slate-400 mt-2 font-mono">
              Ledger:{" "}
              <span className="text-slate-200">
                {health?.currentLedger !== null && health?.currentLedger !== undefined
                  ? formatLedger(health.currentLedger)
                  : "Unavailable"}
              </span>
            </p>
          </div>
        </Card>

        {/* Database Status */}
        <Card className="flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">SQLite Storage</span>
            <Database className="h-4 w-4 text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <StatusBadge status={health?.database ?? (isLoading ? "unknown" : "error")} />
            </div>
            <p className="text-xs text-slate-400 mt-2 font-mono">WAL Journal Mode Active</p>
          </div>
        </Card>

        {/* Keeper Status */}
        <Card className="flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Keeper Daemon</span>
            <Cpu className="h-4 w-4 text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <StatusBadge status={health?.keeperRunning ? "healthy" : "unknown"} />
            </div>
            <p className="text-xs text-slate-400 mt-2 font-mono">
              {health?.keeperRunning ? "Observation Cycles Active" : "Daemon Inactive"}
            </p>
          </div>
        </Card>
      </div>

      {/* Degradation Warning if RPC is down but backend is up */}
      {health?.status === "healthy" && health.rpc === "unreachable" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-slate-100">RPC Connectivity Degraded</p>
              <p className="mt-1 text-xs text-slate-300">
                The SoroTTL backend is running normally, but the upstream Stellar Soroban RPC node
                is currently unreachable. Live ledger sequences and new TTL observations cannot be
                fetched until RPC connectivity is restored.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Activity Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-sky-400" />
              <h2 className="text-sm font-semibold text-slate-200">Monitored Watchlist Sample</h2>
            </div>
            <Link
              href="/watchlist"
              className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-mono"
            >
              <span>View Watchlist</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold font-mono text-slate-100">
              {watchlistSummary !== null ? `${watchlistSummary.loaded} loaded` : "—"}
            </div>
            <p className="text-xs text-slate-400">
              {watchlistSummary !== null
                ? `${watchlistSummary.atRisk} entries at or below configured warning threshold in loaded sample`
                : "Awaiting watchlist retrieval"}
            </p>
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-200">Recent Alerts Sample</h2>
            </div>
            <Link
              href="/alerts"
              className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-mono"
            >
              <span>View Alerts</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold font-mono text-slate-100">
              {alertSummary !== null ? `${alertSummary.loaded} loaded` : "—"}
            </div>
            <p className="text-xs text-slate-400">
              {alertSummary !== null
                ? `${alertSummary.failedDelivery} webhook deliveries marked failed in loaded sample`
                : "Awaiting alert retrieval"}
            </p>
          </div>
        </Card>
      </div>

      {/* Observational Policy Information */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            Non-Custodial Monitoring Boundary
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The SoroTTL monitoring daemon is strictly observational. It periodically scans Soroban
          ledger keys, evaluates remaining ledgers against configured warning thresholds, and emits
          alerts. It does not ingest private keys, does not sign transactions, and does not perform
          automated state restorations or fee bumps.
        </p>
      </Card>
    </div>
  );
}
