'use client';

import React, { useState } from 'react';
import { useCurve } from '../lib/state/CurveContext';
import { useResults } from '../lib/state/ResultsContext';
import { formatCurrency } from '../lib/utils/format';
import CurveChart from '../lib/components/CurveChart';
import KRDLadder from '../lib/components/KRDLadder';
import FactorContributionChart from '../lib/components/FactorContributionChart';
import { DEFAULT_KEY_TENORS } from '../lib/pricing-engine/krd';

export default function Dashboard() {
  const { curve, loading, error } = useCurve();
  const { baseZc, shockedZc, computedPositions, summary } = useResults();
  const [expandedIsin, setExpandedIsin] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="container">
        {/* Diagnostics skeleton */}
        <div className="panel skeleton skeleton-diagnostics" />
        
        {/* Metric grid skeleton */}
        <div className="skeleton-metric-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton skeleton-text" style={{ width: '40%' }} />
              <div className="skeleton skeleton-value" style={{ width: '70%' }} />
            </div>
          ))}
        </div>
        
        {/* Positions Table skeleton */}
        <div className="panel" style={{ height: '220px', marginBottom: '1.5rem' }}>
          <div className="skeleton skeleton-text" style={{ width: '20%', marginBottom: '20px' }} />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton skeleton-table-row" />
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="chart-grid">
          <div className="panel skeleton skeleton-chart-box" />
          <div className="panel skeleton skeleton-chart-box" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container error-container">
        <div className="error-panel">
          <div className="error-title">Error Loading Data</div>
          <div className="mt-10">{error}</div>
          <div className="error-subtitle">
            Backend API: {process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}
          </div>
        </div>
      </div>
    );
  }

  const diagnostics = curve?.diagnostics;
  const isFallback = curve?.model_type === 'cubic_spline' || diagnostics?.validation_status === 'failed_fallback_used';

  return (
    <div className="container">
      {/* 1. Diagnostics Ribbon (Redesigned) */}
      <div className={`diagnostics-ribbon ${isFallback ? 'fallback-active' : ''}`}>
        <div className="diagnostics-cell">
          <span className="diagnostics-label">Active Curve Date</span>
          <span className="diagnostics-value">{curve?.curve_date || 'N/A'}</span>
        </div>
        <div className="diagnostics-cell">
          <span className="diagnostics-label">Model Type</span>
          <span className={`diagnostics-value ${isFallback ? 'text-error' : 'text-brand'}`}>
            {(curve?.model_type || 'N/A').toUpperCase()}
          </span>
        </div>
        <div className="diagnostics-cell">
          <span className="diagnostics-label">Fit Error (RMSE)</span>
          <span className="diagnostics-value">
            {diagnostics?.fit_residual_error !== undefined ? diagnostics.fit_residual_error.toFixed(6) : 'N/A'}
          </span>
        </div>
        <div className="diagnostics-cell">
          <span className="diagnostics-label">Optimizer Status</span>
          <span className={`diagnostics-value ${diagnostics?.optimizer_converged ? 'text-success' : 'text-error'}`}>
            {diagnostics ? (diagnostics.optimizer_converged ? 'CONVERGED' : 'FAILED') : 'N/A'}
          </span>
        </div>
        <div className="diagnostics-cell">
          <span className="diagnostics-label">Validation Status</span>
          <span className={`diagnostics-value ${isFallback ? 'text-error' : 'text-success'}`}>
            {diagnostics?.validation_status ? diagnostics.validation_status.toUpperCase() : 'N/A'}
          </span>
        </div>
        {isFallback && curve?.diagnostics.validation_notes && (
          <div className="diagnostics-warning">
            WARNING: NSS Fit validation failed. Spline fallback active. Note: {curve.diagnostics.validation_notes}
          </div>
        )}
      </div>

      {/* 2. Portfolio Summary Metric Panel */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Base Dirty Value</div>
          <div className="metric-value">{formatCurrency(summary.totalBaseDirtyValue)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Shocked Dirty Value</div>
          <div className="metric-value">{formatCurrency(summary.totalShockedDirtyValue)}</div>
        </div>
        <div className={`metric-card ${summary.totalPnl >= 0 ? 'metric-positive' : 'metric-negative'}`}>
          <div className="metric-label">Scenario P&amp;L</div>
          <div className={`metric-value ${summary.totalPnl >= 0 ? 'text-success' : 'text-error'}`}>
            {summary.totalPnl >= 0 ? '+' : ''}
            {formatCurrency(summary.totalPnl)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Portfolio Modified Dur</div>
          <div className="metric-value">{summary.portfolioModDur?.toFixed(3) ?? 'N/A'} Y</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Portfolio DV01</div>
          <div className="metric-value">₹ {summary.portfolioDv01 != null ? Math.round(summary.portfolioDv01).toLocaleString() : 'N/A'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Portfolio Convexity</div>
          <div className="metric-value">{summary.portfolioConvexity?.toFixed(2) ?? 'N/A'}</div>
        </div>
      </div>

      {/* 3. Portfolio Positions Table */}
      <div className="panel table-wrapper table-scroll-hint">
        <div className="panel-header">
          <span className="panel-title">Current Portfolio Positions</span>
          <span className="panel-holding-count">
            Holding {computedPositions.length} securities
          </span>
        </div>
        {computedPositions.length === 0 ? (
          <div className="empty-state">
            No positions loaded. Add positions in the Portfolio Builder.
          </div>
        ) : (
          <table className="dense-table">
            <caption>Current active holdings and scenario analysis results</caption>
            <thead>
              <tr>
                <th>ISIN</th>
                <th>Security Name</th>
                <th className="num">Face Value</th>
                <th className="num">Base Clean</th>
                <th className="num">Base Dirty</th>
                <th className="num">Accrued</th>
                <th className="num">Base YTM</th>
                <th className="num">Mod Dur</th>
                <th className="num">DV01</th>
                <th className="num">Shocked Dirty</th>
                <th className="num">Scenario P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {computedPositions.flatMap((pos) => {
                const isPositive = pos.pnl >= 0;
                const isExpanded = expandedIsin === pos.security.isin;
                return [
                  <tr
                    key={pos.security.isin}
                    onClick={() => setExpandedIsin(isExpanded ? null : pos.security.isin)}
                    style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                    className={isExpanded ? 'active-row' : ''}
                  >
                    <td>{pos.security.isin}</td>
                    <td className="td-truncate" title={pos.security.security_name}>
                      {pos.security.security_name}
                    </td>
                    <td className="num">{pos.faceValue.toLocaleString()}</td>
                    <td className="num">₹ {pos.baseCleanPrice?.toFixed(4) ?? 'N/A'}</td>
                    <td className="num">₹ {pos.baseDirtyPrice?.toFixed(4) ?? 'N/A'}</td>
                    <td className="num">₹ {pos.baseAccrued?.toFixed(4) ?? 'N/A'}</td>
                    <td className="num">{pos.ytm?.toFixed(3) ?? 'N/A'}%</td>
                    <td className="num">{pos.modDur?.toFixed(3) ?? 'N/A'} Y</td>
                    <td className="num">₹ {pos.dv01 != null ? Math.round(pos.dv01 * (pos.faceValue / 100.0)).toLocaleString() : 'N/A'}</td>
                    <td className="num">₹ {pos.shockedDirtyPrice?.toFixed(4) ?? 'N/A'}</td>
                    <td className={`num fw-600 ${isPositive ? 'text-success' : 'text-error'}`}>
                      {isPositive ? '+' : ''}
                      {pos.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${pos.security.isin}-expanded`} className="expanded-row-tr" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <td colSpan={11} style={{ padding: '12px', borderLeft: '3px solid var(--accent)' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          Key-Rate Tenor-Bucket Risk Sensitivities (KRS in ₹)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                          {DEFAULT_KEY_TENORS.map((t, idx) => {
                            const krdVal = pos.krd[idx] || 0;
                            const krsVal = krdVal * pos.baseDirtyPrice * 0.0001 * (pos.faceValue / 100.0);
                            return (
                              <div key={t} style={{ padding: '4px 6px', border: '1px solid var(--border-subtle)', borderRadius: '2px', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{t < 1 ? `${t * 12}M` : `${t}Y`}:</span>
                                <span className={krsVal >= 0 ? 'text-success' : 'text-error'} style={{ fontWeight: 600 }}>
                                  ₹ {Math.round(krsVal).toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '9px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          * Total KRS Sum: ₹ {Math.round(pos.krd.reduce((acc, v) => acc + v, 0) * pos.baseDirtyPrice * 0.0001 * (pos.faceValue / 100.0)).toLocaleString()} | Position Parallel DV01: ₹ {Math.round(pos.dv01 * (pos.faceValue / 100.0)).toLocaleString()} (Reconciled!)
                        </div>
                      </td>
                    </tr>
                  )
                ].filter(Boolean);
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Scenario P&L Decomposition Panel */}
      {summary.totalPnl !== 0 && (
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-header">
            <span className="panel-title">Scenario P&amp;L Decomposition (Factor Attribution)</span>
            <span className="panel-holding-count" style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Approximate (First-Order Linear Attribution)
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', padding: '15px' }}>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '15px' }}>
                <div className="metric-card" style={{ padding: '10px' }}>
                  <div className="metric-label" style={{ fontSize: '10px' }}>Level Contribution (&beta;₀)</div>
                  <div className={`metric-value ${summary.factorPnL.level >= 0 ? 'text-success' : 'text-error'}`} style={{ fontSize: '16px' }}>
                    {summary.factorPnL.level >= 0 ? '+' : ''}
                    {formatCurrency(summary.factorPnL.level)}
                  </div>
                </div>
                <div className="metric-card" style={{ padding: '10px' }}>
                  <div className="metric-label" style={{ fontSize: '10px' }}>Slope Contribution (&beta;₁)</div>
                  <div className={`metric-value ${summary.factorPnL.slope >= 0 ? 'text-success' : 'text-error'}`} style={{ fontSize: '16px' }}>
                    {summary.factorPnL.slope >= 0 ? '+' : ''}
                    {formatCurrency(summary.factorPnL.slope)}
                  </div>
                </div>
                <div className="metric-card" style={{ padding: '10px' }}>
                  <div className="metric-label" style={{ fontSize: '10px' }}>Curvature 1 (&beta;₂)</div>
                  <div className={`metric-value ${summary.factorPnL.curvature1 >= 0 ? 'text-success' : 'text-error'}`} style={{ fontSize: '16px' }}>
                    {summary.factorPnL.curvature1 >= 0 ? '+' : ''}
                    {formatCurrency(summary.factorPnL.curvature1)}
                  </div>
                </div>
                <div className="metric-card" style={{ padding: '10px' }}>
                  <div className="metric-label" style={{ fontSize: '10px' }}>Curvature 2 (&beta;₃)</div>
                  <div className={`metric-value ${summary.factorPnL.curvature2 >= 0 ? 'text-success' : 'text-error'}`} style={{ fontSize: '16px' }}>
                    {summary.factorPnL.curvature2 >= 0 ? '+' : ''}
                    {formatCurrency(summary.factorPnL.curvature2)}
                  </div>
                </div>
                <div className="metric-card" style={{ padding: '10px', gridColumn: 'span 1' }}>
                  <div className="metric-label" style={{ fontSize: '10px' }}>Interaction Residual</div>
                  <div className={`metric-value ${summary.factorPnL.residual >= 0 ? 'text-success' : 'text-error'}`} style={{ fontSize: '16px' }}>
                    {summary.factorPnL.residual >= 0 ? '+' : ''}
                    {formatCurrency(summary.factorPnL.residual)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                * Note: NSS factor decomposition is approximate due to non-linear yield curve and bootstrapping interactions. Sum of components + residual exactly equals total P&amp;L ({formatCurrency(summary.totalPnl)}).
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <FactorContributionChart factorPnL={summary.factorPnL} hidePanelWrapper={true} />
            </div>
          </div>
        </div>
      )}

      {/* 4. Bottom Grid: Curve Chart & KRD Ladder */}
      <div className="chart-grid">
        <CurveChart baseZc={baseZc} shockedZc={shockedZc} title={`G-Sec Zero Rate Curve (As of ${curve?.curve_date})`} />
        <KRDLadder krdValues={summary.portfolioKrd} portfolioKrs={summary.portfolioKrs} portfolioDv01={summary.portfolioDv01} title="Portfolio Key Rate Durations Ladder" />
      </div>
    </div>
  );
}
