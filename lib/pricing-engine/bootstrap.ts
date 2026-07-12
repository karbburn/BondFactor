export class ZeroCurve {
  maturities: number[];
  zeroRates: number[];
  
  constructor(maturities: number[], zeroRates: number[]) {
    this.maturities = maturities;
    this.zeroRates = zeroRates;
  }
  
  getZeroRate(t: number): number {
    if (t <= 0) return this.zeroRates[0];
    if (t <= this.maturities[0]) return this.zeroRates[0];
    if (t >= this.maturities[this.maturities.length - 1]) {
      return this.zeroRates[this.zeroRates.length - 1];
    }
    
    // Linear interpolation
    let idx = 0;
    for (let i = 0; i < this.maturities.length - 1; i++) {
      if (t >= this.maturities[i] && t <= this.maturities[i + 1]) {
        idx = i;
        break;
      }
    }
    
    const t0 = this.maturities[idx];
    const t1 = this.maturities[idx + 1];
    const r0 = this.zeroRates[idx];
    const r1 = this.zeroRates[idx + 1];
    
    return r0 + (r1 - r0) * (t - t0) / (t1 - t0);
  }
  
  getDiscountFactor(t: number): number {
    if (t <= 0) return 1.0;
    const z = this.getZeroRate(t);
    return Math.exp(-(z / 100.0) * t);
  }
}

export function bootstrapZeroCurve(
  parCurveFn: (t: number) => number,
  maxMaturity: number = 40.0,
  stepSize: number = 0.5
): ZeroCurve {
  const steps = Math.floor(maxMaturity / stepSize);
  const maturities: number[] = [];
  const zeroRates: number[] = [];
  const discountFactors: number[] = [];
  let runningSumDf = 0.0;
  
  for (let i = 0; i < steps; i++) {
    const t = stepSize * (i + 1);
    maturities.push(t);
    
    const parY = parCurveFn(t);
    const c = parY / (1.0 / stepSize);
    
    const df = (100.0 - c * runningSumDf) / (100.0 + c);
    discountFactors.push(df);
    runningSumDf += df;
    
    const z = -Math.log(df) / t * 100.0;
    zeroRates.push(z);
  }
  
  return new ZeroCurve(maturities, zeroRates);
}
