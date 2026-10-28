"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import type { WatchlistRecord } from "@/lib/types";
import { formatDateTime, formatLedger, truncateAddress } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorDisplay } from "@/components/ui/error-display";
import { ChevronLeft, ChevronRight, Eye, Code, Layers, RotateCcw } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistRecord[]>([]);
  const [network, setNetwork] = useState<string>("");
  const [enabledOnly, setEnabledOnly] = useState<string>("");
  const [limit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const fetchWatchlist = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);

    try {
      const res = await apiClient.getWatchlist({
        ...(network ? { network: network as "testnet" | "mainnet" } : {}),
        ...(enabledOnly !== "" ? { enabledOnly: enabledOnly === "true" } : {}),
        limit,
        offset,
      });

      if (res.success && res.data) {
        setItems(res.data);
        setHasMore(res.data.length === limit);
        setLastUpdated(formatDateTime(res.timestamp));
        setError(null);
      } else {
        setError(res.error?.message || "Failed to load watchlist");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load watchlist";
      setError(message);
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, [network, enabledOnly, limit, offset]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contract Watchlist"
        description="Smart contracts, Wasm bytecode, and contract data storage entries tracked by SoroTTL."
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        onRefresh={fetchWatchlist}
        badge={
          <span className="text-xs font-mono text-slate-400">
            {items.length} {items.length === 1 ? "entry" : "entries"} loaded
          </span>
        }
      />

      {error && (
        <ErrorDisplay
          title="Watchlist Retrieval Error"
          message={error}
          isStale={items.length > 0}
          onRetry={fetchWatchlist}
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
            <span className="text-slate-400 font-mono">Status:</span>
            <select
              value={enabledOnly}
              onChange={(e) => {
                setEnabledOnly(e.target.value);
                setOffset(0);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            >
              <option value="">All Entries</option>
              <option value="true">Enabled Only</option>
              <option value="false">Disabled Only</option>
            </select>
          </label>

          {(network !== "" || enabledOnly !== "" || offset !== 0) && (
            <button
              type="button"
              onClick={() => {
                setNetwork("");
                setEnabledOnly("");
                setOffset(0);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white font-mono text-[11px]"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
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

      {/* Watchlist Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
          <thead className="bg-slate-950/80 font-mono text-slate-400 uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">
                Label & Network
              </th>
              <th scope="col" className="px-4 py-3">
                Key Type
              </th>
              <th scope="col" className="px-4 py-3">
                Contract ID
              </th>
              <th scope="col" className="px-4 py-3">
                Threshold
              </th>
              <th scope="col" className="px-4 py-3">
                Observation
              </th>
              <th scope="col" className="px-4 py-3">
                Remaining Ledgers
              </th>
              <th scope="col" className="px-4 py-3">
                State
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {items.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 font-mono">
                  No monitored contracts found matching current filters.
                </td>
              </tr>
            )}

            {items.map((item) => {
              const obs = item.latestObservation;
              const isExpanded = expandedId === item.id;

              return (
                <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{item.label}</div>
                    <div className="text-[11px] font-mono text-slate-400 uppercase">
                      {item.network}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 font-mono text-slate-300">
                      {item.keyType === "instance" && (
                        <Layers className="h-3.5 w-3.5 text-sky-400" />
                      )}
                      {item.keyType === "contractCode" && (
                        <Code className="h-3.5 w-3.5 text-indigo-400" />
                      )}
                      {item.keyType === "contractData" && (
                        <Eye className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      <span>{item.keyType}</span>
                    </span>
                  </td>

                  <td className="px-4 py-3 font-mono">
                    {item.contractId ? (
                      <div className="flex items-center gap-1.5">
                        <span title={item.contractId} className="text-sky-300">
                          {truncateAddress(item.contractId, 6)}
                        </span>
                        <CopyButton value={item.contractId} label="Contract ID" />
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono text-slate-300">
                    {formatLedger(item.warningThresholdLedgers)}
                  </td>

                  <td className="px-4 py-3">
                    {obs ? (
                      <StatusBadge status={obs.status} />
                    ) : (
                      <span className="text-slate-500 font-mono text-xs">No observation</span>
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono">
                    {obs && obs.remainingLedgers !== null && obs.remainingLedgers !== undefined ? (
                      <span
                        className={
                          obs.remainingLedgers <= item.warningThresholdLedgers
                            ? "text-rose-400 font-bold"
                            : "text-emerald-400"
                        }
                      >
                        {formatLedger(obs.remainingLedgers)}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          item.enabled ? "bg-emerald-400" : "bg-slate-600"
                        }`}
                        title={item.enabled ? "Monitoring enabled" : "Monitoring disabled"}
                      />
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                      >
                        {isExpanded ? "Hide XDR" : "XDR"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expanded Key XDR Inspector */}
      {expandedId !== null && (
        <Card className="p-4 space-y-2 border-sky-500/30">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-sky-400 font-semibold">Key XDR for Entry #{expandedId}</span>
              {items.find((i) => i.id === expandedId)?.keyXdr && (
                <CopyButton
                  value={items.find((i) => i.id === expandedId)!.keyXdr}
                  label="Key XDR"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpandedId(null)}
              className="text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <pre className="p-3 rounded bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto break-all">
            {items.find((i) => i.id === expandedId)?.keyXdr || "No XDR data"}
          </pre>
        </Card>
      )}
    </div>
  );
}
