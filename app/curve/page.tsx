'use client';

import React, { useMemo } from 'react';
import { useCurve } from '../../lib/state/CurveContext';
import { useScenario } from '../../lib/state/ScenarioContext';
import { useResults } from '../../lib/state/ResultsContext';
import ScenarioComposer from '../../lib/components/ScenarioComposer';
import CurveChart from '../../lib/components/CurveChart';

import { applyScenarioShocks } from '../../lib/pricing-engine/scenario';
import { DEFAULT_KEY_TENORS } from '../../lib/pricing-engine/krd';

export default function CurveExplorer() {
  const { curve, loading, error } = useCurve();
  const { baseZc, shockedZc } = useResults();
  const { parallelShift, slopeShock, curvature1Shock, curvature2Shock, twistShock, twistPivot } = useScenario();

  const baseParams = useMemo(() => {
    if (curve && curve.parameters) return curve.parameters;
    return { beta0: 7.2, beta1: -1.5, beta2: 2.0, beta3: -0.8, tau1: 1.5, tau2: 6.0 };
  }, [curve]);

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

  if (loading) {
    return (
      <div className="container font-mono" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--accent)' }}>
        <div>Loading Curve Explorer...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container font-mono" style={{ padding: '2rem', color: 'var(--negative)' }}>
        <div className="error-panel">
          <div className="error-title">Error Loading Curve</div>
          <div style={{ marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
        
        {/* Left Column: Sliders & Parameter readout */}
        <div>
          <ScenarioComposer />
          
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">NSS Parameter Calibration State</span>
            </div>
            
            <table className="dense-table">
              <thead>
                <tr>
                  <th>NSS Parameter</th>
                  <th className="num">Baseline</th>
                  <th className="num">Shocked</th>
                  <th className="num">Delta</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Beta 0 (Level, &beta;₀)</td>
                  <td className="num">{baseParams.beta0.toFixed(4)}%</td>
                  <td className="num">{shockedParams.beta0.toFixed(4)}%</td>
                  <td className={`num ${(shockedParams.beta0 - baseParams.beta0) >= 0 ? 'text-success' : 'text-error'}`}>
                    {(shockedParams.beta0 - baseParams.beta0) >= 0 ? '+' : ''}
                    {(shockedParams.beta0 - baseParams.beta0).toFixed(4)}%
                  </td>
                </tr>
                <tr>
                  <td>Beta 1 (Slope, &beta;₁)</td>
                  <td className="num">{baseParams.beta1.toFixed(4)}%</td>
                  <td className="num">{shockedParams.beta1.toFixed(4)}%</td>
                  <td className={`num ${(shockedParams.beta1 - baseParams.beta1) >= 0 ? 'text-success' : 'text-error'}`}>
                    {(shockedParams.beta1 - baseParams.beta1) >= 0 ? '+' : ''}
                    {(shockedParams.beta1 - baseParams.beta1).toFixed(4)}%
                  </td>
                </tr>
                <tr>
                  <td>Beta 2 (Curvature 1, &beta;₂)</td>
                  <td className="num">{baseParams.beta2.toFixed(4)}%</td>
                  <td className="num">{shockedParams.beta2.toFixed(4)}%</td>
                  <td className={`num ${(shockedParams.beta2 - baseParams.beta2) >= 0 ? 'text-success' : 'text-error'}`}>
                    {(shockedParams.beta2 - baseParams.beta2) >= 0 ? '+' : ''}
                    {(shockedParams.beta2 - baseParams.beta2).toFixed(4)}%
                  </td>
                </tr>
                <tr>
                  <td>Beta 3 (Curvature 2, &beta;₃)</td>
                  <td className="num">{baseParams.beta3.toFixed(4)}%</td>
                  <td className="num">{shockedParams.beta3.toFixed(4)}%</td>
                  <td className={`num ${(shockedParams.beta3 - baseParams.beta3) >= 0 ? 'text-success' : 'text-error'}`}>
                    {(shockedParams.beta3 - baseParams.beta3) >= 0 ? '+' : ''}
                    {(shockedParams.beta3 - baseParams.beta3).toFixed(4)}%
                  </td>
                </tr>
                <tr>
                  <td>Tau 1 (Medium decay, &tau;₁)</td>
                  <td className="num">{baseParams.tau1.toFixed(4)}</td>
                  <td className="num">{shockedParams.tau1.toFixed(4)}</td>
                  <td className="num text-secondary">0.0000</td>
                </tr>
                <tr>
                  <td>Tau 2 (Long decay, &tau;₂)</td>
                  <td className="num">{baseParams.tau2.toFixed(4)}</td>
                  <td className="num">{shockedParams.tau2.toFixed(4)}</td>
                  <td className="num text-secondary">0.0000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Chart & Tenor Rate Grid */}
        <div>
          <CurveChart baseZc={baseZc} shockedZc={shockedZc} title="NSS Zero Curve Overlay" />
          
          <div className="panel" style={{ marginTop: '1.5rem' }}>
            <div className="panel-header">
              <span className="panel-title">Key Tenor Zero Rate Comparison</span>
            </div>
            
            <table className="dense-table">
              <thead>
                <tr>
                  <th>Tenor</th>
                  <th className="num">Base Zero Rate</th>
                  <th className="num">Shocked Zero Rate</th>
                  <th className="num">Yield Change (bps)</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_KEY_TENORS.map(t => {
                  const baseRate = baseZc.getZeroRate(t);
                  const shockedRate = shockedZc.getZeroRate(t);
                  const deltaBps = (shockedRate - baseRate) * 100.0;
                  
                  return (
                    <tr key={t}>
                      <td style={{ fontWeight: 600 }}>{t < 1 ? `${t * 12}M` : `${t}Y`}</td>
                      <td className="num">{baseRate.toFixed(4)}%</td>
                      <td className="num">{shockedRate.toFixed(4)}%</td>
                      <td className={`num ${deltaBps >= 0 ? 'text-success' : 'text-error'}`} style={{ fontWeight: 600 }}>
                        {deltaBps >= 0 ? '+' : ''}
                        {deltaBps.toFixed(2)} bps
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
