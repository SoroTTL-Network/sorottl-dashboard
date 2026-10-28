"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = "Copy", className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`${label}: ${value}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 ${className}`}
      title={copied ? "Copied to clipboard" : `Copy ${label}`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" />
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
