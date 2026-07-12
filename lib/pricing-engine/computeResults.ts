import { getSettlementDate, calculateAccruedInterest } from './conventions';
import { generateCashflows } from './cashflow';
import { bootstrapZeroCurve, ZeroCurve } from './bootstrap';
import { calculateDirtyPrice, calculateCleanPrice, calculateYtm } from './pricing';
import { calculateMacaulayDuration, calculateModifiedDuration, calculateDv01, calculateConvexity, calculatePositionFactorPnLDecomposition, FactorPnLDecomposition } from './risk';
import { applyScenarioShocks, nssYield } from './scenario';
import { calculateKeyRateDurations, DEFAULT_KEY_TENORS } from './krd';
import { NSSParameters } from './types';

export interface ComputedPosition {
  security: {
    isin: string;
    security_name: string;
    issue_date: string;
    maturity_date: string;
    coupon_rate: number;
    coupon_frequency: number;
    face_value: number;
  };
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
  factorPnL: FactorPnLDecomposition;
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
  portfolioKrs: number[];
  factorPnL: FactorPnLDecomposition;
}

export interface PositionInput {
  security: {
    isin: string;
    security_name: string;
    issue_date: string;
    maturity_date: string;
    coupon_rate: number;
    coupon_frequency: number;
    face_value: number;
  };
  faceValue: number;
}

export interface ScenarioShocks {
  parallel_shift: number;
  slope_shock: number;
  curvature1_shock: number;
  curvature2_shock: number;
  twist_shock: number;
  twist_pivot: number;
}

export function buildZeroCurve(params: NSSParameters): ZeroCurve {
  const fn = (t: number) => nssYield(t, params.beta0, params.beta1, params.beta2, params.beta3, params.tau1, params.tau2);
  return bootstrapZeroCurve(fn, 40.0, 0.5);
}

export function applyShocks(baseParams: NSSParameters, shocks: ScenarioShocks): NSSParameters {
  return applyScenarioShocks(baseParams, {
    parallel_shift: shocks.parallel_shift,
    slope_shock: shocks.slope_shock,
    curvature1_shock: shocks.curvature1_shock,
    curvature2_shock: shocks.curvature2_shock,
    twist_shock: shocks.twist_shock,
    twist_pivot: shocks.twist_pivot,
  });
}

export function computePortfolioResults(
  portfolio: PositionInput[],
  baseZc: ZeroCurve,
  shockedZc: ZeroCurve,
  curveDate: string,
  baseParams: NSSParameters,
  shocks: ScenarioShocks
): { computedPositions: ComputedPosition[]; summary: PortfolioSummary } {
  if (portfolio.length === 0) {
    return {
      computedPositions: [],
      summary: emptySummary(),
    };
  }

  const sd = getSettlementDate(new Date(curveDate));

  const computedPositions: ComputedPosition[] = portfolio.map(pos => {
    const s = pos.security;
    const faceValue = pos.faceValue;
    const issueDate = new Date(s.issue_date);
    const maturityDate = new Date(s.maturity_date);
    const couponRate = s.coupon_rate;
    const freq = s.coupon_frequency || 2;

    const cfs = generateCashflows(issueDate, maturityDate, couponRate, freq, 100.0);

    const baseAccrued = calculateAccruedInterest(sd, issueDate, maturityDate, couponRate, freq, 100.0);
    const baseDirtyPrice = calculateDirtyPrice(sd, cfs, baseZc);
    const baseCleanPrice = calculateCleanPrice(sd, issueDate, maturityDate, couponRate, cfs, baseZc, freq, 100.0);
    const baseDirtyValue = baseDirtyPrice * (faceValue / 100.0);
    const baseCleanValue = baseCleanPrice * (faceValue / 100.0);
    const ytm = calculateYtm(sd, cfs, baseDirtyPrice, freq);
    const macDur = calculateMacaulayDuration(sd, cfs, ytm, freq);
    const modDur = calculateModifiedDuration(macDur, ytm, freq);
    const dv01 = calculateDv01(sd, cfs, baseZc);
    const conv = calculateConvexity(sd, cfs, baseZc);
    const krd = calculateKeyRateDurations(sd, cfs, baseZc, DEFAULT_KEY_TENORS);

    const shockedDirtyPrice = calculateDirtyPrice(sd, cfs, shockedZc);
    const shockedCleanPrice = calculateCleanPrice(sd, issueDate, maturityDate, couponRate, cfs, shockedZc, freq, 100.0);
    const shockedDirtyValue = shockedDirtyPrice * (faceValue / 100.0);
    const shockedCleanValue = shockedCleanPrice * (faceValue / 100.0);
    const shockedYtm = calculateYtm(sd, cfs, shockedDirtyPrice, freq);
    const shockedMacDur = calculateMacaulayDuration(sd, cfs, shockedYtm, freq);
    const shockedModDur = calculateModifiedDuration(shockedMacDur, shockedYtm, freq);
    const shockedDv01 = calculateDv01(sd, cfs, shockedZc);
    const shockedConv = calculateConvexity(sd, cfs, shockedZc);
    const shockedKrd = calculateKeyRateDurations(sd, cfs, shockedZc, DEFAULT_KEY_TENORS);

    const pnl = shockedDirtyValue - baseDirtyValue;

    const factorPnL = calculatePositionFactorPnLDecomposition(
      sd,
      cfs,
      baseParams,
      {
        parallel_shift: shocks.parallel_shift,
        slope_shock: shocks.slope_shock,
        curvature1_shock: shocks.curvature1_shock,
        curvature2_shock: shocks.curvature2_shock,
        twist_shock: shocks.twist_shock,
        twist_pivot: shocks.twist_pivot
      },
      faceValue
    );

    return {
      security: s, faceValue,
      baseAccrued, baseDirtyPrice, baseCleanPrice, baseDirtyValue, baseCleanValue,
      ytm, macDur, modDur, dv01, conv, krd,
      shockedAccrued: baseAccrued, shockedDirtyPrice, shockedCleanPrice, shockedDirtyValue, shockedCleanValue,
      shockedYtm, shockedMacDur, shockedModDur, shockedDv01, shockedConv, shockedKrd,
      pnl,
      factorPnL,
    };
  });

  return { computedPositions, summary: aggregateSummary(computedPositions) };
}

