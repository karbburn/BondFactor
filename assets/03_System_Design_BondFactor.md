# BondFactor — System Design & Architecture

**Document version:** 1.0
**Depends on:** PRD v1.1, Quantitative Methodology Specification v1.0
**Feeds into:** Database Schema, API Specification, Frontend Specification, Backend Specification, Deployment Guide

---

## 1. Purpose

This document translates the quantitative methodology into concrete system components: what runs where, what data moves between them, and why the boundaries are drawn the way they are. It resolves the one open question left after the Quant Methodology document — exactly what the server ships to the client and what the client computes itself.

## 2. Resolving the Server/Client Boundary for Curve Data

**Decision:** The server ships the **fitted NSS parameters** (β₀, β₁, β₂, β₃, τ₁, τ₂) plus calibration diagnostics for a given date. The server does **not** ship a pre-bootstrapped zero curve for live client use. The client always derives the zero curve itself, via its own TypeScript bootstrap implementation, from whichever NSS parameters are in play — the base fitted parameters, or a scenario-shocked set.

**Why:** The scenario engine works by shocking NSS factors (Quant Methodology §8), which produces a *new* set of NSS parameters that must be re-bootstrapped to get the corresponding zero curve before repricing. That means the client must have a working, parity-tested bootstrap implementation in TypeScript regardless of what the base case does. Given that requirement already exists, having the base (unshocked) curve go through a *different* code path — a server-precomputed zero curve shipped as-is — would mean maintaining two ways of getting from NSS parameters to a zero curve: one on the server (Python, used to produce the archived/historical zero curve) and a structurally different one on the client (TS bootstrap, used only for scenarios). That's a wider parity-testing surface for no real benefit. Using one bootstrap code path for both the base and shocked cases is simpler, has a smaller CI surface, and is the more defensible design.

The **server-side Python bootstrap** still exists and still runs nightly — it is the reference implementation those TypeScript functions are parity-tested against (Quant Methodology §10), and its output is what gets archived to the historical curve table for replay and reporting purposes (Section 5.3). It is simply not what powers live client interaction.

## 3. Component Overview

| Component | Responsibility | Technology |
|---|---|---|
| **Ingestion Service** | Fetch daily par yield data from FBIL, fall back to DBIE, fall back to manual CSV; validate completeness and sanity bounds | Python, scheduled via GitHub Actions |
| **Calibration Service** | Fit NSS to validated par yields; run calibration diagnostics; fall back to cubic spline on failure; bootstrap the reference zero curve | Python (scipy) |
| **Persistence Layer** | Store raw ingested data, fitted curves, diagnostics, bootstrapped reference zero curves, securities master, portfolios, positions | Supabase (Postgres) |
| **API Service** | Serve curve/security/portfolio data to the client; handle authenticated portfolio CRUD; generate reports | FastAPI on Render |
| **Client Pricing Engine** | Bootstrap zero curves (base and scenario-shocked) from NSS parameters; price bonds; compute duration/DV01/convexity/KRD; apply scenario shocks | TypeScript, runs in-browser |
| **Frontend Application** | UI for portfolio construction, curve exploration, scenario composition, risk visualization, reporting | Next.js 14 on Vercel |
| **Scheduler** | Trigger nightly ingestion and calibration jobs | GitHub Actions cron |

## 4. Data Flow

### 4.1 Nightly Batch Flow (server-side, non-interactive)

1. GitHub Actions cron triggers the Ingestion Service on a fixed schedule (post-FBIL-publication time).
2. Ingestion Service attempts FBIL fetch → validates completeness/sanity → on failure, attempts DBIE fetch → on failure, flags for manual CSV import and raises an alert.
3. Validated par yield data is persisted to the raw ingestion table, versioned by date.
4. Calibration Service fits NSS to the validated data, runs the diagnostic checks defined in Quant Methodology §5.
5. On successful validation: NSS parameters and diagnostics are persisted; a reference zero curve is bootstrapped (Python) and persisted for archival/historical/reporting use.
6. On failed validation: an operational alert is raised, cubic spline is fit and persisted as that date's usable curve, and the previous day's successful NSS calibration is explicitly preserved (not overwritten) in the historical record.
7. All steps are logged with enough detail to reconstruct why a given day's curve looks the way it does (auditability, per PRD §8).

### 4.2 Interactive Client Flow

