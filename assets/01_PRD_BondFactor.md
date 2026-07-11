# BondFactor — Product Requirements Document

**Project:** BondFactor — Indian Government Securities Curve Deformation & Portfolio Risk Platform
**Deployment:** bondfactor.vercel.app
**Document version:** 1.1
**Status:** Draft for implementation

---

## 1. Vision

BondFactor is a professional-grade fixed-income analytics platform for Indian Government Securities (G-Secs). It lets a user construct a bond portfolio, fit and deform the benchmark yield curve using economically meaningful scenarios, and immediately see how portfolio value and risk — price, duration, DV01, convexity, Key Rate Duration, and scenario P&L — respond.

The platform is built to the standard of a practitioner tool, not a classroom exercise. Every calculation reflects standard Indian G-Sec market conventions (semi-annual coupons, Actual/Actual day count, T+1 settlement) and every model choice is documented alongside its assumptions and limitations, rather than presented as universally correct.

The governing design principle for this project is **financial correctness over feature count**. Breadth is sequenced across phases; rigor is never compromised to hit a phase deadline.

## 2. Problem Statement

Yield curve risk in a G-Sec portfolio is multi-dimensional — a portfolio can be flat to parallel shifts but exposed to a steepener, or hedged in aggregate DV01 but concentrated at a single tenor bucket. Most publicly available tools either show a static curve with no portfolio context, or a portfolio calculator with no curve-scenario framework. There is no free, open tool that connects the two: fit a curve, deform it in a defined way, and see exactly how a real portfolio's risk profile moves.

BondFactor closes that gap, using only free and public data sources, for a target audience of fixed income analysts, treasury and risk analysts, and quantitative developers working in or evaluating Indian rates markets.

## 3. Target Users

| Persona | Primary need | How BondFactor serves it |
|---|---|---|
| **Fixed Income / Treasury Risk Analyst** (primary) | Understand portfolio sensitivity to curve moves beyond parallel DV01 | Full risk stack (duration, DV01, convexity, KRD) under composable factor-shock scenarios |
| **Quantitative Developer / Recruiter** (primary) | Assess technical and quantitative rigor of a candidate | Transparent methodology, documented model limitations, parity-tested pricing engine, golden reference validation |
| **Finance students / graduate programs** (secondary) | Learn how curve scenarios propagate into portfolio risk | Clear UI, historical curve replay, exportable scenario reports |

## 4. Product Principles

1. **Correctness before breadth.** A feature ships only when it can be modeled to an accepted market standard. If it can't yet, it stays explicitly out of scope rather than shipping as an approximation presented as correct.
2. **No implied data that doesn't exist.** Historical coverage, data freshness, and model confidence are always stated accurately in the UI — the platform never implies continuity or precision it can't back up.
3. **Separation of concerns in the math.** Scenario P&L (factor-based, curve-level) and Key Rate Duration (tenor-local, bucket-level) answer different questions and are computed independently, not derived from one another.
4. **One reference implementation.** Python is the quantitative source of truth. The production TypeScript engine is validated against it, not the other way around.
5. **Practitioner-legible output.** Every number the platform surfaces (price, yield, duration, DV01, convexity, KRD) uses conventions and terminology a rates desk would recognize without translation.

## 5. Scope Summary

Full scope and detailed feature sequencing live in the **Development Roadmap** document. This PRD defines *what the product is* at full maturity and *why*; phase gating defines *when* each part ships.

At a high level, the platform is sequenced in three dependency-driven phases:

- **Phase 1 — Core Analytics Engine:** data ingestion, curve construction (NSS + cubic spline), zero-curve bootstrapping, bond pricing, full risk stack (duration/DV01/convexity/KRD), scenario engine, single-portfolio analytics. This phase is the mathematical and architectural foundation and is not usable as a product until complete.
- **Phase 2 — Platform Features:** authentication, portfolio persistence, multi-portfolio management and comparison, PDF/Excel reporting, historical curve archive and replay.
- **Phase 3 — Advanced Analytics:** historical scenario calibration, advanced risk attribution, performance optimization, expanded visualization, additional instrument types considered (not committed).

See the Roadmap document for phase gates, dependencies, and exit criteria for each phase.

## 6. Core User Journeys

**Journey 1 — First-time evaluation (target: under 60 seconds to insight)**
A reviewer lands on the app, sees a pre-loaded example portfolio and the current fitted benchmark curve, applies a preset scenario (e.g., bear steepener), and immediately sees the portfolio's DV01-weighted P&L and how risk is distributed across tenor buckets via the KRD ladder — without needing to build a portfolio from scratch first.

