# SoroTTL Dashboard

The official read-only operational monitoring dashboard for the [SoroTTL Network](https://github.com/SoroTTL-Network), providing real-time visibility into Stellar Soroban smart contract state Time-To-Live (TTL) boundaries, state archival events, and keeper notification health.

## Overview

Soroban state entries require periodic TTL lifecycle extension to avoid entry expiration or state archival. The SoroTTL Dashboard provides:

- **Service Health & Uptime:** Live inspection of the SoroTTL keeper daemon, SQLite database status, and upstream Stellar RPC reachability.
- **Contract Watchlists:** Monitored smart contract instances, Wasm bytecode, and persistent contract data entries with live remaining-ledger counts.
- **TTL Observations Timeline:** Historical ledger sequence boundaries, remaining ledgers, and confidence classifications.
- **Alert Dispatch Monitoring:** Real-time visibility into keeper-generated alerts and webhook delivery attempts.

## Security Boundary & Invariants

- **Strictly Read-Only:** The dashboard never accepts private keys, never connects to browser wallets, and never signs or submits Stellar transactions.
- **Zero Secret Exposure:** Backend authentication credentials (`SOROTTL_BACKEND_AUTH_TOKEN`) are restricted to server-side components and proxy routes; secrets are **never** prefixed with `NEXT_PUBLIC_` or exposed in client bundles.
- **Non-Custodial Architecture:** All state evaluation and persistence is managed independently by `sorottl-backend`.

## Technology Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Language:** TypeScript (Strict mode enabled)
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest + React Testing Library + jsdom
- **Icons:** Lucide React

## Getting Started

### Prerequisites

- Node.js `>=20.0.0`
- A running instance of `sorottl-backend` (optional for local development of static views)

### Installation

```bash
# Clone the repository
git clone https://github.com/SoroTTL-Network/sorottl-dashboard.git
cd sorottl-dashboard

# Install dependencies
npm ci
```

### Configuration

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

Configure your environment settings:

```env
# Backend API URL (server-side only)
SOROTTL_BACKEND_URL=http://127.0.0.1:8080

# Optional Bearer Token if backend authentication is configured
# SOROTTL_BACKEND_AUTH_TOKEN=your-token-here

# Public settings
NEXT_PUBLIC_APP_NAME="SoroTTL Dashboard"
NEXT_PUBLIC_DEFAULT_NETWORK=testnet
NEXT_PUBLIC_POLL_INTERVAL_MS=10000
```

### Running Locally

```bash
# Start development server
npm run dev

# Open in browser
open http://localhost:3000
```

### Quality Gates

```bash
# Check code formatting
npm run format:check

# Run linter
npm run lint

# TypeScript strict typecheck
npm run typecheck

# Run unit tests
npm test

# Build production bundle
npm run build
```

## License

This project is licensed under the [MIT License](./LICENSE) &copy; 2026 SoroTTL-Network.