function aggregateSummary(computedPositions: ComputedPosition[]): PortfolioSummary {
  if (computedPositions.length === 0) return emptySummary();

  let totalBaseDirtyValue = 0;
  let totalBaseCleanValue = 0;
  let totalShockedDirtyValue = 0;
  let totalPnl = 0;
  let totalDv01 = 0;
  let weightedMacDurSum = 0;
  let weightedModDurSum = 0;
  let weightedConvSum = 0;
  const totalKrd = new Array(DEFAULT_KEY_TENORS.length).fill(0.0);
  const totalKrs = new Array(DEFAULT_KEY_TENORS.length).fill(0.0);

  let totalLevel = 0;
  let totalSlope = 0;
  let totalCurv1 = 0;
  let totalCurv2 = 0;
  let totalResidual = 0;
  let totalDecompPnL = 0;

  for (const pos of computedPositions) {
    totalBaseDirtyValue += pos.baseDirtyValue;
    totalBaseCleanValue += pos.baseCleanValue;
    totalShockedDirtyValue += pos.shockedDirtyValue;
    totalPnl += pos.pnl;
    totalDv01 += pos.dv01 * (pos.faceValue / 100.0);
    weightedMacDurSum += pos.macDur * pos.baseDirtyValue;
    weightedModDurSum += pos.modDur * pos.baseDirtyValue;
    weightedConvSum += pos.conv * pos.baseDirtyValue;
    for (let k = 0; k < DEFAULT_KEY_TENORS.length; k++) {
      totalKrd[k] += pos.krd[k] * (pos.faceValue / 100.0);
      totalKrs[k] += pos.krd[k] * pos.baseDirtyPrice * 0.0001 * (pos.faceValue / 100.0);
    }
    if (pos.factorPnL) {
      totalLevel += pos.factorPnL.level;
      totalSlope += pos.factorPnL.slope;
      totalCurv1 += pos.factorPnL.curvature1;
      totalCurv2 += pos.factorPnL.curvature2;
      totalResidual += pos.factorPnL.residual;
      totalDecompPnL += pos.factorPnL.total;
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
    portfolioKrd: totalKrd,
    portfolioKrs: totalKrs,
    factorPnL: {
      level: totalLevel,
      slope: totalSlope,
      curvature1: totalCurv1,
      curvature2: totalCurv2,
      residual: totalResidual,
      total: totalDecompPnL
    }
  };
}

function emptySummary(): PortfolioSummary {
  return {
    totalBaseDirtyValue: 0, totalBaseCleanValue: 0, totalShockedDirtyValue: 0, totalPnl: 0,
    portfolioMacDur: 0, portfolioModDur: 0, portfolioDv01: 0, portfolioConvexity: 0,
    portfolioKrd: new Array(DEFAULT_KEY_TENORS.length).fill(0.0),
    portfolioKrs: new Array(DEFAULT_KEY_TENORS.length).fill(0.0),
    factorPnL: { level: 0, slope: 0, curvature1: 0, curvature2: 0, residual: 0, total: 0 }
  };
}