**Journey 2 — Portfolio construction and analysis**
A user builds a portfolio from available G-Secs (face value, coupon, maturity per position), reviews bond-level and portfolio-level analytics (clean/dirty price, YTM, accrued interest, Macaulay/modified duration, DV01, convexity), then applies one or more composed scenarios and reviews the resulting scenario P&L and risk contribution by position.

**Journey 3 — Curve exploration**
A user inspects the current fitted benchmark curve (NSS with cubic spline available for comparison), adjusts factor-shock sliders (level/slope/curvature or preset-named scenarios) independently or in combination, and visually compares the original and deformed curve.

**Journey 4 — Historical context** *(Phase 2, contingent on data availability)*
A user browses the historical curve archive, selects a past date, and either views that day's curve in isolation or uses the observed historical move as the magnitude for a scenario applied to their current portfolio.

**Journey 5 — Reporting** *(Phase 2)*
A user exports a comprehensive report for a portfolio under one or more applied scenarios — composition, before/after curves, full risk stack, and scenario P&L — as PDF or Excel.

**Journey 6 — Pricing validation**
A user selects one or more benchmark securities with independently known market values (e.g., a recently auctioned or actively traded G-Sec) and compares BondFactor's calculated clean price, YTM, and risk measures side-by-side against the reference values, with any discrepancy shown explicitly rather than hidden. This journey exists so a skeptical reviewer — or the developer during validation — can confirm the platform's numbers are correct against reality, not just internally consistent. It is the user-facing counterpart to the Golden Reference Validation testing layer.

## 7. Functional Requirements (by capability area)

Detailed specs for each area live in their respective documents (Quant Methodology, System Design, API Spec, Frontend Spec). This section states *what* each capability must do, not *how*.

### 7.1 Data Ingestion
- Automated daily retrieval of the benchmark G-Sec par yield curve, sourced with priority FBIL → RBI DBIE → manual CSV fallback.
- Validation of incoming data (completeness, sanity bounds) before it enters the curve-fitting pipeline.
- Historical versioning of all ingested curves.

### 7.2 Curve Construction
- Primary model: Nelson-Siegel-Svensson, fit daily to the ingested par curve.
- Secondary model: cubic spline, available for comparison and as an automatic fallback when NSS calibration fails validation.
- Zero-coupon curve bootstrapped from the fitted par curve; all bond pricing discounts actual cashflows off the zero curve.
- Calibration validation with automatic fallback and alerting on failure, including calibration diagnostics and goodness-of-fit metrics (e.g., fitting error against observed par yields, parameter stability across consecutive trading days) surfaced alongside the fitted curve so curve quality is never a black box (detailed in Quant Methodology).

### 7.3 Bond Pricing & Analytics
- Clean price, dirty price, YTM, accrued interest, Macaulay duration, modified duration, DV01, and convexity for any user-defined G-Sec position, computed under standard Indian market conventions (semi-annual coupon, Actual/Actual, T+1 settlement).
- Explicit cashflow schedule generation for every position (coupon and redemption dates and amounts), which underlies all pricing and risk calculations and is available for inspection, not just used internally.

### 7.4 Scenario Engine
- Preset scenarios: parallel shift, steepener, flattener, twist, butterfly — each defined as a parameterized NSS factor shock.
- Custom scenario: user composes any combination of the above shocks with independently adjustable magnitudes.
- All scenario shocks apply to the fitted curve; resulting bond and portfolio repricing occurs client-side against the cached zero curve.

### 7.5 Key Rate Duration
- Computed independently of the scenario engine via local 1bp bumps at each key-rate tenor (mirroring the benchmark tenor grid published by the data source), with linear tapering to neighboring buckets, on the zero curve directly.

### 7.6 Portfolio Management
- Long-only portfolios of Indian G-Secs.
- Position-level and portfolio-level analytics for the full risk stack, including risk contribution by position.
- Portfolio validation at entry time — each position is checked for a valid, existing security definition, sane face value and coupon inputs, and a maturity consistent with the available curve range, with clear rejection or warning rather than silent acceptance of invalid input.
- *(Phase 2)* Persistence, multiple portfolios per user, side-by-side portfolio and scenario comparison.

### 7.7 Historical Data & Replay *(Phase 2, contingent)*
- Historical curve archive from the earliest date for which reliable data is confirmed available.
- Replay of historical curves in isolation or as scenario-magnitude calibration input.
- The platform will state its actual historical coverage range explicitly rather than imply full continuity.

### 7.8 Reporting *(Phase 2)*
- PDF/Excel export of a single-portfolio, single-or-multi-scenario report including composition, curves, full risk stack, and scenario P&L.
- Architecture extensible to comparative (multi-portfolio) reports in a later phase without redesign.

## 8. Non-Functional Requirements