1. On load, the client fetches the latest available fitted curve parameters (NSS or cubic-spline-fallback, whichever is valid for the most recent date) plus calibration diagnostics from the API.
2. The client's TypeScript pricing engine bootstraps the base zero curve from those parameters.
3. As the user builds a portfolio, cashflow schedules are generated client-side per position (Quant Methodology §7.1) and priced off the base zero curve.
4. As the user applies scenario shocks, the client recomputes shocked NSS parameters, re-bootstraps a new zero curve, and reprices the entire portfolio — target latency ~100ms (PRD §10) since no network round-trip is required for this step.
5. KRD is computed client-side via local zero-curve tenor bumps (Quant Methodology §9), independent of the scenario shock path, on demand or alongside base portfolio load.
6. Server calls are limited to: initial curve/security data fetch, authenticated portfolio persistence (Phase 2), historical curve browsing (Phase 2), and report generation (Phase 2) — never for routine scenario interaction.

### 4.3 Reporting Flow *(Phase 2)*

Report generation is server-side (FastAPI), since it composes a static document (PDF/Excel) rather than serving an interactive UI. The client sends the current portfolio state and applied scenario configuration to the API; the server re-derives the same result server-side (using the same bootstrapped-from-NSS-parameters logic, in Python) for the export, ensuring the exported report doesn't depend on trusting client-computed state.

## 5. Persistence Boundaries

### 5.1 What Persists Server-Side
- Raw ingested par yield observations (all sources attempted, with source and status recorded)
- Fitted NSS parameters and calibration diagnostics, per date
- Reference bootstrapped zero curves, per date (archival/reporting use, not live client use — Section 2)
- Securities master data (ISIN, coupon, maturity, issue date, face value, benchmark tenor classification)
- User accounts (Supabase Auth), portfolios, and positions *(Phase 2)*
- Generated report artifacts or their generation metadata *(Phase 2)*

### 5.2 What Persists Client-Side (session only, no browser storage)
- Current portfolio under construction (in-memory application state)
- Currently applied scenario configuration
- Computed pricing/risk results for the active session

No browser localStorage/sessionStorage is used for portfolio or pricing data; state lives in application memory for the duration of the session and is persisted to Supabase only when the user explicitly saves (Phase 2, authenticated).

### 5.3 Historical Data Note

The nightly-archived reference zero curve (Section 4.1, step 5) exists specifically so historical replay (PRD Journey 4, Phase 2) has a real, previously-validated curve to load rather than requiring on-demand re-fitting of a historical date. This is separate from, and does not need to numerically match to the same tolerance as, the client's live TypeScript bootstrap — historical replay loads archived output directly rather than recomputing it.

## 6. Failure Handling and Degradation

| Failure | System Response |
|---|---|
| FBIL fetch fails | Fall back to DBIE fetch automatically |
| DBIE fetch also fails | Flag for manual CSV import; do not publish a new daily curve; prior day's curve remains the "latest" until resolved |
| NSS calibration fails validation | Fall back to cubic spline for that date; alert raised; prior valid NSS calibration preserved in history |
| Client-side TS bootstrap produces a result diverging from Python parity tolerance (caught in CI, not runtime) | Release blocked; this is a pre-deployment gate, not a runtime fallback |
| Render backend cold start / unavailable | Does not block core interactive functionality, since scenario/pricing/risk computation is client-side; only initial curve fetch and Phase 2 persistence features are affected |

## 7. Scalability Considerations

This system is explicitly scoped for a single-developer-maintained, portfolio-grade deployment on free-tier infrastructure — not production trading-desk scale. Noted here so the design isn't mistaken for an oversight:

- **Nightly batch jobs** operate on a single curve fit per day, a computationally trivial load well within free-tier compute and time limits.
- **Client-side computation** scales with the user's own browser, not shared server resources — a natural fit for free-tier hosting, since the expensive, repeated work (scenario interaction) never touches the backend.
- **Database load** is low-volume (daily curve inserts, occasional portfolio CRUD), well within Supabase's free tier.
- If usage or scope ever exceeded these bounds (e.g., multi-user concurrent report generation at scale), the reporting service would be the first component requiring dedicated infrastructure, since it's the one genuinely CPU-bound server-side interactive path.

## 8. Mapping to Non-Functional Requirements

| NFR (PRD §8) | Architectural mechanism |
|---|---|
| Performance (interactive) | Client-side pricing/risk engine; no network round-trip per scenario interaction |
| Reliability | Multi-source ingestion fallback; calibration validation with automatic fallback and alerting |
| Reproducibility | Every curve, diagnostic, and historical data point versioned by date and source |
| Auditability | Diagnostics stored and surfaced, not hidden; explicit cashflow schedules; nightly job logging |
| Maintainability | Centralized conventions module (Quant Methodology §7.2); single bootstrap code path reused for base and scenario cases |
| Security | Supabase Auth for user data; no proprietary data ingested; no plaintext credential handling |

## 9. Document Map Reference

This document's component boundaries directly inform the Database Schema (Section 5's persistence boundaries), the API Specification (Section 4's client/server data contracts), the Frontend Specification (Section 4.2's client pricing engine responsibilities), and the Backend Specification (Section 3's service responsibilities).
