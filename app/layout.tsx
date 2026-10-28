import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/navigation";

export const metadata: Metadata = {
  title: "SoroTTL — Stellar Soroban State TTL Monitor",
  description:
    "Read-only operational monitoring dashboard for Soroban smart contract state TTL and archival lifecycles.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-50 flex flex-col antialiased">
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold font-mono text-lg border border-sky-500/30">
                S
              </span>
              <div>
                <span className="font-semibold text-slate-100 tracking-tight">SoroTTL</span>
                <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  Monitor
                </span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <Navigation />
            </div>

            <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Read-Only</span>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-800 bg-slate-950 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4">
            SoroTTL Network &bull; Non-Custodial Stellar Soroban State TTL & Archival Monitor &bull;
            MIT Licensed
          </div>
        </footer>
      </body>
    </html>
  );
}
