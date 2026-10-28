import React from "react";

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  let badgeStyles = "bg-slate-800 text-slate-300 border-slate-700";
  let dotStyles = "bg-slate-400";
  let displayLabel = status;

  switch (status) {
    case "healthy":
    case "alive":
    case "ready":
    case "connected":
    case "reachable":
    case "live":
    case "delivered":
      badgeStyles = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      dotStyles = "bg-emerald-400";
      break;
    case "pending":
    case "warning":
      badgeStyles = "bg-amber-500/10 text-amber-400 border-amber-500/20";
      dotStyles = "bg-amber-400";
      break;
    case "unhealthy":
    case "error":
    case "unreachable":
    case "ttlReached":
    case "failed":
      badgeStyles = "bg-rose-500/10 text-rose-400 border-rose-500/20";
      dotStyles = "bg-rose-400";
      break;
    case "unknown":
      badgeStyles = "bg-slate-800/80 text-slate-400 border-slate-700";
      dotStyles = "bg-slate-400";
      break;
  }

  // Format label for display if camelCase
  if (status === "ttlReached") {
    displayLabel = "TTL Reached";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium font-mono border ${badgeStyles} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles}`} />
      <span className="capitalize">{displayLabel}</span>
    </span>
  );
}
