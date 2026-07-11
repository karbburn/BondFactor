import { Cashflow } from "./types";
import { ZeroCurve } from "./bootstrap";
import { calculateDirtyPrice } from "./pricing";

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
