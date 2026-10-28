"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowRight, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawReturnUrl = searchParams.get("returnUrl") || "/";
  // Enforce relative path to prevent open redirect vulnerabilities
  const returnUrl =
    rawReturnUrl.startsWith("/") && !rawReturnUrl.startsWith("//") ? rawReturnUrl : "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Authentication failed. Check operator password.");
        setIsLoading(false);
        return;
      }

      router.push(returnUrl);
      router.refresh();
    } catch {
      setError("Network failure while verifying password");
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-md w-full p-8 space-y-6 border-slate-800 bg-slate-900/60 shadow-xl">
      <div className="space-y-2 text-center">
        <div className="h-12 w-12 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto border border-sky-500/20">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">
          Private Dashboard Access
        </h1>
        <p className="text-xs text-slate-400">
          This SoroTTL monitoring instance is operating in private mode. Please provide the operator
          passphrase to proceed.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="operator-password"
            className="text-xs font-mono text-slate-300 font-medium"
          >
            Operator Password
          </label>
          <input
            id="operator-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            disabled={isLoading}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !password}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        >
          <span>{isLoading ? "Verifying..." : "Access Dashboard"}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <div className="pt-2 border-t border-slate-800/80 text-center text-[11px] text-slate-500 font-mono">
        Strictly Read-Only &bull; Non-Custodial Monitor
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Suspense
        fallback={<div className="text-xs font-mono text-slate-500">Loading access gate...</div>}
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
