# SoroTTL Dashboard — Vercel Production Deployment Readiness Report

**Repository**: `SoroTTL-Network/sorottl-dashboard`  
**Deployment Platform**: Vercel  
**Upstream Backend Target**: SoroTTL Backend on Render (e.g. `https://sorottl-backend.onrender.com`)  
**Verdict**: **READY FOR VERCEL DEPLOYMENT** (Zero code changes required)

---

## 1. Overall Readiness Verdict

The SoroTTL Dashboard is **100% production-ready for deployment to Vercel**:
- **Framework Compliance**: Built on standard Next.js (App Router) with React 19 and Tailwind CSS v4.
- **Stateless Serverless Execution**: Contains zero local filesystem storage assumptions, embedded SQLite, or long-running daemon requirements. All persistent state is delegated to the Render-hosted `sorottl-backend`.
- **Security Boundary**: Server-side proxy (`/api/backend/[...path]`) isolates the Render backend credentials from the browser. No backend tokens are prefixed with `NEXT_PUBLIC_` or bundled in client code.
- **Fail-Closed Private Mode**: In production, `SOROTTL_ACCESS_MODE` strictly requires an explicit value (`public` or `private`). If set to `private`, `SOROTTL_ACCESS_PASSWORD` (&ge;8 chars) and `SOROTTL_SESSION_SECRET` (&ge;32 chars) are strictly validated at process initialization.
- **All Quality Gates Green**: Prettier, ESLint, TypeScript typechecking, Vitest suite (76 tests), and Next.js production build all passed with zero errors or warnings.

---

## 2. Exact Vercel Environment Variables Table

Configure the following environment variables in the **Vercel Project Settings &rarr; Environment Variables** (target: `Production` and `Preview`):

| Variable Name | Required / Optional | Sensitive? | Purpose | Format / Validation Constraints |
| :--- | :---: | :---: | :--- | :--- |
| `SOROTTL_BACKEND_URL` | **Required** | No | Base URL of the Render-hosted SoroTTL backend | Valid `https://` URL (e.g. `https://sorottl-backend.onrender.com`). Must have a hostname; no credentials (`user:pass@`) allowed. |
| `SOROTTL_BACKEND_AUTH_TOKEN` | **Required** *(if enabled on Render)* | **Yes (Secret)** | Bearer authentication token used by Next.js server proxy to query Render backend | String matching `SOROTTL_API_AUTH_TOKEN` generated on Render. Injected strictly server-side. |
| `SOROTTL_ACCESS_MODE` | **Required in Production** | No | Visitor dashboard access mode | Must be explicitly set to either `public` or `private`. In production, omitting this variable throws a fatal `CONFIG_ERROR` to prevent accidental public exposure. |
| `SOROTTL_ACCESS_PASSWORD` | **Required if `SOROTTL_ACCESS_MODE=private`** | **Yes (Secret)** | Pre-shared operator password required for visitors to access the dashboard | Minimum 8 characters. Compared using timing-safe comparison. |
| `SOROTTL_SESSION_SECRET` | **Required if `SOROTTL_ACCESS_MODE=private`** | **Yes (Secret)** | Independent cryptographic secret for HMAC-SHA256 session token signing | Minimum 32 characters. Independent of the operator password. Shared across all Vercel serverless function instances. |
| `SOROTTL_TRUST_PROXY` | Optional | No | Whether to trust client IP headers (`x-forwarded-for`) for login rate limiting | Boolean (`true` or `false`). Set to `true` on Vercel since Vercel's edge network securely populates `x-forwarded-for` and `x-real-ip`. Defaults to `false`. |
| `NEXT_PUBLIC_APP_NAME` | Optional | No | Public branding title displayed in browser title and navigation bar | String (default: `"SoroTTL Dashboard"`). Safe for client bundles. |
| `NEXT_PUBLIC_DEFAULT_NETWORK` | Optional | No | Default active network for watchlist and observation filters | `"testnet"` or `"mainnet"` (default: `"testnet"`). Safe for client bundles. |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | Optional | No | Polling cadence for client data refreshing in milliseconds | Positive integer (default: `10000` = 10s). Safe for client bundles. |

