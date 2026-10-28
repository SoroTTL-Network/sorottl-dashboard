import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export interface ErrorDisplayProps {
  title?: string;
  message: string;
  isStale?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({
  title = "Failed to load data",
  message,
  isStale = false,
  onRetry,
  className = "",
}: ErrorDisplayProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        isStale
          ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
          : "bg-rose-500/10 border-rose-500/30 text-rose-200"
      } ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className={`h-5 w-5 shrink-0 mt-0.5 ${isStale ? "text-amber-400" : "text-rose-400"}`}
        />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-slate-100">{title}</p>
          <p className="mt-1 text-xs text-slate-300 leading-relaxed">{message}</p>
          {isStale && (
            <p className="mt-1.5 text-xs text-amber-300/80 font-mono">
              Displaying previous cached records. Data may be out of date.
            </p>
          )}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}
