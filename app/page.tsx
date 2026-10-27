import { Shield, Eye, Bell, Activity } from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero / Introduction */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 sm:p-10">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-mono">
            <span>Phase 9.3 — Frontend Foundation Established</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-100">
            Soroban State TTL Monitoring & Archival Inspection
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            SoroTTL delivers non-custodial, real-time observability over Stellar Soroban ledger
            entry lifecycles, warning thresholds, live-until sequence boundaries, and keeper
            automated alert dispatch.
          </p>
        </div>
      </section>

      {/* Architecture Highlights */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-3">
          <div className="h-10 w-10 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20">
            <Activity className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-200">System Health</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Monitors keeper daemon cycles, SQLite WAL database status, and upstream Stellar RPC
            reachability.
          </p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Eye className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-200">Watchlist Inspection</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Tracks contract instances, Wasm bytecode, and contract data storage durability
            categories.
          </p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
            <Bell className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-200">Alert Dispatch</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Idempotent webhook delivery tracking for low-TTL boundaries and state archival alerts.
          </p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-3">
          <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-200">Non-Custodial Design</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Zero private key ingestion, zero transaction signing. Strictly read-only observational
            queries.
          </p>
        </div>
      </section>

      {/* Milestone Roadmap Status Banner */}
      <section className="bg-slate-900/20 border border-slate-800/60 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300">Milestone 1 Baseline Ready</h2>
          <p className="text-xs text-slate-500 mt-1">
            Backend API integration and live data views will be established in Milestone 2.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded border border-slate-700/60">
          Next.js App Router &bull; Strict TypeScript &bull; Tailwind CSS
        </div>
      </section>
    </div>
  );
}
