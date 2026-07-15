'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useCurve } from './CurveContext';
import { usePortfolio } from './PortfolioContext';
import { useScenario } from './ScenarioContext';

import { buildZeroCurve, applyShocks, computePortfolioResults, ScenarioShocks, ComputedPosition, PortfolioSummary } from '../pricing-engine/computeResults';
import { ZeroCurve } from '../pricing-engine/bootstrap';
import { FALLBACK_NSS_PARAMS } from '../pricing-engine/constants';
export type { ComputedPosition, PortfolioSummary };

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

  const baseParams = useMemo(() => {
    if (curve?.parameters) return curve.parameters;
    return FALLBACK_NSS_PARAMS;
  }, [curve]);

  const shocks: ScenarioShocks = useMemo(() => ({
    parallel_shift: parallelShift,
    slope_shock: slopeShock,
    curvature1_shock: curvature1Shock,
    curvature2_shock: curvature2Shock,
    twist_shock: twistShock,
    twist_pivot: twistPivot,
  }), [parallelShift, slopeShock, curvature1Shock, curvature2Shock, twistShock, twistPivot]);

  const baseZc = useMemo(() => buildZeroCurve(baseParams), [baseParams]);
  const shockedZc = useMemo(() => buildZeroCurve(applyShocks(baseParams, shocks)), [baseParams, shocks]);

  const { computedPositions, summary } = useMemo(
    () => computePortfolioResults(portfolio, baseZc, shockedZc, curve?.curve_date || new Date().toISOString().slice(0, 10), baseParams, shocks),
    [portfolio, baseZc, shockedZc, curve, baseParams, shocks],
  );

  return (
    <ResultsContext.Provider value={{ baseZc, shockedZc, computedPositions, summary }}>
      {children}
    </ResultsContext.Provider>
  );
}

export function useResults() {
  const context = useContext(ResultsContext);
  if (!context) throw new Error('useResults must be used within a ResultsProvider');
  return context;
}
