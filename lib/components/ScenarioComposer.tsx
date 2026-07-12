'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useScenario } from '../state/ScenarioContext';
import { useAuth } from '../state/AuthContext';
import { apiFetch } from '../supabase/api';

interface SavedScenario {
  id: string;
  scenario_name: string;
  parallel_shift: number;
  slope_shock: number;
  curvature1_shock: number;
  curvature2_shock: number;
  twist_shock: number;
  twist_pivot: number;
  created_at: string;
}

export default function ScenarioComposer() {
  const {
    parallelShift, setParallelShift,
    slopeShock, setSlopeShock,
    curvature1Shock, setCurvature1Shock,
    curvature2Shock, setCurvature2Shock,
    twistShock, setTwistShock,
    twistPivot, setTwistPivot,
    resetScenarios, loadScenario,
    isCalibratedFromHistory, setIsCalibratedFromHistory,
    calibrationInfo, setCalibrationInfo,
  } = useScenario();
  const { user } = useAuth();

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [scenarioName, setScenarioName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  
  const [calibrating, setCalibrating] = useState(false);
  const [calibError, setCalibError] = useState('');

  const handleCalibrateFromHistory = async () => {
    setCalibrating(true);
    setCalibError('');
    try {
      const data = await apiFetch('/api/v1/curves/historical-calibration');
      setParallelShift(data.parallel_shift);
      setSlopeShock(data.slope_shock);
      setCurvature1Shock(data.curvature1_shock);
      setCurvature2Shock(data.curvature2_shock);
      setTwistShock(0.0);
      setIsCalibratedFromHistory(true);
      setCalibrationInfo({
        data_points: data.data_points,
        confidence_level: data.confidence_level,
        earliest_date: data.earliest_date,
        latest_date: data.latest_date,
      });
    } catch (e: unknown) {
      setCalibError(e instanceof Error ? e.message : 'Calibration failed');
    } finally {
      setCalibrating(false);
    }
  };
  const [saveMsg, setSaveMsg] = useState('');

  const fetchScenarios = useCallback(async () => {
    setLoadingScenarios(true);
    try {
      const data = await apiFetch('/api/v1/scenarios/saved');
      setSavedScenarios(data);
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : 'Failed to load saved scenarios.');
    } finally {
      setLoadingScenarios(false);
    }
  }, []);

  useEffect(() => { if (user) fetchScenarios(); }, [user, fetchScenarios]);

  const handleSave = async () => {
    if (!scenarioName.trim()) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await apiFetch('/api/v1/scenarios/saved', {
        method: 'POST',
        body: JSON.stringify({
          scenario_name: scenarioName.trim(),
          parallel_shift: parallelShift,
          slope_shock: slopeShock,
          curvature1_shock: curvature1Shock,
          curvature2_shock: curvature2Shock,
          twist_shock: twistShock,
          twist_pivot: twistPivot,
        }),
      });
      setSaveMsg('Saved.');
      setScenarioName('');
      await fetchScenarios();
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : 'Error saving scenario.');
    }
    setSaving(false);
  };

  const handleLoad = (s: SavedScenario) => {
    loadScenario({
      parallelShift: s.parallel_shift,
      slopeShock: s.slope_shock,
      curvature1Shock: s.curvature1_shock,
      curvature2Shock: s.curvature2_shock,
      twistShock: s.twist_shock,
      twistPivot: s.twist_pivot,
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete scenario "${name}"?`)) return;
    try {
      await apiFetch(`/api/v1/scenarios/saved/${id}`, { method: 'DELETE' });
      setSaveMsg('Scenario deleted.');
      await fetchScenarios();
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : 'Error deleting scenario.');
    }
  };

  const handleResetClick = () => {
    if (confirm('Are you sure you want to reset all scenario shift parameters to zero?')) {
      resetScenarios();
    }
  };

  // Helper for slider fill visualization
  const getSliderStyle = (val: number, min: number, max: number) => {
    const pct = max === min ? 50 : ((val - min) / (max - min)) * 100;
    if (val >= 0) {
      return {
        background: `linear-gradient(to right, var(--bg-tertiary) 0%, var(--bg-tertiary) 50%, var(--accent) 50%, var(--accent) ${pct}%, var(--bg-tertiary) ${pct}%, var(--bg-tertiary) 100%)`
      };
    } else {
      return {
        background: `linear-gradient(to right, var(--bg-tertiary) 0%, var(--bg-tertiary) ${pct}%, var(--accent) ${pct}%, var(--accent) 50%, var(--bg-tertiary) 50%, var(--bg-tertiary) 100%)`
      };
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">NSS Curve Scenario Composer</span>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button className="btn btn-secondary font-mono" style={{ fontSize: '10px', padding: '2px 8px' }} onClick={handleCalibrateFromHistory} disabled={calibrating}>
            {calibrating ? 'Calibrating...' : 'Calibrate from History'}
          </button>
          <button className="btn btn-secondary font-mono" style={{ fontSize: '10px', padding: '2px 8px' }} onClick={handleResetClick}>
            Reset
          </button>
        </div>
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
            onChange={(e) => {
              setParallelShift(parseFloat(e.target.value));
              setIsCalibratedFromHistory(false);
            }}
            className="custom-slider"
            aria-label="Level Shock (Parallel Shift)"
            title="Level Shock (Parallel shift, beta 0) - affects the overall height of the curve across all tenors."
            style={getSliderStyle(parallelShift, -3.00, 3.00)}
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
            onChange={(e) => {
              setSlopeShock(parseFloat(e.target.value));
              setIsCalibratedFromHistory(false);
            }}
            className="custom-slider"
            aria-label="Slope Shock (Steepener/Flattener)"
            title="Slope Shock (beta 1) - steepens or flattens the yield curve by shifting short rates relative to long rates."
            style={getSliderStyle(slopeShock, -3.00, 3.00)}
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
            onChange={(e) => {
              setCurvature1Shock(parseFloat(e.target.value));
              setIsCalibratedFromHistory(false);
            }}
            className="custom-slider"
            aria-label="Curvature 1 Shock (Medium-term belly)"
            title="Curvature 1 Shock (beta 2) - affects medium-term rates, creating or modifying a belly shape in the 2Y-7Y sector."
            style={getSliderStyle(curvature1Shock, -4.00, 4.00)}
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
            onChange={(e) => {
              setCurvature2Shock(parseFloat(e.target.value));
              setIsCalibratedFromHistory(false);
            }}
            className="custom-slider"
            aria-label="Curvature 2 Shock (Long-term belly)"
            title="Curvature 2 Shock (beta 3) - affects long-term rates, creating a secondary curvature/belly in the 10Y-30Y sector."
            style={getSliderStyle(curvature2Shock, -4.00, 4.00)}
          />
        </div>

        {/* Twist Shock */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '15px' }}>
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
            onChange={(e) => {
              setTwistShock(parseFloat(e.target.value));
              setIsCalibratedFromHistory(false);
            }}
            className="custom-slider"
            aria-label="Twist Shock (Slope pivot twist)"
            title="Twist Shock - twists the curve around a specified pivot tenor (steepens or flattens around the pivot)."
            style={getSliderStyle(twistShock, -2.00, 2.00)}
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
                onChange={(e) => {
                  setTwistPivot(Math.max(0.5, parseFloat(e.target.value) || 5.0));
                  setIsCalibratedFromHistory(false);
                }}
                className="form-input font-mono"
                style={{ width: '60px', padding: '2px 5px', fontSize: '11px' }}
                aria-label="Twist Pivot Maturity"
              />
              <span style={{ fontSize: '11px' }}>Years</span>
            </div>
          </div>
        </div>

        {/* Historical Calibration Readout & Warning Banner */}
        {isCalibratedFromHistory && calibrationInfo && (
          <div style={{
            padding: '10px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            marginTop: '10px'
          }}>
            <div style={{ fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Historical Shock Calibration Active
            </div>
            <div>Percentile: 95th | Data Points: {calibrationInfo.data_points}</div>
            <div>Range: {calibrationInfo.earliest_date} to {calibrationInfo.latest_date}</div>
            <div style={{ marginTop: '6px', color: calibrationInfo.confidence_level === 'high' ? 'var(--color-success)' : 'var(--color-warning)' }}>
              Confidence: {calibrationInfo.confidence_level.toUpperCase().replace('_', ' ')}
            </div>
            {(calibrationInfo.confidence_level === 'very_low' || calibrationInfo.confidence_level === 'low') && (
              <div style={{ marginTop: '6px', color: 'var(--color-error)', fontSize: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: '4px' }}>
                WARNING: Historical database has very short coverage ({calibrationInfo.data_points} days). Statistical confidence in percentile estimation is extremely low.
              </div>
            )}
          </div>
        )}
        {calibError && (
          <div className="text-error font-mono" style={{ fontSize: '11px', marginTop: '5px' }}>
            Error: {calibError}
          </div>
        )}


        {/* Save / Load */}
        {user && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '15px' }}>
            <div className="font-mono text-brand" style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>
              SAVE / LOAD SCENARIO:
            </div>

            <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
              <input
                className="form-input font-mono" style={{ flex: 1, fontSize: '11px' }}
                placeholder="Scenario name..."
                value={scenarioName}
                onChange={e => setScenarioName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                aria-label="New Scenario Name"
              />
              <button className="btn font-mono" style={{ fontSize: '10px', minWidth: '60px' }}
                disabled={saving || !scenarioName.trim()} onClick={handleSave}>
                {saving ? '...' : 'SAVE'}
              </button>
            </div>
            {saveMsg && <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '5px' }}>{saveMsg}</div>}

            {loadingScenarios ? (
              <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '5px 0' }}>
                Loading saved scenarios...
              </div>
            ) : savedScenarios.length === 0 ? (
              <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '5px 0' }}>
                No saved scenarios.
              </div>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {savedScenarios.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '3px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <button className="font-mono" style={{ fontSize: '10px', color: 'var(--text-primary)',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1 }}
                      onClick={() => handleLoad(s)}>
                      {s.scenario_name}
                    </button>
                    <button className="font-mono" style={{ fontSize: '10px', color: 'var(--negative)',
                      background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => handleDelete(s.id, s.scenario_name)}>DEL</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
