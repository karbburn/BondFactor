'use client';

import React from 'react';
import { useScenario } from '../state/ScenarioContext';

export default function ScenarioComposer() {
  const {
    parallelShift, setParallelShift,
    slopeShock, setSlopeShock,
    curvature1Shock, setCurvature1Shock,
    curvature2Shock, setCurvature2Shock,
    twistShock, setTwistShock,
    twistPivot, setTwistPivot,
    resetScenarios
  } = useScenario();

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">NSS Curve Scenario Composer</span>
        <button className="btn btn-secondary font-mono" style={{ fontSize: '10px', padding: '2px 8px' }} onClick={resetScenarios}>
          Reset Shocks
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {/* Parallel Shift */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Level Shock (Parallel shift, &beta;₀)</span>
            <span className="font-mono text-brand">{parallelShift >= 0 ? '+' : ''}{parallelShift.toFixed(2)}% ({Math.round(parallelShift * 100)} bps)</span>
          </div>
          <input
            type="range"
            min="-3.00"
            max="3.00"
            step="0.05"
            value={parallelShift}
            onChange={(e) => setParallelShift(parseFloat(e.target.value))}
            className="custom-slider"
          />
        </div>

        {/* Slope Shock */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Slope Shock (Steepener/Flattener, &beta;₁)</span>
            <span className="font-mono text-brand">{slopeShock >= 0 ? '+' : ''}{slopeShock.toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min="-3.00"
            max="3.00"
            step="0.05"
            value={slopeShock}
            onChange={(e) => setSlopeShock(parseFloat(e.target.value))}
            className="custom-slider"
          />
        </div>

        {/* Curvature 1 Shock */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Curvature 1 Shock (Medium-term belly, &beta;₂)</span>
            <span className="font-mono text-brand">{curvature1Shock >= 0 ? '+' : ''}{curvature1Shock.toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min="-4.00"
            max="4.00"
            step="0.1"
            value={curvature1Shock}
            onChange={(e) => setCurvature1Shock(parseFloat(e.target.value))}
            className="custom-slider"
          />
        </div>

        {/* Curvature 2 Shock */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Curvature 2 Shock (Long-term belly, &beta;₃)</span>
            <span className="font-mono text-brand">{curvature2Shock >= 0 ? '+' : ''}{curvature2Shock.toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min="-4.00"
            max="4.00"
            step="0.1"
            value={curvature2Shock}
            onChange={(e) => setCurvature2Shock(parseFloat(e.target.value))}
            className="custom-slider"
          />
        </div>

        {/* Twist Shock */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Twist Shock (Slope pivot twist)</span>
            <span className="font-mono text-brand">{twistShock >= 0 ? '+' : ''}{twistShock.toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min="-2.00"
            max="2.00"
            step="0.05"
            value={twistShock}
            onChange={(e) => setTwistShock(parseFloat(e.target.value))}
            className="custom-slider"
          />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Twist Pivot Maturity:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input
                type="number"
                min="0.5"
                max="30"
                step="0.5"
                value={twistPivot}
                onChange={(e) => setTwistPivot(Math.max(0.5, parseFloat(e.target.value) || 5.0))}
                className="form-input font-mono"
                style={{ width: '60px', padding: '2px 5px', fontSize: '11px' }}
              />
              <span style={{ fontSize: '11px' }}>Years</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
