import { Cashflow, NSSParameters } from "./types";
import { ZeroCurve, bootstrapZeroCurve } from "./bootstrap";
import { calculateDirtyPrice } from "./pricing";
import { nssYield, applyScenarioShocks } from "./scenario";

export function calculateMacaulayDuration(
  settlementDate: Date,
  cashflows: Cashflow[],
  ytm: number,
  couponFrequency: number = 2
): number {
  const futureCfs = cashflows.filter(
    cf => (cf.date.getTime() - settlementDate.getTime()) > 0
  );
  if (futureCfs.length === 0) {
    return 0.0;
  }

  let numerator = 0.0;
  let denominator = 0.0;

  for (const cf of futureCfs) {
    const diffDays = Math.round((cf.date.getTime() - settlementDate.getTime()) / (1000 * 60 * 60 * 24));
    const t = diffDays / 365.0;
    const df = 1.0 / Math.pow(1.0 + ytm / (100.0 * couponFrequency), couponFrequency * t);
    const pv = cf.amount * df;
    
    numerator += t * pv;
    denominator += pv;
  }

  if (denominator === 0) {
    return 0.0;
  }
  return numerator / denominator;
}

export function calculateModifiedDuration(
  macaulayDuration: number,
  ytm: number,
  couponFrequency: number = 2
): number {
  return macaulayDuration / (1.0 + ytm / (100.0 * couponFrequency));
}

export function calculateDv01(
  settlementDate: Date,
  cashflows: Cashflow[],
  zc: ZeroCurve
): number {
  const p0 = calculateDirtyPrice(settlementDate, cashflows, zc);
  
  // Parallel shift zero rates up by 1bp (0.01%)
  const bumpedRates = zc.zeroRates.map(r => r + 0.01);
  const zcBumped = new ZeroCurve(zc.maturities, bumpedRates);
  
  const pUp = calculateDirtyPrice(settlementDate, cashflows, zcBumped);
  
  return p0 - pUp;
}

export function calculateConvexity(
  settlementDate: Date,
  cashflows: Cashflow[],
  zc: ZeroCurve
): number {
  const p0 = calculateDirtyPrice(settlementDate, cashflows, zc);
  if (p0 <= 0) {
    return 0.0;
  }

  const shift = 0.1; // 10 bps zero rate shift
  const h = 0.001;   // 10 bps decimal shift
  
  const bumpedRatesUp = zc.zeroRates.map(r => r + shift);
  const zcUp = new ZeroCurve(zc.maturities, bumpedRatesUp);
  const pUp = calculateDirtyPrice(settlementDate, cashflows, zcUp);
  
  const bumpedRatesDown = zc.zeroRates.map(r => r - shift);
  const zcDown = new ZeroCurve(zc.maturities, bumpedRatesDown);
  const pDown = calculateDirtyPrice(settlementDate, cashflows, zcDown);
  
  return (pUp + pDown - 2.0 * p0) / (p0 * (h * h));
}

export interface FactorPnLDecomposition {
  level: number;
  slope: number;
  curvature1: number;
  curvature2: number;
  residual: number;
  total: number;
}

export function calculatePositionFactorPnLDecomposition(
  settlementDate: Date,
  cashflows: Cashflow[],
  baseParams: NSSParameters,
  shocks: {
    parallel_shift?: number;
    slope_shock?: number;
    curvature1_shock?: number;
    curvature2_shock?: number;
    twist_shock?: number;
    twist_pivot?: number;
  },
  faceValue: number = 100.0
): FactorPnLDecomposition {
  const parallelShift = shocks.parallel_shift ?? 0.0;
  const slopeShock = shocks.slope_shock ?? 0.0;
  const curvature1Shock = shocks.curvature1_shock ?? 0.0;
  const curvature2Shock = shocks.curvature2_shock ?? 0.0;
  const twistShock = shocks.twist_shock ?? 0.0;
  const twistPivot = shocks.twist_pivot ?? 5.0;

  const tau1 = baseParams.tau1;
  let g1Pivot = 0.0;
  if (twistPivot > 0) {
    g1Pivot = (1.0 - Math.exp(-twistPivot / tau1)) / (twistPivot / tau1);
  } else {
    g1Pivot = 1.0;
  }

  const deltaBeta0Twist = -twistShock * g1Pivot;
  const deltaBeta0 = parallelShift + deltaBeta0Twist;
  const deltaBeta1 = slopeShock + twistShock;
  const deltaBeta2 = curvature1Shock;
  const deltaBeta3 = curvature2Shock;

  function getPriceForParams(b0: number, b1: number, b2: number, b3: number): number {
    const parCurveFn = (t: number) => {
      return nssYield(t, b0, b1, b2, b3, baseParams.tau1, baseParams.tau2);
    };
    const zc = bootstrapZeroCurve(parCurveFn, 40.0, 0.5);
    return calculateDirtyPrice(settlementDate, cashflows, zc);
  }

  const pBase = getPriceForParams(
    baseParams.beta0,
    baseParams.beta1,
    baseParams.beta2,
    baseParams.beta3
  );

  const shockedParams = applyScenarioShocks(baseParams, shocks);
  const pShocked = getPriceForParams(
    shockedParams.beta0,
    shockedParams.beta1,
    shockedParams.beta2,
    shockedParams.beta3
  );
  const totalPnL = (pShocked - pBase) * (faceValue / 100.0);

  // Central difference bump h = 1bp (0.01 percentage point)
  const h = 0.01;

  const pB0Up = getPriceForParams(baseParams.beta0 + h, baseParams.beta1, baseParams.beta2, baseParams.beta3);
  const pB0Down = getPriceForParams(baseParams.beta0 - h, baseParams.beta1, baseParams.beta2, baseParams.beta3);
  const dB0 = (pB0Up - pB0Down) / (2.0 * h);

  const pB1Up = getPriceForParams(baseParams.beta0, baseParams.beta1 + h, baseParams.beta2, baseParams.beta3);
  const pB1Down = getPriceForParams(baseParams.beta0, baseParams.beta1 - h, baseParams.beta2, baseParams.beta3);
  const dB1 = (pB1Up - pB1Down) / (2.0 * h);

  const pB2Up = getPriceForParams(baseParams.beta0, baseParams.beta1, baseParams.beta2 + h, baseParams.beta3);
  const pB2Down = getPriceForParams(baseParams.beta0, baseParams.beta1, baseParams.beta2 - h, baseParams.beta3);
  const dB2 = (pB2Up - pB2Down) / (2.0 * h);

  const pB3Up = getPriceForParams(baseParams.beta0, baseParams.beta1, baseParams.beta2, baseParams.beta3 + h);
  const pB3Down = getPriceForParams(baseParams.beta0, baseParams.beta1, baseParams.beta2, baseParams.beta3 - h);
  const dB3 = (pB3Up - pB3Down) / (2.0 * h);

  const contribLevel = dB0 * deltaBeta0 * (faceValue / 100.0);
  const contribSlope = dB1 * deltaBeta1 * (faceValue / 100.0);
  const contribCurv1 = dB2 * deltaBeta2 * (faceValue / 100.0);
  const contribCurv2 = dB3 * deltaBeta3 * (faceValue / 100.0);

  const residual = totalPnL - (contribLevel + contribSlope + contribCurv1 + contribCurv2);

  return {
    level: contribLevel,
    slope: contribSlope,
    curvature1: contribCurv1,
    curvature2: contribCurv2,
    residual: residual,
    total: totalPnL
  };
}

