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

## Security & Visitor Access-Control Architecture

The SoroTTL Dashboard provides two distinct authentication boundaries:

1. **Backend Authentication (Dashboard Server &rarr; SoroTTL Backend):**
   - Configured via `SOROTTL_BACKEND_AUTH_TOKEN`.
   - Used exclusively by the internal server proxy (`/api/backend/...`) to authenticate against protected backend endpoints.
   - Credentials remain strictly server-side and are **never** delivered to client bundles or browser logs.

2. **Visitor Access Control (Browser Visitor &rarr; Dashboard Server):**
   - Configured via `SOROTTL_ACCESS_MODE` (`public` or `private`).
   - **Production Fail-Closed Guarantee:** In production (`NODE_ENV=production`), `SOROTTL_ACCESS_MODE` **must be explicitly specified** (`public` or `private`). Omitting it throws a fatal configuration error at startup (`CONFIG_ERROR`), preventing accidental public exposure of private instances. In local `development` or `test`, it defaults to `public` for frictionless local development. Invalid values are strictly rejected.
   - In **`public` mode**, the dashboard is accessible for open community monitoring or public status portals.
   - In **`private` mode**, visitor authentication is required. Server middleware intercepts all navigation routes and internal proxy endpoints, requiring the operator passphrase (`SOROTTL_ACCESS_PASSWORD`, minimum 8 characters).
   - **Independent Cryptographic Session Secret (`SOROTTL_SESSION_SECRET`):** Session tokens are signed using HMAC-SHA256 with an independent, dedicated signing key of at least 32 characters. In production private mode, `SOROTTL_SESSION_SECRET` is strictly mandatory; tokens are **never derived from the operator password**. Rotating this secret invalidates all issued session tokens across instances immediately.
   - **Multi-Instance Session Uniformity:** In distributed deployments, ensure all dashboard replicas share the identical `SOROTTL_SESSION_SECRET` so authenticated visitors remain valid across server instances.
   - **Cryptographic HMAC-SHA256 Sessions:** Valid visitor sessions receive a tamper-proof signed session token cookie (`sorottl_access_token`) featuring a 24-hour expiration lifecycle. The cookie is configured with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` (in HTTPS production). The raw operator password is **never stored in cookies**.
   - **Immediate Session Revocation (Process Scope):** Sessions can be revoked immediately via `POST /api/auth/logout`. In addition to clearing the client cookie, the server records the session identifier in its in-memory revocation index, terminating access even if a raw token copy is retained on that process. In distributed multi-replica deployments without centralized cache storage, revocation is guaranteed per process, while the signed token's 24-hour expiration bounds validity across remaining replicas.
   - **Brute-Force & Flood Protection:** The `/api/auth/login` endpoint features request size bounding (4KB maximum payload enforced via Content-Length and stream limits), bounded in-memory attempt tracking (5 failed attempts locks out for 5 minutes), constant-time credential comparison, and timing-safe token verification.
   - **Trusted Proxy Header Handling (`SOROTTL_TRUST_PROXY`):** Set to `false` by default. When `false`, client IP headers are ignored to prevent attackers from rotating spoofed IP headers to evade rate limits. Only set `SOROTTL_TRUST_PROXY=true` if an upstream ingress or reverse proxy (e.g. Nginx, Cloudflare, AWS ALB) is explicitly configured to strip incoming client `X-Forwarded-For` and `X-Real-IP` headers and overwrite them with the verified client connection address. If the ingress does not overwrite these headers, leave `SOROTTL_TRUST_PROXY=false`.
   - **Machine-to-Machine API Access:** Automated scrapers or monitoring scripts in private mode can authenticate by sending the `x-sorottl-access-password` HTTP header strictly on `/api/backend/*` proxy routes over HTTPS. Browser page routes and internal auth routes ignore this header to enforce session cookie integrity.

## Security Boundary & Deployment Boundary

- **Strictly Read-Only:** The dashboard never accepts private keys, never connects to browser wallets, and never signs or submits Stellar transactions.
- **Production Readiness Probe:** Process readiness is available at `GET /api/health/ready`. Orchestrators (Kubernetes/Docker) receive HTTP 200 when configuration is valid, or HTTP 500 when mandatory variables are missing.
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