---

## 3. Backend Integration & Security Boundary Verification

1. **Render Backend URL Environment Variable**:
   - Identified as `SOROTTL_BACKEND_URL`.
   - Validated in [`lib/config.ts`](file:///C:/ReactApps/sorottl-dashboard/lib/config.ts#L38-L45) with Zod: strictly enforces valid `http:` or `https:` protocol and rejects embedded URL credentials (`user:pass@`).
2. **Backend Authentication Token Variable**:
   - Identified as `SOROTTL_BACKEND_AUTH_TOKEN`.
   - Populated from the Render web service's auto-generated `SOROTTL_API_AUTH_TOKEN`.
3. **Server-Side Injection**:
   - In [`app/api/backend/[...path]/route.ts`](file:///C:/ReactApps/sorottl-dashboard/app/api/backend/[...path]/route.ts#L280-L282), the proxy route strips any client-provided `Authorization` header and injects `Authorization: Bearer ${serverConfig.backendAuthToken}` server-side before issuing the `fetch` to Render.
4. **Zero Client Secret Exposure**:
   - No sensitive variables are prefixed with `NEXT_PUBLIC_`.
   - The browser communicates solely with internal relative paths (`/api/backend/health`, `/api/backend/api/v1/watchlist`, etc.). Browser network inspector only displays the Next.js origin; Render tokens and addresses remain invisible.
5. **Request Protection**:
   - Strict route allowlist (`ALLOWED_ROUTES`: `/health`, `/health/live`, `/health/ready`, `/api/v1/watchlist`, `/api/v1/observations`, `/api/v1/alerts`).
   - Rejects directory traversals and nested percent-encodings.
   - Enforces 10-second request timeout and 2MB maximum response size limit.
   - Sets `Cache-Control: no-store, no-cache, must-revalidate` on all API responses.

---

## 4. Visitor Access Control & Authentication Verification

1. **Production Fail-Closed Enforcement**:
   - [`lib/config.ts`](file:///C:/ReactApps/sorottl-dashboard/lib/config.ts#L91-L98) explicitly checks:
     ```typescript
     if (data.nodeEnv === "production" && !data.accessMode) {
       ctx.addIssue({
         code: z.ZodIssueCode.custom,
         path: ["accessMode"],
         message: "SOROTTL_ACCESS_MODE must be explicitly defined as 'public' or 'private' in production environments...",
       });
     }
     ```
   - Omitting `SOROTTL_ACCESS_MODE` on Vercel prevents startup and halts requests with `500 CONFIG_ERROR` rather than defaulting to public.
2. **Public Mode**:
   - When set to `public`, all monitoring pages and `/api/backend/*` endpoints serve read-only data without authentication.
3. **Private Mode**:
   - Middleware ([`middleware.ts`](file:///C:/ReactApps/sorottl-dashboard/middleware.ts)) intercepts unauthenticated browser visitors and redirects them to `/login` with a safe relative `returnUrl`.
   - API routes reject unauthenticated requests with `401 VISITOR_AUTH_REQUIRED`.
   - Protected with HMAC-SHA256 session tokens verified via Web Crypto API.
   - Session cookies (`sorottl_access_token`) are flagged `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `NODE_ENV=production`.
4. **Rate Limiting & Lockout**:
   - `/api/auth/login` limits failed password attempts (5 failed attempts locks out the client bucket for 5 minutes, returning `429 Too Many Requests` with a `Retry-After` header).
   - Maximum 4KB request body size limit prevents memory exhaustion.
5. **Logout & Revocation**:
   - `POST /api/auth/logout` revokes the session ID and clears the session cookie with `maxAge: 0` and an expired timestamp.

---

## 5. Vercel Platform & Runtime Compatibility

1. **Serverless Function Execution**:
   - All API routes and middleware use web standards (`Request`, `Response`, `NextRequest`, `NextResponse`, `crypto.subtle`).
   - No filesystem write dependencies or stateful daemons exist in the dashboard.
2. **Node.js Engine**:
   - Vercel automatically selects Node.js 20.x / 22.x, fully satisfying the requirements of Next.js 16 and React 19.
3. **Dynamic vs. Static Prerendering**:
   - Static pages (`/`, `/login`, `/watchlist`, `/observations`, `/alerts`) are prerendered at build time.
   - API routes (`/api/backend/[...path]`, `/api/auth/login`, `/api/auth/logout`, `/api/health/ready`) are recognized as serverless functions (`ƒ Dynamic`).
4. **No Custom Server Required**:
   - Standard Next.js runtime (`next build` + `next start`) supported natively by Vercel without custom wrappers.

---

## 6. Build, Test & Quality Gate Results

All quality gates passed cleanly:

| Check | Command | Result | Notes |
| :--- | :--- | :---: | :--- |
| **Code Formatting** | `npm run format:check` | **PASS** | 100% compliant with Prettier |
| **ESLint** | `npm run lint` | **PASS** | 0 errors, 0 warnings |
| **Typecheck** | `npm run typecheck` | **PASS** | `tsc --noEmit` clean |
| **Unit & Security Tests** | `npm test` | **PASS** | **76 passed** across 5 test suites |
| **Production Build** | `npm run build` | **PASS** | Next.js compiled 10 static/dynamic routes successfully |

---

## 7. Render-to-Vercel Connectivity Requirements

For the Vercel dashboard to communicate with Render:

1. **HTTPS Protocol**:
   - Render automatically provisions TLS certificates for all `*.onrender.com` services.
   - Configure `SOROTTL_BACKEND_URL=https://<your-service-name>.onrender.com` in Vercel.
2. **CORS Configuration on Backend (Optional but Recommended)**:
   - Because all dashboard browser queries flow through the server-side proxy route (`/api/backend/*`), browser cross-origin requests do not hit Render directly.
   - If direct browser cross-origin inspection is ever enabled, set `SOROTTL_API_CORS_ORIGIN=https://<your-vercel-domain>.vercel.app` in Render environment variables.
3. **Bearer Authentication Synchronization**:
   - Ensure `SOROTTL_BACKEND_AUTH_TOKEN` in Vercel matches the `SOROTTL_API_AUTH_TOKEN` generated in Render.

---

## 8. Exact Vercel Deployment Configuration

When importing `SoroTTL-Network/sorottl-dashboard` into the Vercel Dashboard:

### Project Settings
- **Framework Preset**: `Next.js`
- **Root Directory**: `./` (or leave default root if repository is standalone)
- **Build Command**: `next build` (or leave default)
- **Output Directory**: `.next` (leave default)
- **Install Command**: `npm ci` (leave default)
- **Node.js Version**: `20.x` or `22.x`

### Deployment Steps in Vercel Dashboard:
1. Go to [vercel.com/new](https://vercel.com/new).
2. Connect your GitHub account and select `SoroTTL-Network/sorottl-dashboard`.
3. Keep default build and output settings.
4. Expand **Environment Variables** and add:
   - `SOROTTL_BACKEND_URL` = `https://<your-render-backend-name>.onrender.com`
   - `SOROTTL_BACKEND_AUTH_TOKEN` = `[Render API Token]`
   - `SOROTTL_ACCESS_MODE` = `public` *(or `private`)*
   - *(If private)* `SOROTTL_ACCESS_PASSWORD` = `[At least 8 chars]`
   - *(If private)* `SOROTTL_SESSION_SECRET` = `[At least 32 chars]`
   - `SOROTTL_TRUST_PROXY` = `true`
5. Click **Deploy**. Vercel will build and launch the dashboard at `https://<project-name>.vercel.app`.

---

## 9. Code Changes & Blockers

- **Required Code Changes**: **0**. The current codebase cleanly fulfills all Vercel specifications and security requirements.
- **Remaining Blockers**: None. The repository is verified and ready for immediate Vercel deployment.
