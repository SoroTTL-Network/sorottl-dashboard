"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Eye, Clock, Bell } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/observations", label: "TTL Observations", icon: Clock },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 sm:gap-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
              isActive
                ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
