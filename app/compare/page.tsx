'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useCurve } from '../../lib/state/CurveContext';
import { usePortfolio, PositionItem } from '../../lib/state/PortfolioContext';
import { useScenario } from '../../lib/state/ScenarioContext';
import { buildZeroCurve, applyShocks, computePortfolioResults, ScenarioShocks } from '../../lib/pricing-engine/computeResults';
import { getSupabase } from '../../lib/supabase/client';
import PortfolioComparisonPanel from '../../lib/components/PortfolioComparisonPanel';
import ScenarioComposer from '../../lib/components/ScenarioComposer';

const PANEL_COLORS = ['#0A84FF', '#FF9F0A', '#30D158', '#FF375F', '#BF5AF2', '#64D2FF'];

interface LoadedPortfolio {
  id: string;
  name: string;
  positions: PositionItem[];
}

export default function ComparePage() {
  const { compareIds } = usePortfolio();
  const { curve, securities, loading: curveLoading } = useCurve();
  const { parallelShift, slopeShock, curvature1Shock, curvature2Shock, twistShock, twistPivot } = useScenario();
  const [loaded, setLoaded] = useState<LoadedPortfolio[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toFetch = useMemo(() => {
    return compareIds.filter(id => !loaded.some(l => l.id === id));
  }, [compareIds, loaded]);

  useEffect(() => {
    if (toFetch.length === 0 || securities.length === 0) return;
    let cancelled = false;
    setFetching(true);
    setError(null);
    const supabase = getSupabase();
    const fetchAll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const results = await Promise.all(toFetch.map(async (id) => {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch(`/api/v1/portfolios/${id}`, { headers });
          if (!res.ok) throw new Error(`Failed to load portfolio ${id}`);
          const data = await res.json();
          const positions: PositionItem[] = [];
          for (const pos of data.positions) {
            const sec = securities.find(s => s.id === pos.security_id || s.isin === pos.isin);
            if (sec) positions.push({ security: sec, faceValue: pos.face_value_held });
          }
          return { id: data.id, name: data.portfolio_name, positions };
        }));
        if (!cancelled) setLoaded(prev => [...prev, ...results]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load portfolios');
      } finally {
        if (!cancelled) setFetching(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [toFetch, securities]);

  const baseParams = useMemo(() => {
    if (curve?.parameters) return curve.parameters;
    return { beta0: 7.2, beta1: -1.5, beta2: 2.0, beta3: -0.8, tau1: 1.5, tau2: 6.0 };
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

  useEffect(() => {
    setLoaded(prev => prev.filter(l => compareIds.includes(l.id)));
  }, [compareIds]);

  if (curveLoading) {
    return (
      <div className="container font-mono" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--brand-color)' }}>
        <div>&gt;&gt; LOADING...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="panel" style={{ padding: '12px 15px', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span className="font-mono text-brand" style={{ fontWeight: 600, fontSize: '13px' }}>
            PORTFOLIO COMPARISON WORKSTATION
          </span>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {loaded.length} portfolio{loaded.length !== 1 ? 's' : ''} loaded
            {fetching && ' | Fetching...'}
          </span>
        </div>
      </div>

      {compareIds.length === 0 ? (
        <div className="panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="font-mono" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            No portfolios selected for comparison.<br />
            Go to the Portfolio Builder, check the boxes next to saved portfolios, then return here.
          </div>
        </div>
      ) : error ? (
        <div className="panel" style={{ borderColor: 'var(--color-error)' }}>
          <div className="font-mono text-error" style={{ fontSize: '12px' }}>{error}</div>
        </div>
      ) : (
        <>
          <ScenarioComposer />
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(loaded.length, 3)}, 1fr)`,
            gap: '1rem',
            marginTop: '1.5rem',
          }}>
            {loaded.map((p, i) => {
              const { computedPositions, summary } = computePortfolioResults(
                p.positions, baseZc, shockedZc, curve?.curve_date || new Date().toISOString().slice(0, 10),
              );
              return (
                <PortfolioComparisonPanel
                  key={p.id}
                  name={p.name}
                  computedPositions={computedPositions}
                  summary={summary}
                  color={PANEL_COLORS[i % PANEL_COLORS.length]}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
