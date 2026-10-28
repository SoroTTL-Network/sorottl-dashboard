"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import type { TTLObservationRecord } from "@/lib/types";
import { formatDateTime, formatLedger } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorDisplay } from "@/components/ui/error-display";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";

export default function ObservationsPage() {
  const [observations, setObservations] = useState<TTLObservationRecord[]>([]);
  const [network, setNetwork] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [watchlistId, setWatchlistId] = useState<string>("");
  const [limit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const fetchObservations = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);

    try {
      const parsedWlId = watchlistId ? Number(watchlistId) : undefined;
      const res = await apiClient.getObservations({
        ...(network ? { network: network as "testnet" | "mainnet" } : {}),
        ...(status ? { status: status as "live" | "ttlReached" | "unknown" } : {}),
        ...(parsedWlId && Number.isInteger(parsedWlId) && parsedWlId > 0
          ? { watchlistId: parsedWlId }
          : {}),
        limit,
        offset,
      });

      if (res.success && res.data) {
        setObservations(res.data);
        setHasMore(res.data.length === limit);
        setLastUpdated(formatDateTime(res.timestamp));
        setError(null);
      } else {
        setError(res.error?.message || "Failed to load observations");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load observations";
      setError(message);
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, [network, status, watchlistId, limit, offset]);

  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="TTL Observations Timeline"
        description="Historical and current Soroban ledger entry live-until boundaries and durability observations."
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        onRefresh={fetchObservations}
        badge={
          <span className="text-xs font-mono text-slate-400">
            {observations.length} {observations.length === 1 ? "record" : "records"} loaded
          </span>
        }
      />

      {error && (
        <ErrorDisplay
          title="Observations Retrieval Error"
          message={error}
          isStale={observations.length > 0}
          onRetry={fetchObservations}
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
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            >
              <option value="">All Statuses</option>
              <option value="live">Live</option>
              <option value="ttlReached">TTL Reached</option>
              <option value="unknown">Unknown</option>
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

      {/* Observations Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
          <thead className="bg-slate-950/80 font-mono text-slate-400 uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">
                ID & Watchlist
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                Current Ledger
              </th>
              <th scope="col" className="px-4 py-3">
                Live Until
              </th>
              <th scope="col" className="px-4 py-3">
                Remaining Ledgers
              </th>
              <th scope="col" className="px-4 py-3">
                Durability & Confidence
              </th>
              <th scope="col" className="px-4 py-3">
                Observed At
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {observations.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 font-mono">
                  No observations found matching current query parameters.
                </td>
              </tr>
            )}

            {observations.map((obs) => (
              <tr key={obs.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-mono">
                  <div className="font-semibold text-slate-200">#{obs.id}</div>
                  <div className="text-[11px] text-slate-400">Watchlist #{obs.watchlistId}</div>
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={obs.status} />
                  {obs.reason && (
                    <div
                      className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"
                      title={obs.reason}
                    >
                      <Info className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[150px]">{obs.reason}</span>
                    </div>
                  )}
                </td>

                <td className="px-4 py-3 font-mono text-slate-300">
                  {formatLedger(obs.currentLedger)}
                </td>

                <td className="px-4 py-3 font-mono text-slate-300">
                  {obs.liveUntilLedgerSeq !== null && obs.liveUntilLedgerSeq !== undefined
                    ? formatLedger(obs.liveUntilLedgerSeq)
                    : "—"}
                </td>

                <td className="px-4 py-3 font-mono">
                  {obs.remainingLedgers !== null && obs.remainingLedgers !== undefined ? (
                    <span
                      className={
                        obs.remainingLedgers <= 0
                          ? "text-rose-400 font-bold"
                          : obs.remainingLedgers < 1000
                            ? "text-amber-400 font-semibold"
                            : "text-emerald-400"
                      }
                    >
                      {formatLedger(obs.remainingLedgers)}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>

                <td className="px-4 py-3 font-mono text-slate-300">
                  <div className="capitalize">{obs.durability}</div>
                  <div className="text-[11px] text-slate-500 capitalize">
                    {obs.confidence} confidence
                  </div>
                </td>

                <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                  {formatDateTime(obs.observedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
