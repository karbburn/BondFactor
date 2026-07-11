'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useCurve, SecurityItem } from './CurveContext';
import { usePortfolio } from './PortfolioContext';
import { useScenario } from './ScenarioContext';

import { getSettlementDate, calculateAccruedInterest } from '../pricing-engine/conventions';
import { generateCashflows } from '../pricing-engine/cashflow';
import { bootstrapZeroCurve, ZeroCurve } from '../pricing-engine/bootstrap';
import { calculateDirtyPrice, calculateCleanPrice, calculateYtm } from '../pricing-engine/pricing';
import { calculateMacaulayDuration, calculateModifiedDuration, calculateDv01, calculateConvexity } from '../pricing-engine/risk';
import { applyScenarioShocks, nssYield } from '../pricing-engine/scenario';
import { calculateKeyRateDurations, DEFAULT_KEY_TENORS } from '../pricing-engine/krd';

export interface ComputedPosition {
  security: SecurityItem;
  faceValue: number;
  baseAccrued: number;
  baseDirtyPrice: number;
  baseCleanPrice: number;
  baseDirtyValue: number;
  baseCleanValue: number;
  ytm: number;
  macDur: number;
  modDur: number;
  dv01: number;
  conv: number;
  krd: number[];
  
  shockedAccrued: number;
  shockedDirtyPrice: number;
  shockedCleanPrice: number;
  shockedDirtyValue: number;
  shockedCleanValue: number;
  shockedYtm: number;
  shockedMacDur: number;
  shockedModDur: number;
  shockedDv01: number;
  shockedConv: number;
  shockedKrd: number[];
  
  pnl: number;
}

export interface PortfolioSummary {
  totalBaseDirtyValue: number;
  totalBaseCleanValue: number;
  totalShockedDirtyValue: number;
  totalPnl: number;
  portfolioMacDur: number;
  portfolioModDur: number;
  portfolioDv01: number;
  portfolioConvexity: number;
  portfolioKrd: number[];
}

interface ResultsContextType {
  baseZc: ZeroCurve;
  shockedZc: ZeroCurve;
  computedPositions: ComputedPosition[];
  summary: PortfolioSummary;
}

const ResultsContext = createContext<ResultsContextType | null>(null);

