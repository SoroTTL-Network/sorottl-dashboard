"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import type { AlertRecord } from "@/lib/types";
import { formatDateTime } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorDisplay } from "@/components/ui/error-display";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [network, setNetwork] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [deliveryStatus, setDeliveryStatus] = useState<string>("");
  const [watchlistId, setWatchlistId] = useState<string>("");
  const [limit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlertId, setExpandedAlertId] = useState<number | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const fetchAlerts = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);

    try {
      const parsedWlId = watchlistId ? Number(watchlistId) : undefined;
      const res = await apiClient.getAlerts({
        ...(network ? { network: network as "testnet" | "mainnet" } : {}),
        ...(category
          ? {
              category: category as
                "low_ttl" | "ttl_reached" | "unknown_status" | "rpc_failure" | "config_failure",
            }
          : {}),
        ...(deliveryStatus
          ? { deliveryStatus: deliveryStatus as "pending" | "delivered" | "failed" }
          : {}),
        ...(parsedWlId && Number.isInteger(parsedWlId) && parsedWlId > 0
          ? { watchlistId: parsedWlId }
          : {}),
        limit,
        offset,
      });

      if (res.success && res.data) {
        setAlerts(res.data);
        setHasMore(res.data.length === limit);
        setLastUpdated(formatDateTime(res.timestamp));
        setError(null);
      } else {
        setError(res.error?.message || "Failed to load alerts");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load alerts";
      setError(message);
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, [network, category, deliveryStatus, watchlistId, limit, offset]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const toggleExpand = (id: number) => {
    setExpandedAlertId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Dispatch Inspection"
        description="Keeper-emitted state warnings, low TTL thresholds, and webhook delivery status."
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        onRefresh={fetchAlerts}
        badge={
          <span className="text-xs font-mono text-slate-400">
            {alerts.length} {alerts.length === 1 ? "alert" : "alerts"} loaded
          </span>
        }
      />

      {error && (
        <ErrorDisplay
          title="Alert Retrieval Error"
          message={error}
          isStale={alerts.length > 0}
          onRetry={fetchAlerts}
        />
      )}

      {/* Filter Toolbar */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-slate-400 font-mono">Network:</span>
            <select
              value={network}
              onChange={(e) => {
                setNetwork(e.target.value);
                setOffset(0);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            >
              <option value="">All Networks</option>
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-400 font-mono">Category:</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setOffset(0);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            >
              <option value="">All Categories</option>
              <option value="low_ttl">Low TTL</option>
              <option value="ttl_reached">TTL Reached</option>
              <option value="unknown_status">Unknown Status</option>
              <option value="rpc_failure">RPC Failure</option>
              <option value="config_failure">Config Failure</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-400 font-mono">Delivery:</span>
            <select
              value={deliveryStatus}
              onChange={(e) => {
                setDeliveryStatus(e.target.value);
                setOffset(0);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-400 font-mono">Watchlist ID:</span>
            <input
              type="number"
              min="1"
              placeholder="e.g. 1"
              value={watchlistId}
              onChange={(e) => {
                setWatchlistId(e.target.value);
                setOffset(0);
              }}
              className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono text-xs"
            />
          </label>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <button
            type="button"
            disabled={offset === 0 || isLoading}
            onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-slate-400 px-1">Offset: {offset}</span>
          <button
            type="button"
            disabled={!hasMore || isLoading}
            onClick={() => setOffset((prev) => prev + limit)}
            className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </Card>

      {/* Alerts Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
          <thead className="bg-slate-950/80 font-mono text-slate-400 uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">
                Alert Title & Category
              </th>
              <th scope="col" className="px-4 py-3">
                Message
              </th>
              <th scope="col" className="px-4 py-3">
                Target
              </th>
              <th scope="col" className="px-4 py-3">
                Delivery Status
              </th>
              <th scope="col" className="px-4 py-3">
                Attempts
              </th>
              <th scope="col" className="px-4 py-3">
                Created
              </th>
              <th scope="col" className="px-4 py-3">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {alerts.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 font-mono">
                  No alerts found matching current filters.
                </td>
              </tr>
            )}

            {alerts.map((alert) => {
              const isExpanded = expandedAlertId === alert.id;

              return (
                <tr key={alert.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{alert.title}</div>
                    <div className="text-[11px] font-mono text-sky-400">
                      {alert.category} &bull; <span className="uppercase">{alert.network}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={alert.message}>
                    {alert.message}
                  </td>

                  <td className="px-4 py-3 font-mono text-slate-400">
                    {alert.watchlistId ? `Watchlist #${alert.watchlistId}` : "System"}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge status={alert.deliveryStatus} />
                    {alert.lastDeliveryError && (
                      <div
                        className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"
                        title={alert.lastDeliveryError}
                      >
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[120px]">Error</span>
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono text-slate-300">{alert.deliveryAttempts}</td>

                  <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                    {formatDateTime(alert.createdAt)}
                  </td>

                  <td className="px-4 py-3 font-mono">
                    <button
                      type="button"
                      onClick={() => toggleExpand(alert.id)}
                      className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                    >
                      {isExpanded ? "Hide" : "Inspect"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expanded Alert Detail Inspector */}
      {expandedAlertId !== null && (
        <Card className="p-4 space-y-3 border-sky-500/30">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-sky-400 font-semibold">
              Alert Payload Inspection #{expandedAlertId}
            </span>
            <button
              type="button"
              onClick={() => setExpandedAlertId(null)}
              className="text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
          {(() => {
            const selected = alerts.find((a) => a.id === expandedAlertId);
            return (
              <div className="space-y-2 text-xs font-mono">
                {selected?.lastDeliveryError && (
                  <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300">
                    <span className="font-bold">Last Delivery Error:</span>{" "}
                    {selected.lastDeliveryError}
                  </div>
                )}
                {selected?.deliveredAt && (
                  <div className="text-slate-400">
                    <span className="text-slate-300">Delivered At:</span>{" "}
                    {formatDateTime(selected.deliveredAt)}
                  </div>
                )}
                <pre className="p-3 rounded bg-slate-950 text-slate-300 overflow-x-auto break-all">
                  {selected?.payloadJson || "No JSON payload attached"}
                </pre>
              </div>
            );
          })()}
        </Card>
      )}
    </div>
  );
}
