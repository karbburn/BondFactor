import { Cashflow } from "./types";
import { ZeroCurve } from "./bootstrap";
import { calculateDirtyPrice } from "./pricing";

export const DEFAULT_KEY_TENORS = [0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0, 40.0];

export class KRD_PerturbedZeroCurve {
  baseZc: ZeroCurve;
  keyTenors: number[];
  keyIdx: number;

  constructor(baseZc: ZeroCurve, keyTenors: number[], keyIdx: number) {
    this.baseZc = baseZc;
    this.keyTenors = keyTenors;
    this.keyIdx = keyIdx;
  }

  getZeroRate(t: number): number {
    const r = this.baseZc.getZeroRate(t);
    const n = this.keyTenors.length;
    const tK = this.keyTenors[this.keyIdx];
    
    let bump = 0.0;
    if (n === 1) {
      bump = 0.01;
    } else if (this.keyIdx === 0) { // First key rate
      const tNext = this.keyTenors[1];
      if (t <= tK) {
        bump = 0.01;
      } else if (t < tNext) {
        bump = 0.01 * (tNext - t) / (tNext - tK);
      }
    } else if (this.keyIdx === n - 1) { // Last key rate
      const tPrev = this.keyTenors[n - 2];
      if (t >= tK) {
        bump = 0.01;
      } else if (t > tPrev) {
        bump = 0.01 * (t - tPrev) / (tK - tPrev);
      }
    } else { // Intermediate key rate
      const tPrev = this.keyTenors[this.keyIdx - 1];
      const tNext = this.keyTenors[this.keyIdx + 1];
      if (t > tPrev && t <= tK) {
        bump = 0.01 * (t - tPrev) / (tK - tPrev);
      } else if (t > tK && t < tNext) {
        bump = 0.01 * (tNext - t) / (tNext - tK);
      }
    }
    
    return r + bump;
  }

  getDiscountFactor(t: number): number {
    if (t <= 0) return 1.0;
    const z = this.getZeroRate(t);
    return Math.exp(-(z / 100.0) * t);
  }
}

export function calculateKeyRateDurations(
  settlementDate: Date,
  cashflows: Cashflow[],
  zc: ZeroCurve,
  keyTenors: number[] = DEFAULT_KEY_TENORS
): number[] {
  const p0 = calculateDirtyPrice(settlementDate, cashflows, zc);
  if (p0 <= 0) {
    return new Array(keyTenors.length).fill(0.0);
  }

  const krds: number[] = [];
  for (let k = 0; k < keyTenors.length; k++) {
    const zcPerturbed = new KRD_PerturbedZeroCurve(zc, keyTenors, k) as unknown as ZeroCurve;
    const pPerturbed = calculateDirtyPrice(settlementDate, cashflows, zcPerturbed);
    
    // Duration calculation: percentage price change per 1% yield change
    // Local bump is 1bp = 0.01% = 0.0001 decimal.
    const krd = (p0 - pPerturbed) / (p0 * 0.0001);
    krds.push(krd);
  }

  return krds;
}