export function ResultsProvider({ children }: { children: React.ReactNode }) {
  const { curve } = useCurve();
  const { portfolio } = usePortfolio();
  const { parallelShift, slopeShock, curvature1Shock, curvature2Shock, twistShock, twistPivot } = useScenario();

  // Fallback NSS parameters (baseline)
  const baseParams = useMemo(() => {
    if (curve && curve.parameters) {
      return curve.parameters;
    }
    return {
      beta0: 7.2,
      beta1: -1.5,
      beta2: 2.0,
      beta3: -0.8,
      tau1: 1.5,
      tau2: 6.0
    };
  }, [curve]);

  // Base Zero Curve
  const baseZc = useMemo(() => {
    const parCurveFn = (t: number) => nssYield(
      t, 
      baseParams.beta0, 
      baseParams.beta1, 
      baseParams.beta2, 
      baseParams.beta3, 
      baseParams.tau1, 
      baseParams.tau2
    );
    return bootstrapZeroCurve(parCurveFn, 40.0, 0.5);
  }, [baseParams]);

  // Shocked NSS Parameters
  const shockedParams = useMemo(() => {
    return applyScenarioShocks(baseParams, {
      parallel_shift: parallelShift,
      slope_shock: slopeShock,
      curvature1_shock: curvature1Shock,
      curvature2_shock: curvature2Shock,
      twist_shock: twistShock,
      twist_pivot: twistPivot
    });
  }, [baseParams, parallelShift, slopeShock, curvature1Shock, curvature2Shock, twistShock, twistPivot]);

  // Shocked Zero Curve
  const shockedZc = useMemo(() => {
    const parCurveFn = (t: number) => nssYield(
      t, 
      shockedParams.beta0, 
      shockedParams.beta1, 
      shockedParams.beta2, 
      shockedParams.beta3, 
      shockedParams.tau1, 
      shockedParams.tau2
    );
    return bootstrapZeroCurve(parCurveFn, 40.0, 0.5);
  }, [shockedParams]);

  // Position-level calculations
  const computedPositions = useMemo<ComputedPosition[]>(() => {
    if (portfolio.length === 0) return [];

    const refDate = curve ? new Date(curve.curve_date) : new Date();
    const sd = getSettlementDate(refDate);

    return portfolio.map(pos => {
      const security = pos.security;
      const faceValue = pos.faceValue;
      const issueDate = new Date(security.issue_date);
      const maturityDate = new Date(security.maturity_date);
      const couponRate = security.coupon_rate;
      const couponFrequency = security.coupon_frequency || 2;

      const cfs = generateCashflows(issueDate, maturityDate, couponRate, couponFrequency, 100.0);

      // Base calculations
      const baseAccrued = calculateAccruedInterest(sd, issueDate, maturityDate, couponRate, couponFrequency, 100.0);
      const baseDirtyPrice = calculateDirtyPrice(sd, cfs, baseZc);
      const baseCleanPrice = calculateCleanPrice(sd, issueDate, maturityDate, couponRate, cfs, baseZc, couponFrequency, 100.0);
      const baseDirtyValue = baseDirtyPrice * (faceValue / 100.0);
      const baseCleanValue = baseCleanPrice * (faceValue / 100.0);

      const ytm = calculateYtm(sd, cfs, baseDirtyPrice, couponFrequency);
      const macDur = calculateMacaulayDuration(sd, cfs, ytm, couponFrequency);
      const modDur = calculateModifiedDuration(macDur, ytm, couponFrequency);
      const dv01 = calculateDv01(sd, cfs, baseZc);
      const conv = calculateConvexity(sd, cfs, baseZc);
      const krd = calculateKeyRateDurations(sd, cfs, baseZc, DEFAULT_KEY_TENORS);

      // Shocked calculations
      const shockedAccrued = calculateAccruedInterest(sd, issueDate, maturityDate, couponRate, couponFrequency, 100.0);
      const shockedDirtyPrice = calculateDirtyPrice(sd, cfs, shockedZc);
      const shockedCleanPrice = calculateCleanPrice(sd, issueDate, maturityDate, couponRate, cfs, shockedZc, couponFrequency, 100.0);
      const shockedDirtyValue = shockedDirtyPrice * (faceValue / 100.0);
      const shockedCleanValue = shockedCleanPrice * (faceValue / 100.0);

      const shockedYtm = calculateYtm(sd, cfs, shockedDirtyPrice, couponFrequency);
      const shockedMacDur = calculateMacaulayDuration(sd, cfs, shockedYtm, couponFrequency);
      const shockedModDur = calculateModifiedDuration(shockedMacDur, shockedYtm, couponFrequency);
      const shockedDv01 = calculateDv01(sd, cfs, shockedZc);
      const shockedConv = calculateConvexity(sd, cfs, shockedZc);
      const shockedKrd = calculateKeyRateDurations(sd, cfs, shockedZc, DEFAULT_KEY_TENORS);

      const pnl = shockedDirtyValue - baseDirtyValue;

      return {
        security,
        faceValue,
        baseAccrued,
        baseDirtyPrice,
        baseCleanPrice,
        baseDirtyValue,
        baseCleanValue,
        ytm,
        macDur,
        modDur,
        dv01,
        conv,
        krd,
        
        shockedAccrued,
        shockedDirtyPrice,
        shockedCleanPrice,
        shockedDirtyValue,
        shockedCleanValue,
        shockedYtm,
        shockedMacDur,
        shockedModDur,
        shockedDv01,
        shockedConv,
        shockedKrd,
        
        pnl
      };
    });
  }, [portfolio, baseZc, shockedZc, curve]);

  // Aggregate portfolio metrics
  const summary = useMemo<PortfolioSummary>(() => {
    if (computedPositions.length === 0) {
      return {
        totalBaseDirtyValue: 0,
        totalBaseCleanValue: 0,
        totalShockedDirtyValue: 0,
        totalPnl: 0,
        portfolioMacDur: 0,
        portfolioModDur: 0,
        portfolioDv01: 0,
        portfolioConvexity: 0,
        portfolioKrd: new Array(DEFAULT_KEY_TENORS.length).fill(0.0)
      };
    }

    let totalBaseDirtyValue = 0;
    let totalBaseCleanValue = 0;
    let totalShockedDirtyValue = 0;
    let totalPnl = 0;
    let totalDv01 = 0;

    let weightedMacDurSum = 0;
    let weightedModDurSum = 0;
    let weightedConvSum = 0;
    const totalKrd = new Array(DEFAULT_KEY_TENORS.length).fill(0.0);

    for (const pos of computedPositions) {
      totalBaseDirtyValue += pos.baseDirtyValue;
      totalBaseCleanValue += pos.baseCleanValue;
      totalShockedDirtyValue += pos.shockedDirtyValue;
      totalPnl += pos.pnl;
      // DV01 is absolute price change per 1bp shift on face value
      totalDv01 += pos.dv01 * (pos.faceValue / 100.0);

      weightedMacDurSum += pos.macDur * pos.baseDirtyValue;
      weightedModDurSum += pos.modDur * pos.baseDirtyValue;
      weightedConvSum += pos.conv * pos.baseDirtyValue;

      for (let k = 0; k < DEFAULT_KEY_TENORS.length; k++) {
        totalKrd[k] += pos.krd[k] * (pos.faceValue / 100.0);
      }
    }

    return {
      totalBaseDirtyValue,
      totalBaseCleanValue,
      totalShockedDirtyValue,
      totalPnl,
      portfolioMacDur: totalBaseDirtyValue > 0 ? weightedMacDurSum / totalBaseDirtyValue : 0,
      portfolioModDur: totalBaseDirtyValue > 0 ? weightedModDurSum / totalBaseDirtyValue : 0,
      portfolioDv01: totalDv01,
      portfolioConvexity: totalBaseDirtyValue > 0 ? weightedConvSum / totalBaseDirtyValue : 0,
      portfolioKrd: totalKrd
    };
  }, [computedPositions]);

  return (
    <ResultsContext.Provider value={{ baseZc, shockedZc, computedPositions, summary }}>
      {children}
    </ResultsContext.Provider>
  );
}

export function useResults() {
  const context = useContext(ResultsContext);
  if (!context) {
    throw new Error('useResults must be used within a ResultsProvider');
  }
  return context;
}
