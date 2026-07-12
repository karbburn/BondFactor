'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useCurve } from '../../lib/state/CurveContext';
import { usePortfolio, PositionItem } from '../../lib/state/PortfolioContext';
import { useScenario } from '../../lib/state/ScenarioContext';
import { buildZeroCurve, applyShocks, computePortfolioResults, ScenarioShocks } from '../../lib/pricing-engine/computeResults';
import { FALLBACK_NSS_PARAMS } from '../../lib/pricing-engine/constants';
import { getSupabase } from '../../lib/supabase/client';
import PortfolioComparisonPanel from '../../lib/components/PortfolioComparisonPanel';
import { formatCurrency } from '../../lib/utils/format';
import ScenarioComposer from '../../lib/components/ScenarioComposer';

const PANEL_COLORS = ['#0A84FF', '#FF9F0A', '#30D158', '#FF375F', '#BF5AF2', '#64D2FF'];

interface LoadedPortfolio {
  id: string;
  name: string;
  positions: PositionItem[];
  error?: string;
}

export default function ComparePage() {
  const { compareIds } = usePortfolio();
  const { curve, securities, loading: curveLoading } = useCurve();
  const { parallelShift, slopeShock, curvature1Shock, curvature2Shock, twistShock, twistPivot } = useScenario();
  const [loaded, setLoaded] = useState<LoadedPortfolio[]>([]);
  const [fetching, setFetching] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const toFetch = useMemo(() => {
    return compareIds.filter(id => !loaded.some(l => l.id === id));
  }, [compareIds, loaded]);

  useEffect(() => {
    if (toFetch.length === 0 || securities.length === 0) return;
    let cancelled = false;
    setFetching(true);
    setGlobalError(null);
    const supabase = getSupabase();
    
    const fetchAll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        
        const results = await Promise.all(toFetch.map(async (id) => {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/v1/portfolios/${id}`, { headers });
            if (!res.ok) throw new Error(`Portfolio HTTP ${res.status}`);
            const data = await res.json();
            const positions: PositionItem[] = [];
            for (const pos of data.positions) {
              const sec = securities.find(s => s.id === pos.security_id || s.isin === pos.isin);
              if (sec) positions.push({ security: sec, faceValue: pos.face_value_held });
            }
            return { id: data.id, name: data.portfolio_name, positions };
          } catch (err: unknown) {
            return {
              id,
              name: `Portfolio (${id.slice(0, 8)})`,
              positions: [],
              error: err instanceof Error ? err.message : 'Connection failed'
            };
          }
        }));

        if (!cancelled) {
          setLoaded(prev => [...prev, ...results]);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setGlobalError(e instanceof Error ? e.message : 'Failed to query portfolios API');
        }
      } finally {
        if (!cancelled) {
          setFetching(false);
        }
      }
    };
    
    fetchAll();
    return () => { cancelled = true; };
  }, [toFetch, securities]);

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

  useEffect(() => {
    setLoaded(prev => prev.filter(l => compareIds.includes(l.id)));
  }, [compareIds]);

  if (curveLoading) {
    return (
      <div className="container loading-container fade-in">
        <div>&gt;&gt; LOADING COMPARISON DATA...</div>
      </div>
    );
  }

  return (
    <div className="container fade-in">
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
          <div className="font-mono text-secondary" style={{ fontSize: '12px' }}>
            No portfolios selected for comparison.<br />
            Go to the Portfolio Builder, check the boxes next to saved portfolios, then return here.
          </div>
        </div>
      ) : globalError ? (
        <div className="panel" style={{ borderColor: 'var(--color-error)' }}>
          <div className="font-mono text-error" style={{ fontSize: '12px' }}>{globalError}</div>
        </div>
      ) : (
        <>
          <ScenarioComposer />

          {/* Cross-Portfolio Risk Summary Row */}
          {loaded.length > 0 && (
            <div className="panel table-wrapper table-scroll-hint" style={{ marginBottom: '1.5rem' }}>
              <div className="panel-header">
                <span className="panel-title">Cross-Portfolio Risk Summary</span>
              </div>
              <table className="dense-table" style={{ fontSize: '11px' }}>
                <caption>Summary table comparing metrics across all compared portfolios</caption>
                <thead>
                  <tr>
                    <th>Portfolio Name</th>
                    <th className="num">Scenario P&amp;L</th>
                    <th className="num">Base Mod Duration</th>
                    <th className="num">Portfolio DV01</th>
                    <th className="num">Convexity</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded.map((p, i) => {
                    if (p.error) {
                      return (
                        <tr key={p.id}>
                          <td style={{ color: PANEL_COLORS[i % PANEL_COLORS.length], fontWeight: 600 }}>{p.name}</td>
                          <td colSpan={4} className="text-error font-mono" style={{ fontSize: '10px' }}>
                            Error loading portfolio data ({p.error})
                          </td>
                        </tr>
                      );
                    }
                    const { summary } = computePortfolioResults(
                      p.positions, baseZc, shockedZc, curve?.curve_date || new Date().toISOString().slice(0, 10),
                      baseParams,
                      shocks
                    );
                    return (
                      <tr key={p.id}>
                        <td style={{ color: PANEL_COLORS[i % PANEL_COLORS.length], fontWeight: 600 }}>{p.name}</td>
                        <td className={`num fw-600 ${summary.totalPnl >= 0 ? 'text-success' : 'text-error'}`}>
                          {summary.totalPnl >= 0 ? '+' : ''}{formatCurrency(summary.totalPnl)}
                        </td>
                        <td className="num">{summary.portfolioModDur.toFixed(3)} Y</td>
                        <td className="num">₹ {Math.round(summary.portfolioDv01).toLocaleString()}</td>
                        <td className="num">{summary.portfolioConvexity.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 350px), 1fr))',
            gap: '1.5rem',
            marginTop: '1.5rem',
          }}>
            {loaded.map((p, i) => {
              if (p.error) {
                return (
                  <div key={p.id} className="panel" style={{ padding: '15px', borderColor: 'var(--negative)' }}>
                    <div className="panel-header" style={{ borderBottomColor: 'var(--negative)' }}>
                      <span className="panel-title text-error">{p.name}</span>
                    </div>
                    <div className="font-mono text-error" style={{ fontSize: '11px', marginTop: '10px' }}>
                      FAULT: {p.error}
                    </div>
                    <div className="font-mono text-secondary" style={{ fontSize: '10px', marginTop: '10px' }}>
                      Verify portfolio exists and backend database is accessible.
                    </div>
                  </div>
                );
              }
              
              const { computedPositions, summary } = computePortfolioResults(
                p.positions, baseZc, shockedZc, curve?.curve_date || new Date().toISOString().slice(0, 10),
                baseParams,
                shocks
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
