# BondFactor — Frontend Specification

**Document version:** 1.0
**Framework:** Next.js 14 (App Router), TypeScript
**Depends on:** System Design & Architecture v1.0, API Specification v1.0, Quantitative Methodology Specification v1.0

---

## 1. Design Direction — Stated Assumption

The PRD's target persona is a fixed-income/treasury risk practitioner, not a general consumer audience. This document assumes a **dense, data-table-oriented, Bloomberg-terminal-inspired layout** — prioritizing information density, monospaced numerical alignment, and minimal decorative motion — over the more animated, marketing-page style used on the personal portfolio site. The existing ink-black/amber-saffron palette and JetBrains Mono for technical content are retained for visual consistency across the broader project portfolio, but layout density and interaction patterns are deliberately closer to a professional analytics workstation than a landing page. This is stated explicitly as an assumption carried from earlier discussion; flag if a different direction is preferred before frontend implementation begins.

## 2. Application Structure (App Router)

```
/app
  /page.tsx                    — Landing / example portfolio (Journey 1)
  /portfolio/page.tsx          — Portfolio builder (Journey 2)
  /curve/page.tsx              — Curve explorer (Journey 3)
  /validate/page.tsx           — Pricing validation (Journey 6)
  /history/page.tsx            — Historical replay (Phase 2, Journey 4)
  /reports/page.tsx            — Report generation (Phase 2, Journey 5)
  /portfolios/page.tsx         — Saved portfolio list (Phase 2, auth-gated)
  /login/page.tsx              — Auth (Phase 2)
```

## 3. Client-Side Pricing Engine (`/lib/pricing-engine`)

This module is the TypeScript production counterpart to the Python reference implementation (Quant Methodology §10) and is structured to mirror it directly, so parity testing and code review can map one-to-one between the two:

```
/lib/pricing-engine
  conventions.ts     — centralized day-count, settlement, coupon-frequency constants (Quant Methodology §7.2)
  cashflow.ts         — cashflow schedule generation (§7.1)
  bootstrap.ts         — zero curve bootstrap from NSS parameters (System Design §2)
  pricing.ts          — clean/dirty price, YTM (§7.3)
  risk.ts             — duration, DV01, convexity (§7.3)
  scenario.ts          — NSS factor-shock application (§8)
  krd.ts               — local zero-curve tenor bump + KRD calc (§9)
  types.ts            — shared types (NSSParameters, ZeroCurvePoint, CashflowSchedule, etc.)
```

This module has no framework dependency (no React imports) so it can be unit- and parity-tested in isolation (Testing Strategy) independent of UI rendering.

## 4. State Management

Global application state (current portfolio, active curve, applied scenario configuration, computed results) is held in React state via a small set of context providers rather than a heavier external state library — the state graph is not large enough to justify additional dependency weight, and keeping it in-memory (not localStorage/sessionStorage, per PRD security/architecture constraints) is a natural fit for React context.

```
/lib/state
  CurveContext.tsx       — active NSS parameters + diagnostics, fetched once on load
  PortfolioContext.tsx    — current portfolio positions (session-only until Phase 2 save)
  ScenarioContext.tsx     — currently composed scenario shock values
  ResultsContext.tsx      — derived pricing/risk outputs, recomputed on portfolio or scenario change
```

`ResultsContext` recomputation is the performance-critical path referenced in PRD §10 (target ~100ms) — it calls directly into `/lib/pricing-engine`, never through an API round-trip.

## 5. Key Components

| Component | Journey | Responsibility |
|---|---|---|
| `CurveChart` | 1, 3 | Renders base and (optionally) scenario-shocked curve overlay |
| `ScenarioComposer` | 3 | Sliders/inputs for parallel/steepener/flattener/twist/butterfly/custom factor shocks |
| `PortfolioTable` | 2 | Position entry, editing, per-position risk display |
| `RiskSummaryPanel` | 2 | Portfolio-level duration/DV01/convexity/scenario P&L |
| `KRDLadder` | 2 | Bar chart of KRD by tenor bucket, independent of `ScenarioComposer` state |
| `PricingValidationPanel` | 6 | Side-by-side calculated vs. reference market value comparison, with discrepancy shown explicitly (never hidden or rounded away) |
| `CalibrationDiagnosticsBadge` | 1, 3 | Surfaces fit quality / fallback status (never hidden, per auditability NFR) |
| `HistoricalCurveBrowser` | 4 *(Phase 2)* | Date picker + archived curve loader |
| `ReportExportDialog` | 5 *(Phase 2)* | Triggers `/reports/generate`, polls status |

## 6. Data Fetching Pattern

- Curve parameters, key-rate tenor grid, and securities master are fetched once per session on initial load (`GET /curves/latest`, `GET /key-rate-tenors`, `GET /securities`) and cached in context — these change at most once per day, so re-fetching on every interaction is unnecessary.
- Portfolio persistence calls (Phase 2) are explicit, user-triggered actions (Save, Load), not continuous background syncs.
- No polling or websockets are used; the interactive surface is entirely client-computed (System Design §4.2), so there's nothing to poll for during normal use. Report generation status (Phase 2) is polled only while a report is actively processing.

## 7. Performance Requirements

- Scenario slider interaction to updated risk display: target ~100ms end-to-end (PRD §10), achieved by keeping the entire repricing path client-side with no network call.
- Initial page load (curve + securities fetch): not held to the same standard, since it happens once per session — a brief loading state is acceptable here.
- Cashflow generation, bootstrap, and full-portfolio repricing on every scenario change should be profiled during development against a representative 50-position portfolio (PRD §10's stated benchmark) to confirm the target is met in practice, not just in principle; if it isn't, the recompute can be debounced against slider drag events without changing the underlying architecture.

## 8. Accessibility and Usability Notes

- Numerical tables use monospaced alignment and explicit units (bps, ₹, %) rather than relying on color alone to convey positive/negative risk figures.
- Calibration fallback status and any data-availability limitation (e.g., historical coverage range) is always shown as visible text, not only as a tooltip or icon, consistent with the "never imply data availability that doesn't exist" product principle.

## 9. Document Map Reference

Component data requirements here map directly to the API Specification's Phase 1/2 endpoints. The pricing-engine module structure (Section 3) is the TypeScript side of the parity-testing pairs defined in the Testing Strategy document.