- **Performance.** Curve fitting and zero-curve bootstrapping (server-side, infrequent) should complete well within a nightly batch window. Scenario deformation, repricing, and risk recalculation (client-side, interactive) should feel instantaneous to a user manipulating sliders — no visible lag between input and updated output, since this drives the "under 60 seconds to insight" journey.
- **Reliability.** The platform must never silently propagate a failed or low-confidence curve calibration into portfolio analytics. Ingestion and calibration failures degrade gracefully (fallback to cubic spline, preserved last-known-good NSS calibration) with visible alerting rather than a broken or wrong output.
- **Reproducibility.** Every fitted curve, calibration diagnostic, and historical data point is versioned and traceable back to its source ingestion date and method, so any displayed number can be explained and reproduced later.
- **Auditability.** Every pricing and risk calculation is traceable through an explicit, inspectable cashflow schedule and discounting path — nothing is a black-box output. Golden reference validation results and parity test outcomes are documented, not just run and discarded.
- **Maintainability.** Market conventions (day count, settlement, coupon frequency) are centralized in one location in the pricing engine rather than duplicated across the codebase, so convention changes require a single update point.
- **Security assumptions.** All market data consumed is public and free; no proprietary or licensed data is ingested. User accounts (Phase 2) rely on Supabase Authentication; no payment or highly sensitive personal data is collected or stored. The platform is a portfolio/demonstration project, not a production trading system, and is not held to institutional security/compliance certification standards, though it follows reasonable practice (auth-gated portfolio data, no plaintext credential handling, standard dependency hygiene).

## 9. Explicitly Out of Scope

Stated here so scope boundaries are unambiguous. These are not rejected ideas — some may become future phases — but none are assumed or implied anywhere else in this platform's v1–v3 roadmap:

- **Short positions and repo/securities-lending financing.** Excluded because carry and funding are out of scope; a short position without financing cost would be mathematically incomplete.
- **Interest rate derivatives** (IRS, OIS, bond futures). The product is a G-Sec cash-instrument analytics platform, not a full rates trading system.
- **Carry, roll-down, and realized P&L attribution.** These require market assumptions (repo rates, funding curves) beyond the yield curve itself.
- **Arbitrary tenor-by-tenor manual curve shocks** for scenario P&L. Scenario shocks are factor-based by design; only KRD operates at the local-tenor level.
- **Multi-currency or non-INR instruments.**
- **Real-time intraday pricing.** Curve fitting is a daily (end-of-day) process; the product is not a live trading terminal.
- **Credit and liquidity risk premia.** All pricing assumes default-free Indian Government Securities. G-Secs carry sovereign credit risk that the market treats as effectively risk-free domestically, and BondFactor follows this convention — it does not model a credit spread, liquidity premium, or bond-specific richness/cheapness versus the fitted curve. A bond's fitted-curve price may therefore differ from its actual traded price for reasons (liquidity, on-the-run/off-the-run status, demand-supply technicals) the platform does not attempt to capture; this is treated as a stated model limitation, not an error.

## 10. Success Metrics

Since this is a portfolio/demonstration project rather than a commercial product, success is measured by credibility and correctness signals rather than usage volume:

- A reviewer with fixed-income market experience can, within a single session, verify that the platform's conventions, risk definitions, and scenario methodology match accepted market practice.
- Golden reference validation (Testing Strategy, Layer 3) passes against independently verified benchmark security values.
- Python↔TypeScript parity holds within defined tolerances (yield: 0.1bp, price: ₹0.01 per ₹100 face value) with zero unresolved CI failures.
- The Phase 1 core engine is fully functional and correct before any Phase 2 feature is started — Phase 1 is a hard gate, not a soft target.
- The platform never displays a number, curve, or historical range that misrepresents what the underlying data or model actually supports.
- **Interactive scenario repricing latency** — for a representative portfolio (target: up to 50 positions), client-side scenario deformation, repricing, and full risk-stack recalculation completes within a target of ~100ms, so slider interaction reads as live rather than as a loading operation.

## 11. Key Assumptions

- FBIL and RBI DBIE provide stable, if not perfectly consistent, sources of daily par yield data; source stability itself is a Phase 1 validation task, not a pre-verified assumption.
- The benchmark tenor grid used for both curve fitting and Key Rate Duration is sourced dynamically from the data provider rather than hardcoded, so it adapts if published conventions change.
- Free-tier infrastructure (Vercel, Render, Supabase, GitHub Actions) is sufficient for a single-developer-maintained, portfolio-scale (not production-scale) deployment.
- All priced securities are treated as default-free sovereign obligations; no issuer credit risk, liquidity premium, or bond-specific basis to the fitted curve is modeled (see Section 9).

