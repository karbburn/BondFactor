import { describe, test } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { computePortfolioResults, PositionInput, buildZeroCurve } from "./computeResults";
import { bootstrapZeroCurve } from "./bootstrap";
import { nssYield } from "./scenario";
import { generateCashflows } from "./cashflow";
import { calculateAccruedInterest, getSettlementDate } from "./conventions";
import { calculateDirtyPrice, calculateYtm } from "./pricing";
import { calculateKeyRateDurations } from "./krd";
import { calculatePositionFactorPnLDecompositionOptimized, PreBootstrappedFactorCurves } from "./risk";

const fixturesPath = path.resolve(__dirname, "../../backend/tests/fixtures/parity_fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));

describe("Pricing Engine Profiling", () => {
  test("Profile 50-position portfolio with breakdown", () => {
    const baseSecurity = fixtures.portfolio[0]; // 10Y G-Sec
    const portfolio: PositionInput[] = [];
    for (let i = 0; i < 50; i++) {
      portfolio.push({
        security: {
          isin: `IN0020240${i.toString().padStart(3, "0")}`,
          security_name: `G-Sec 7.00% 2035 #${i}`,
          issue_date: baseSecurity.issue_date,
          maturity_date: baseSecurity.maturity_date,
          coupon_rate: baseSecurity.coupon_rate,
          coupon_frequency: 2,
          face_value: baseSecurity.face_value
        },
        faceValue: 10000000.0 // 10M Face Value
      });
    }

    const curveDate = "2025-01-01";
    const baseParams = fixtures.baseline_nss;
    const shocks = {
      parallel_shift: 0.25,
      slope_shock: -0.10,
      curvature1_shock: 0.15,
      curvature2_shock: -0.05,
      twist_shock: 0.0,
      twist_pivot: 5.0
    };

    const baseZc = buildZeroCurve(baseParams);
    const shockedParams = {
      beta0: baseParams.beta0 + shocks.parallel_shift,
      beta1: baseParams.beta1 + shocks.slope_shock,
      beta2: baseParams.beta2 + shocks.curvature1_shock,
      beta3: baseParams.beta3 + shocks.curvature2_shock,
      tau1: baseParams.tau1,
      tau2: baseParams.tau2
    };
    const shockedZc = buildZeroCurve(shockedParams);
    const sd = getSettlementDate(new Date(curveDate));

    // Warm-up
    computePortfolioResults(portfolio.slice(0, 5), baseZc, shockedZc, curveDate, baseParams, shocks);

    // Profile run: Sub-sections breakdown
    let totalCashflowsTime = 0;
    let totalYtmTime = 0;
    let totalKrdTime = 0;
    let totalFactorDecompTime = 0;

    const startTotal = performance.now();
    
    // Compute factor curves once at portfolio level
    const h = 0.01;
    const buildCurveForParams = (b0: number, b1: number, b2: number, b3: number) => {
      const fn = (t: number) => nssYield(t, b0, b1, b2, b3, baseParams.tau1, baseParams.tau2);
      return bootstrapZeroCurve(fn, 40.0, 0.5);
    };

    const factorCurves: PreBootstrappedFactorCurves = {
      baseZc,
      shockedZc,
      b0Up: buildCurveForParams(baseParams.beta0 + h, baseParams.beta1, baseParams.beta2, baseParams.beta3),
      b0Down: buildCurveForParams(baseParams.beta0 - h, baseParams.beta1, baseParams.beta2, baseParams.beta3),
      b1Up: buildCurveForParams(baseParams.beta0, baseParams.beta1 + h, baseParams.beta2, baseParams.beta3),
      b1Down: buildCurveForParams(baseParams.beta0, baseParams.beta1 - h, baseParams.beta2, baseParams.beta3),
      b2Up: buildCurveForParams(baseParams.beta0, baseParams.beta1, baseParams.beta2 + h, baseParams.beta3),
      b2Down: buildCurveForParams(baseParams.beta0, baseParams.beta1, baseParams.beta2 - h, baseParams.beta3),
      b3Up: buildCurveForParams(baseParams.beta0, baseParams.beta1, baseParams.beta2, baseParams.beta3 + h),
      b3Down: buildCurveForParams(baseParams.beta0, baseParams.beta1, baseParams.beta2, baseParams.beta3 - h),
    };

    for (const pos of portfolio) {
      const s = pos.security;
      const issueDate = new Date(s.issue_date);
      const maturityDate = new Date(s.maturity_date);
      const couponRate = s.coupon_rate;
      const freq = s.coupon_frequency || 2;

      // 1. Cashflows
      const tcf0 = performance.now();
      const cfs = generateCashflows(issueDate, maturityDate, couponRate, freq, 100.0);
      calculateAccruedInterest(sd, issueDate, maturityDate, couponRate, freq, 100.0);
      totalCashflowsTime += performance.now() - tcf0;

      // 2. YTM Solver
      const ty0 = performance.now();
      const pBase = calculateDirtyPrice(sd, cfs, baseZc);
      calculateYtm(sd, cfs, pBase, freq);
      const pShocked = calculateDirtyPrice(sd, cfs, shockedZc);
      calculateYtm(sd, cfs, pShocked, freq);
      totalYtmTime += performance.now() - ty0;

      // 3. KRD (Key Rate Durations)
      const tk0 = performance.now();
      calculateKeyRateDurations(sd, cfs, baseZc, [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 40]);
      calculateKeyRateDurations(sd, cfs, shockedZc, [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 40]);
      totalKrdTime += performance.now() - tk0;

      // 4. Factor Decomposition
      const tf0 = performance.now();
      calculatePositionFactorPnLDecompositionOptimized(sd, cfs, baseParams, shocks, factorCurves, pos.faceValue);
      totalFactorDecompTime += performance.now() - tf0;
    }
    const endTotal = performance.now();

    console.log(`[PROFILER] Total Portfolio Repricing: ${(endTotal - startTotal).toFixed(2)} ms`);
    console.log(`[PROFILER] Cashflow Generation & Accrued: ${totalCashflowsTime.toFixed(2)} ms`);
    console.log(`[PROFILER] YTM Solver (2 runs/pos): ${totalYtmTime.toFixed(2)} ms`);
    console.log(`[PROFILER] Key Rate Durations (2 runs/pos): ${totalKrdTime.toFixed(2)} ms`);
    console.log(`[PROFILER] Factor Decomposition (Optimized): ${totalFactorDecompTime.toFixed(2)} ms`);
  });
});
