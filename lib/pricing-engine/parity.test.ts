import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

import { getSettlementDate, calculateAccruedInterest } from "./conventions";
import { generateCashflows } from "./cashflow";
import { bootstrapZeroCurve } from "./bootstrap";
import { calculateDirtyPrice, calculateCleanPrice, calculateYtm } from "./pricing";
import { calculateMacaulayDuration, calculateModifiedDuration, calculateDv01, calculateConvexity, calculatePositionFactorPnLDecomposition, calculatePositionFactorPnLDecompositionOptimized, PreBootstrappedFactorCurves } from "./risk";
import { getShockedZeroCurve, nssYield, applyScenarioShocks } from "./scenario";
import { calculateKeyRateDurations } from "./krd";

const fixturesPath = path.resolve(__dirname, "../../backend/tests/fixtures/parity_fixtures.json");
const outputsPath = path.resolve(__dirname, "../../backend/tests/fixtures/parity_outputs.json");

const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));
const expected = JSON.parse(fs.readFileSync(outputsPath, "utf-8"));

describe("TypeScript vs Python Reference Parity Tests", () => {
  // 1. Zero Curve Bootstrap Parity
  test("Zero Curve Bootstrap Parity", () => {
    const { beta0, beta1, beta2, beta3, tau1, tau2 } = fixtures.baseline_nss;
    const parCurveFn = (t: number) => nssYield(t, beta0, beta1, beta2, beta3, tau1, tau2);
    
    const zc = bootstrapZeroCurve(parCurveFn, 40.0, 0.5);
    
    const baseCurveExp = expected.baseline_curve;
    const grid: number[] = baseCurveExp.grid;
    
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      const tsZeroRate = zc.getZeroRate(t);
      const tsDf = zc.getDiscountFactor(t);
      
      const pyZeroRate = baseCurveExp.zero_rates[i];
      const pyDf = baseCurveExp.discount_factors[i];
      
      // Yield within 0.1 basis points (0.001%)
      expect(tsZeroRate).toBeCloseTo(pyZeroRate, 3);
      // Discount factors within 1e-6
      expect(tsDf).toBeCloseTo(pyDf, 6);
    }
  });

  // 2. Conventions, Cashflows, Pricing, Risk, and Scenario Parity
  for (const tdStr of fixtures.trade_dates) {
    describe(`Trade Date: ${tdStr}`, () => {
      const td = new Date(tdStr);
      const pyData = expected.trade_dates[tdStr];
      
      test("Settlement Date Parity", () => {
        const tsSd = getSettlementDate(td);
        // format as YYYY-MM-DD in local time
        const offset = tsSd.getTimezoneOffset();
        const localSd = new Date(tsSd.getTime() - (offset * 60 * 1000));
        const tsSdStr = localSd.toISOString().split("T")[0];
        expect(tsSdStr).toBe(pyData.settlement_date);
      });
      
      const sd = getSettlementDate(td);
      
      // Baseline Portfolio Pricing & Risk Parity
      describe("Baseline NSS Curve", () => {
        const { beta0, beta1, beta2, beta3, tau1, tau2 } = fixtures.baseline_nss;
        const parCurveFn = (t: number) => nssYield(t, beta0, beta1, beta2, beta3, tau1, tau2);
        const zc = bootstrapZeroCurve(parCurveFn, 40.0, 0.5);
        
        for (const bond of fixtures.portfolio) {
          test(`Bond ID: ${bond.id}`, () => {
            const pyBond = pyData.bonds[bond.id];
            
            const issueDate = new Date(bond.issue_date);
            const maturityDate = new Date(bond.maturity_date);
            
            const cashflows = generateCashflows(issueDate, maturityDate, bond.coupon_rate, 2, bond.face_value);
            
            // Check cashflow parity
            expect(cashflows.length).toBe(pyBond.cashflows.length);
            for (let i = 0; i < cashflows.length; i++) {
              expect(cashflows[i].amount).toBeCloseTo(pyBond.cashflows[i].amount, 6);
              expect(cashflows[i].type).toBe(pyBond.cashflows[i].type);
            }
            
            // Accrued Interest parity
            const accrued = calculateAccruedInterest(sd, issueDate, maturityDate, bond.coupon_rate, 2, bond.face_value);
            expect(accrued).toBeCloseTo(pyBond.accrued_interest, 6);
            
            // Dirty Price parity (within ₹0.01 per ₹100 face value)
            const dirtyPrice = calculateDirtyPrice(sd, cashflows, zc);
            expect(dirtyPrice).toBeCloseTo(pyBond.dirty_price, 2);
            
            // Clean Price parity (within ₹0.01)
            const cleanPrice = calculateCleanPrice(sd, issueDate, maturityDate, bond.coupon_rate, cashflows, zc, 2, bond.face_value);
            expect(cleanPrice).toBeCloseTo(pyBond.clean_price, 2);
            
            // YTM parity (within 0.1 basis points = 0.001%)
            const ytm = calculateYtm(sd, cashflows, dirtyPrice, 2);
            expect(ytm).toBeCloseTo(pyBond.ytm, 3);
            
            // Duration parity (within 1e-4 years)
            const macDur = calculateMacaulayDuration(sd, cashflows, ytm, 2);
            expect(macDur).toBeCloseTo(pyBond.macaulay_duration, 4);
            
            const modDur = calculateModifiedDuration(macDur, ytm, 2);
            expect(modDur).toBeCloseTo(pyBond.modified_duration, 4);
            
            // DV01 parity (within 1e-5)
            const dv01 = calculateDv01(sd, cashflows, zc);
            expect(dv01).toBeCloseTo(pyBond.dv01, 5);
            
            // Convexity parity (within 1e-3)
            const conv = calculateConvexity(sd, cashflows, zc);
            expect(conv).toBeCloseTo(pyBond.convexity, 3);
            
            // KRD parity (within 1e-4)
            const krd = calculateKeyRateDurations(sd, cashflows, zc, fixtures.key_tenors);
            expect(krd.length).toBe(pyBond.krd.length);
            for (let i = 0; i < krd.length; i++) {
              expect(krd[i]).toBeCloseTo(pyBond.krd[i], 4);
            }
          });
        }
      });
      
      // Scenario Shocked Portfolio Pricing & Risk Parity
      for (const scen of fixtures.scenarios) {
        describe(`Scenario: ${scen.name}`, () => {
          const zcScen = getShockedZeroCurve(fixtures.baseline_nss, scen.shocks, 40.0, 0.5);
          const pyScenData = pyData.scenarios[scen.name];
          
          test("Shocked Curve Parity", () => {
            const grid: number[] = fixtures.key_tenors;
            for (let i = 0; i < grid.length; i++) {
              const t = grid[i];
              expect(zcScen.getZeroRate(t)).toBeCloseTo(pyScenData.zero_rates[i], 3);
              expect(zcScen.getDiscountFactor(t)).toBeCloseTo(pyScenData.discount_factors[i], 6);
            }
          });
          
          for (const bond of fixtures.portfolio) {
            test(`Shocked Bond ID: ${bond.id}`, () => {
              const pyBond = pyScenData.bonds[bond.id];
              
              const issueDate = new Date(bond.issue_date);
              const maturityDate = new Date(bond.maturity_date);
              
              const cashflows = generateCashflows(issueDate, maturityDate, bond.coupon_rate, 2, bond.face_value);
              
              const dirtyPrice = calculateDirtyPrice(sd, cashflows, zcScen);
              expect(dirtyPrice).toBeCloseTo(pyBond.dirty_price, 2);
              
              const cleanPrice = calculateCleanPrice(sd, issueDate, maturityDate, bond.coupon_rate, cashflows, zcScen, 2, bond.face_value);
              expect(cleanPrice).toBeCloseTo(pyBond.clean_price, 2);
              
              const ytm = calculateYtm(sd, cashflows, dirtyPrice, 2);
              expect(ytm).toBeCloseTo(pyBond.ytm, 3);
              
              const macDur = calculateMacaulayDuration(sd, cashflows, ytm, 2);
              expect(macDur).toBeCloseTo(pyBond.macaulay_duration, 4);
              
              const modDur = calculateModifiedDuration(macDur, ytm, 2);
              expect(modDur).toBeCloseTo(pyBond.modified_duration, 4);
              
              const dv01 = calculateDv01(sd, cashflows, zcScen);
              expect(dv01).toBeCloseTo(pyBond.dv01, 5);
              
              const conv = calculateConvexity(sd, cashflows, zcScen);
              expect(conv).toBeCloseTo(pyBond.convexity, 3);
              
               const krd = calculateKeyRateDurations(sd, cashflows, zcScen, fixtures.key_tenors);
              expect(krd.length).toBe(pyBond.krd.length);
              for (let i = 0; i < krd.length; i++) {
                expect(krd[i]).toBeCloseTo(pyBond.krd[i], 4);
              }

              // Factor P&L Decomposition Parity
              const factorPnL = calculatePositionFactorPnLDecomposition(
                sd,
                cashflows,
                fixtures.baseline_nss,
                scen.shocks,
                bond.face_value
              );
              expect(factorPnL.level).toBeCloseTo(pyBond.factor_pnl.level, 4);
              expect(factorPnL.slope).toBeCloseTo(pyBond.factor_pnl.slope, 4);
              expect(factorPnL.curvature1).toBeCloseTo(pyBond.factor_pnl.curvature1, 4);
              expect(factorPnL.curvature2).toBeCloseTo(pyBond.factor_pnl.curvature2, 4);
              expect(factorPnL.residual).toBeCloseTo(pyBond.factor_pnl.residual, 4);
              expect(factorPnL.total).toBeCloseTo(pyBond.factor_pnl.total, 4);

              // Optimized Factor P&L Parity — pre-bootstrapped curves must produce identical output
              const baseNss = fixtures.baseline_nss;
              const h = 0.01;
              const parCurveFn = (t: number) => nssYield(t, baseNss.beta0, baseNss.beta1, baseNss.beta2, baseNss.beta3, baseNss.tau1, baseNss.tau2);
              const shockedNss = applyScenarioShocks(baseNss, scen.shocks);
              const curves: PreBootstrappedFactorCurves = {
                baseZc: bootstrapZeroCurve(parCurveFn, 40.0, 0.5),
                shockedZc: bootstrapZeroCurve(
                  (t: number) => nssYield(t, shockedNss.beta0, shockedNss.beta1, shockedNss.beta2, shockedNss.beta3, baseNss.tau1, baseNss.tau2),
                  40.0, 0.5
                ),
                b0Up: bootstrapZeroCurve((t: number) => nssYield(t, baseNss.beta0 + h, baseNss.beta1, baseNss.beta2, baseNss.beta3, baseNss.tau1, baseNss.tau2), 40.0, 0.5),
                b0Down: bootstrapZeroCurve((t: number) => nssYield(t, baseNss.beta0 - h, baseNss.beta1, baseNss.beta2, baseNss.beta3, baseNss.tau1, baseNss.tau2), 40.0, 0.5),
                b1Up: bootstrapZeroCurve((t: number) => nssYield(t, baseNss.beta0, baseNss.beta1 + h, baseNss.beta2, baseNss.beta3, baseNss.tau1, baseNss.tau2), 40.0, 0.5),
                b1Down: bootstrapZeroCurve((t: number) => nssYield(t, baseNss.beta0, baseNss.beta1 - h, baseNss.beta2, baseNss.beta3, baseNss.tau1, baseNss.tau2), 40.0, 0.5),
                b2Up: bootstrapZeroCurve((t: number) => nssYield(t, baseNss.beta0, baseNss.beta1, baseNss.beta2 + h, baseNss.beta3, baseNss.tau1, baseNss.tau2), 40.0, 0.5),
                b2Down: bootstrapZeroCurve((t: number) => nssYield(t, baseNss.beta0, baseNss.beta1, baseNss.beta2 - h, baseNss.beta3, baseNss.tau1, baseNss.tau2), 40.0, 0.5),
                b3Up: bootstrapZeroCurve((t: number) => nssYield(t, baseNss.beta0, baseNss.beta1, baseNss.beta2, baseNss.beta3 + h, baseNss.tau1, baseNss.tau2), 40.0, 0.5),
                b3Down: bootstrapZeroCurve((t: number) => nssYield(t, baseNss.beta0, baseNss.beta1, baseNss.beta2, baseNss.beta3 - h, baseNss.tau1, baseNss.tau2), 40.0, 0.5),
              };
              const factorPnLOpt = calculatePositionFactorPnLDecompositionOptimized(
                sd, cashflows, fixtures.baseline_nss, scen.shocks, curves, bond.face_value
              );
              expect(factorPnLOpt.level).toBeCloseTo(factorPnL.level, 10);
              expect(factorPnLOpt.slope).toBeCloseTo(factorPnL.slope, 10);
              expect(factorPnLOpt.curvature1).toBeCloseTo(factorPnL.curvature1, 10);
              expect(factorPnLOpt.curvature2).toBeCloseTo(factorPnL.curvature2, 10);
              expect(factorPnLOpt.residual).toBeCloseTo(factorPnL.residual, 10);
              expect(factorPnLOpt.total).toBeCloseTo(factorPnL.total, 10);
            });
          }
        });
      }
    });
  }
});