## 12. Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| FBIL/DBIE endpoints are unstable or change structure | Ingestion pipeline breaks silently | Manual CSV fallback path; validation layer flags missing/anomalous data rather than propagating it |
| NSS calibration fails to converge on noisy days | Bad curve feeds downstream pricing | Automated validation with fallback to cubic spline and alerting; previous valid NSS calibration preserved |
| Python/TypeScript numerical drift | Production risk numbers diverge from validated reference | Mandatory parity test suite as a CI gate, not optional |
| Render free-tier cold starts degrade perceived interactivity | Poor first impression for a reviewer | Interactive scenario/repricing math runs entirely client-side against a cached zero curve; server only handles infrequent, non-interactive operations |
| Historical data coverage is incomplete or unreliable | Overstated "historical replay" feature misleads users | Coverage validated before Phase 2 begins; UI explicitly states actual available range |
| Solo-developer scope creep ("build everything now") | Phase 1 never actually finishes | Hard phase gates; Phase 2 work does not start until Phase 1 exit criteria (defined in Roadmap) are met |

## 13. Future Vision

BondFactor's Phase 1–3 scope is deliberately bounded to Indian G-Sec cash instruments, but the underlying architecture — a versioned curve-fitting pipeline, a bootstrapped discounting engine, a factor-based scenario framework, and a parity-tested client/server pricing split — is not specific to that instrument class. Beyond the committed roadmap, the same foundation could reasonably extend to corporate bonds (with an added credit spread layer), state development loans (SDLs), interest rate derivatives, or additional sovereign curves, without a architectural rebuild. This is stated as directional intent, not a commitment — nothing in this document should be read as expanding current scope — but it is a deliberate reason the core engine is being built as a modular pricing/risk library rather than a single-purpose calculator.

## 14. Glossary

- **Par Curve** — The curve of yields at which a bond of each maturity would be priced exactly at par (100). This is what market data sources like FBIL publish directly.
- **Zero (Zero-Coupon) Curve** — The curve of discount rates for single cashflows at each maturity, derived (bootstrapped) from the par curve. Used to discount actual bond cashflows for pricing.
- **Bootstrapping** — The iterative process of deriving zero-coupon rates from observed par yields, working outward along the maturity curve.
- **NSS (Nelson-Siegel-Svensson)** — A six-parameter parametric model for fitting a smooth yield curve, extending the four-parameter Nelson-Siegel model with a second curvature term for added flexibility, particularly at longer maturities.
- **Cubic Spline** — A piecewise polynomial interpolation method that passes exactly through observed data points; used here as a comparison/fallback to NSS.
- **Duration (Macaulay / Modified)** — Macaulay duration is the weighted-average time to a bond's cashflows. Modified duration approximates the percentage price change of a bond for a 1% change in yield.
- **DV01 (Dollar Value of 01)** — The change in a bond's or portfolio's price for a 1 basis point (0.01%) change in yield, expressed in currency terms.
- **Convexity** — The second-order sensitivity of a bond's price to yield changes; captures the curvature that duration alone (a linear approximation) misses.
- **KRD (Key Rate Duration)** — Sensitivity of a bond's or portfolio's price to a localized 1bp change at a single point on the curve (a "key rate"), holding other key rates fixed. Distinguishes where on the curve a portfolio's risk actually sits, unlike a single parallel DV01 figure.
- **Factor Shock** — A yield curve movement expressed as a change to a curve model's underlying parameters (e.g., NSS level, slope, curvature) rather than as an arbitrary change at individual tenor points.
- **Clean Price / Dirty Price** — Clean price excludes accrued interest since the last coupon date; dirty price (the actual settlement amount) includes it.
- **YTM (Yield to Maturity)** — The single discount rate that equates a bond's discounted cashflows to its current price.
- **G-Sec** — Government Security; a sovereign debt instrument issued by the Government of India.
- **Benchmark Tenor Grid** — The set of standard maturities (e.g., 91-day, 1Y, 2Y, 5Y, 10Y, etc.) at which par yields are quoted and key rates are defined.

## 15. Document Map

This PRD is the top-level product reference. Implementation detail is intentionally deferred to:

- **Quantitative Methodology Specification** — model selection, math, conventions, assumptions and limitations
- **System Design & Architecture** — service boundaries, client/server compute split, data flow
- **Database Schema** — Supabase/Postgres schema for curves, portfolios, users, historical data
- **API Specification** — FastAPI endpoint contracts
- **Frontend Specification** — Next.js application structure, component/state design, UX detail
- **Backend Specification** — FastAPI service implementation detail
- **Testing Strategy** — unit, parity, and golden reference validation layers
- **Deployment Guide** — Vercel/Render/Supabase/GitHub Actions setup
- **Development Roadmap** — phased sequencing, dependencies, and exit criteria
