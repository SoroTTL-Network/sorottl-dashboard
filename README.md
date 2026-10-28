# SoroTTL Dashboard

The official read-only operational monitoring dashboard for the [SoroTTL Network](https://github.com/SoroTTL-Network), providing real-time visibility into Stellar Soroban smart contract state Time-To-Live (TTL) boundaries, state archival events, and keeper notification health.

## Overview

Soroban state entries require periodic TTL lifecycle extension to avoid entry expiration or state archival. The SoroTTL Dashboard provides:

- **Service Health & Uptime:** Live inspection of the SoroTTL keeper daemon, SQLite database status, and upstream Stellar RPC reachability.
- **Contract Watchlists:** Monitored smart contract instances, Wasm bytecode, and persistent contract data entries with live remaining-ledger counts.
- **TTL Observations Timeline:** Historical ledger sequence boundaries, remaining ledgers, and confidence classifications.
- **Alert Dispatch Monitoring:** Real-time visibility into keeper-generated alerts and webhook delivery attempts.

## Implemented Dashboard Views

The SoroTTL Dashboard provides four dedicated, read-only monitoring pages:

1. **System Overview (`/`):**
   - Live backend health status, system uptime, and configured network (`testnet` / `mainnet`).
   - SQLite WAL database connectivity.
   - Upstream Stellar Soroban RPC reachability with the latest observed ledger sequence.
   - Keeper daemon execution status (`Observation Cycles Active`).
   - Explicit RPC degradation warnings (distinguishing upstream RPC node issues from local backend health).

2. **Contract Watchlist (`/watchlist`):**
   - Monitored smart contract instances, Wasm bytecode, and contract data storage entries.
   - Network filtering (`testnet`, `mainnet`) and enabled/disabled status filtering.
   - Live remaining-ledger calculations, warning threshold comparison, and entry status badges (`live`, `ttlReached`, `unknown`).
   - On-demand inspection drawer for raw key XDR data.
   - Safe pagination (`offset`, `limit`) without fabricating global totals.

3. **TTL Observations Timeline (`/observations`):**
   - Historical and latest TTL observation records per contract or ledger key.
   - Status filtering (`live`, `ttlReached`, `unknown`), network filtering, and specific `watchlistId` inspection.
   - Real-time remaining ledger countdowns, live-until sequence boundaries, and durability/confidence ratings.

4. **Alert Dispatch Inspection (`/alerts`):**
   - Keeper-emitted alert log for low-TTL warnings, reached boundaries, RPC errors, and configuration failures.
   - Filter by alert category (`low_ttl`, `ttl_reached`, `unknown_status`, `rpc_failure`, `config_failure`) and delivery status (`pending`, `delivered`, `failed`).
   - Webhook delivery attempt counters, delivery timestamps, and sanitized error inspection.

## Architecture & Secure Backend Integration

The SoroTTL Dashboard uses a secure internal Next.js server proxy (`/api/backend/[...path]`) to communicate with the `sorottl-backend` HTTP API:

```text
Browser / Client Views
       │
       ▼ (GET/HEAD only)
Next.js Server Proxy (/api/backend/...)
  ├── Enforces route allowlist (/health, /api/v1/watchlist, /api/v1/observations, /api/v1/alerts)
  ├── Rejects directory traversals and disallowed query parameters
  ├── Strips incoming browser Authorization headers
  ├── Injects server-side SOROTTL_BACKEND_AUTH_TOKEN
  ├── Enforces Cache-Control: no-store
  └── Enforces 10s request timeout & 2MB response size limit
       │
       ▼
SoroTTL Backend (http://127.0.0.1:8080)
```

- **Frontend Client (`lib/api-client.ts`):** Strictly typed API client consuming the internal proxy, validating responses with runtime Zod schemas (`lib/schemas.ts`), supporting `AbortSignal` cancellation, and normalizing errors into safe typed error classes (`lib/errors.ts`).
- **Zero Credentials in Browser:** The browser never directly contacts `sorottl-backend` or stores backend bearer tokens.

## Security Boundary & Deployment Boundary

- **Strictly Read-Only:** The dashboard never accepts private keys, never connects to browser wallets, and never signs or submits Stellar transactions.
- **Backend Authentication vs. Visitor Access Control:**
  - The proxy's backend token (`SOROTTL_BACKEND_AUTH_TOKEN`) exclusively authenticates the **dashboard server to the backend**.
  - The proxy does **NOT** authenticate or gate dashboard visitors.
  - Public or untrusted deployments requiring restricted access must place the dashboard behind appropriate network boundaries (e.g., VPN, internal subnet, or reverse proxy with authentication/SSO).
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
