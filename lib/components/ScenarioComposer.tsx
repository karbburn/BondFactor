'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useScenario } from '../state/ScenarioContext';
import { useAuth } from '../state/AuthContext';
import { getSupabase } from '../supabase/client';

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
  } = useScenario();
  const { user } = useAuth();

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [scenarioName, setScenarioName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const apiFetch = useCallback(async (path: string, options: RequestInit = {}) => {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((options.headers as Record<string, string>) || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `API error ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }, []);

  const fetchScenarios = useCallback(async () => {
    try {
      const data = await apiFetch('/api/v1/scenarios/saved');
      setSavedScenarios(data);
    } catch { /* silent */ }
  }, [apiFetch]);

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
      setSaveMsg(e instanceof Error ? e.message : 'Error.');
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

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/v1/scenarios/saved/${id}`, { method: 'DELETE' });
      await fetchScenarios();
    } catch { /* silent */ }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">NSS Curve Scenario Composer</span>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button className="btn btn-secondary font-mono" style={{ fontSize: '10px', padding: '2px 8px' }} onClick={resetScenarios}>
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
          <input type="range" min="-3.00" max="3.00" step="0.05" value={parallelShift}
            onChange={(e) => setParallelShift(parseFloat(e.target.value))} className="custom-slider" />
        </div>

        {/* Slope Shock */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Slope Shock (Steepener/Flattener, &beta;₁)</span>
            <span className="font-mono text-brand">{slopeShock >= 0 ? '+' : ''}{slopeShock.toFixed(2)}%</span>
          </div>
          <input type="range" min="-3.00" max="3.00" step="0.05" value={slopeShock}
            onChange={(e) => setSlopeShock(parseFloat(e.target.value))} className="custom-slider" />
        </div>

        {/* Curvature 1 Shock */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Curvature 1 Shock (Medium-term belly, &beta;₂)</span>
            <span className="font-mono text-brand">{curvature1Shock >= 0 ? '+' : ''}{curvature1Shock.toFixed(2)}%</span>
          </div>
          <input type="range" min="-4.00" max="4.00" step="0.1" value={curvature1Shock}
            onChange={(e) => setCurvature1Shock(parseFloat(e.target.value))} className="custom-slider" />
        </div>

        {/* Curvature 2 Shock */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Curvature 2 Shock (Long-term belly, &beta;₃)</span>
            <span className="font-mono text-brand">{curvature2Shock >= 0 ? '+' : ''}{curvature2Shock.toFixed(2)}%</span>
          </div>
          <input type="range" min="-4.00" max="4.00" step="0.1" value={curvature2Shock}
            onChange={(e) => setCurvature2Shock(parseFloat(e.target.value))} className="custom-slider" />
        </div>

        {/* Twist Shock */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
            <span>Twist Shock (Slope pivot twist)</span>
            <span className="font-mono text-brand">{twistShock >= 0 ? '+' : ''}{twistShock.toFixed(2)}%</span>
          </div>
          <input type="range" min="-2.00" max="2.00" step="0.05" value={twistShock}
            onChange={(e) => setTwistShock(parseFloat(e.target.value))} className="custom-slider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Twist Pivot Maturity:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input type="number" min="0.5" max="30" step="0.5" value={twistPivot}
                onChange={(e) => setTwistPivot(Math.max(0.5, parseFloat(e.target.value) || 5.0))}
                className="form-input font-mono" style={{ width: '60px', padding: '2px 5px', fontSize: '11px' }} />
              <span style={{ fontSize: '11px' }}>Years</span>
            </div>
          </div>
        </div>

        {/* Save / Load */}
        {user && (
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
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
              />
              <button className="btn font-mono" style={{ fontSize: '10px', minWidth: '60px' }}
                disabled={saving || !scenarioName.trim()} onClick={handleSave}>
                {saving ? '...' : 'SAVE'}
              </button>
            </div>
            {saveMsg && <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '5px' }}>{saveMsg}</div>}

            {savedScenarios.length > 0 && (
              <div style={{ maxHeight: '100px', overflowY: 'auto' }}>
                {savedScenarios.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '3px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <button className="font-mono" style={{ fontSize: '10px', color: 'var(--text-primary)',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1 }}
                      onClick={() => handleLoad(s)}>
                      {s.scenario_name}
                    </button>
                    <button className="font-mono" style={{ fontSize: '10px', color: 'var(--color-error)',
                      background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => handleDelete(s.id)}>DEL</button>
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
