import React from "react";
import { RefreshCw } from "lucide-react";

export interface PageHeaderProps {
  title: string;
  description: string;
  lastUpdated?: string | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  network?: string;
  badge?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  lastUpdated,
  isLoading,
  onRefresh,
  network,
  badge,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80 mb-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">{title}</h1>
          {network && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase">
              {network}
            </span>
          )}
          {badge}
        </div>
        <p className="text-sm text-slate-400">{description}</p>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono text-slate-400 self-start sm:self-auto">
        {lastUpdated && (
          <span className="hidden md:inline">
            Updated: <span className="text-slate-300">{lastUpdated}</span>
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            aria-label="Refresh data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-sky-400" : ""}`} />
            <span>Refresh</span>
          </button>
        )}
      </div>
    </div>
  );
}
