# Performance Findings

This document presents the observed profiling data of the client-side pricing engine (`/lib/pricing-engine`) for a realistically sized 50-position portfolio.

---

## 1. Baseline Profiling Results

We profiled the client-side pricing engine on a 50-position portfolio (consisting of 10-year semi-annual coupon benchmark securities) under a composed Nelson-Siegel-Svensson factor scenario.

The profiling was executed inside the Next.js runtime environment via Vitest under Node.js:

| Operation | Total Time (50 Positions) | % of Total Time | Description |
|---|---|---|---|
| **Total Portfolio Repricing** | **23.85 ms** | **100.0%** | Comprehensive repricing & risk metrics run |
| **Factor Decomposition** | **9.68 ms** | **40.5%** | Stage 19 Factor P&L attribution (10 bootstraps/pos) |
| **YTM Solver** | **7.20 ms** | **30.2%** | Numerical bisection root finder (2 YTM solves/pos) |
| **Key Rate Durations** | **4.53 ms** | **19.0%** | Key Rate Sensitivities (12 tenor perturbations/pos) |
| **Cashflow & Accrued** | **2.04 ms** | **8.6%** | Cashflow schedule generation & accrued interest |

---

## 2. Identified Bottlenecks

### 2.1 Bottleneck 1: Redundant Zero Curve Bootstrappings in Factor Decomposition (40.5% of total time)
- **Finding:** For each of the 50 positions in the portfolio, `calculatePositionFactorPnLDecomposition` is called. Within this function, 10 distinct zero curves are bootstrapped (base, shocked, and 8 parameter-perturbed curves) to calculate finite difference derivatives. This results in **500 total curve bootstrappings** for a 50-position portfolio.
- **Root Cause:** The zero curve is entirely independent of the portfolio positions and only depends on the shared NSS parameters. Bootstrapping them independently per position is redundant.
- **Optimization:** Bootstrap the 8 parameter-perturbed zero curves **once** at the portfolio level (in `computePortfolioResults`), and pass these pre-bootstrapped curves to the position-level factor decomposition. This reduces the number of bootstraps from 500 to 10 (a **98% reduction** in bootstrap operations).

### 2.2 Bottleneck 2: Redundant Date Calculations in YTM Solver Loop (30.2% of total time)
- **Finding:** The numerical YTM solver uses a bisection loop with up to 100 iterations. On each iteration, the solver calculates the time-to-coupon `t` for all coupon dates by computing day differences using JavaScript `getTime()` and `Math.round`. For a 10-year semi-annual bond (20 coupon dates), this calls date math functions up to **2,000 times per YTM solve**.
- **Root Cause:** The maturity date and cashflow dates of a bond do not change within the YTM root finder. Recalculating `t` on every bisection step is redundant.
- **Optimization:** Pre-calculate `t` for all cashflows once before entering the bisection loop, and use the pre-calculated float values inside the objective function loop.
