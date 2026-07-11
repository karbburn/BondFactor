import { Cashflow } from "./types";
import { ZeroCurve } from "./bootstrap";
import { calculateAccruedInterest } from "./conventions";

export function calculateDirtyPrice(
  settlementDate: Date, 
  cashflows: Cashflow[], 
  zc: ZeroCurve
): number {
  let dirtyPrice = 0.0;
  for (const cf of cashflows) {
    const diffDays = Math.round((cf.date.getTime() - settlementDate.getTime()) / (1000 * 60 * 60 * 24));
    const t = diffDays / 365.0;
    if (t > 0) {
      dirtyPrice += cf.amount * zc.getDiscountFactor(t);
    }
  }
  return dirtyPrice;
}

export function calculateCleanPrice(
  settlementDate: Date,
  issueDate: Date,
  maturityDate: Date,
  couponRate: number,
  cashflows: Cashflow[],
  zc: ZeroCurve,
  couponFrequency: number = 2,
  faceValue: number = 100.0
): number {
  const dirtyPrice = calculateDirtyPrice(settlementDate, cashflows, zc);
  const accrued = calculateAccruedInterest(
    settlementDate,
    issueDate,
    maturityDate,
    couponRate,
    couponFrequency,
    faceValue
  );
  return dirtyPrice - accrued;
}

export function calculateYtm(
  settlementDate: Date,
  cashflows: Cashflow[],
  dirtyPrice: number,
  couponFrequency: number = 2
): number {
  if (dirtyPrice <= 0) {
    return 0.0;
  }
  
  const futureCfs = cashflows.filter(
    cf => (cf.date.getTime() - settlementDate.getTime()) > 0
  );
  if (futureCfs.length === 0) {
    return 0.0;
  }

  const objective = (yVal: number) => {
    let pv = 0.0;
    for (const cf of futureCfs) {
      const diffDays = Math.round((cf.date.getTime() - settlementDate.getTime()) / (1000 * 60 * 60 * 24));
      const t = diffDays / 365.0;
      pv += cf.amount / Math.pow(1.0 + yVal / (100.0 * couponFrequency), couponFrequency * t);
    }
    return pv - dirtyPrice;
  };

  // Numerical solver: Bisection method
  let low = -5.0;
  let high = 100.0;
  let mid = 0.0;
  
  let fLow = objective(low);
  let fHigh = objective(high);
  
  if (fLow * fHigh > 0) {
    // Expand search interval for extreme yield cases
    low = -20.0;
    high = 500.0;
    fLow = objective(low);
    fHigh = objective(high);
    if (fLow * fHigh > 0) {
      return 0.0;
    }
  }

  for (let iter = 0; iter < 100; iter++) {
    mid = 0.5 * (low + high);
    const fMid = objective(mid);
    
    if (Math.abs(high - low) < 1e-12 || Math.abs(fMid) < 1e-12) {
      return mid;
    }
    
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }

  return mid;
}
