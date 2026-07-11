import { NSSParameters } from "./types";
import { ZeroCurve, bootstrapZeroCurve } from "./bootstrap";

export function nssYield(
  t: number,
  beta0: number,
  beta1: number,
  beta2: number,
  beta3: number,
  tau1: number,
  tau2: number
): number {
  if (t === 0) return beta0 + beta1;
  const term1 = (1.0 - Math.exp(-t / tau1)) / (t / tau1);
  const term2 = term1 - Math.exp(-t / tau1);
  const term3 = (1.0 - Math.exp(-t / tau2)) / (t / tau2) - Math.exp(-t / tau2);
  return beta0 + beta1 * term1 + beta2 * term2 + beta3 * term3;
}

export function applyScenarioShocks(
  baseParams: NSSParameters,
  shocks: {
    parallel_shift?: number;
    slope_shock?: number;
    curvature1_shock?: number;
    curvature2_shock?: number;
    twist_shock?: number;
    twist_pivot?: number;
  }
): NSSParameters {
  const parallelShift = shocks.parallel_shift ?? 0.0;
  const slopeShock = shocks.slope_shock ?? 0.0;
  const curvature1Shock = shocks.curvature1_shock ?? 0.0;
  const curvature2Shock = shocks.curvature2_shock ?? 0.0;
  const twistShock = shocks.twist_shock ?? 0.0;
  const twistPivot = shocks.twist_pivot ?? 5.0;

  const { beta0, beta1, beta2, beta3, tau1, tau2 } = baseParams;

  // Calculate twist offset at pivot
  let g1Pivot = 0.0;
  if (twistPivot > 0) {
    g1Pivot = (1.0 - Math.exp(-twistPivot / tau1)) / (twistPivot / tau1);
  } else {
    g1Pivot = 1.0;
  }
  const deltaBeta0Twist = -twistShock * g1Pivot;

  let newBeta0 = beta0 + parallelShift + deltaBeta0Twist;
  let newBeta1 = beta1 + slopeShock + twistShock;
  let newBeta2 = beta2 + curvature1Shock;
  let newBeta3 = beta3 + curvature2Shock;

  // Clamp level parameter beta0
  newBeta0 = Math.max(0.0, Math.min(25.0, newBeta0));

  return {
    beta0: newBeta0,
    beta1: Math.max(-25.0, Math.min(25.0, newBeta1)),
    beta2: Math.max(-25.0, Math.min(25.0, newBeta2)),
    beta3: Math.max(-25.0, Math.min(25.0, newBeta3)),
    tau1,
    tau2
  };
}

export function getShockedZeroCurve(
  baseParams: NSSParameters,
  shocks: {
    parallel_shift?: number;
    slope_shock?: number;
    curvature1_shock?: number;
    curvature2_shock?: number;
    twist_shock?: number;
    twist_pivot?: number;
  },
  maxMaturity: number = 40.0,
  stepSize: number = 0.5
): ZeroCurve {
  const shockedParams = applyScenarioShocks(baseParams, shocks);
  
  const parCurveFn = (t: number) => {
    return nssYield(
      t,
      shockedParams.beta0,
      shockedParams.beta1,
      shockedParams.beta2,
      shockedParams.beta3,
      shockedParams.tau1,
      shockedParams.tau2
    );
  };
  
  return bootstrapZeroCurve(parCurveFn, maxMaturity, stepSize);
}
