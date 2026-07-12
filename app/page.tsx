'use client';

import React from 'react';
import { useCurve } from '../lib/state/CurveContext';
import { useResults } from '../lib/state/ResultsContext';
import CurveChart from '../lib/components/CurveChart';
import KRDLadder from '../lib/components/KRDLadder';

export default function Dashboard() {
  const { curve, loading, error } = useCurve();
  const { baseZc, shockedZc, computedPositions, summary } = useResults();

  if (loading) {
    return (
      <div className="container font-mono" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--brand-color)' }}>
        <div>&gt;&gt; LOADING WORKSTATION DATA...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container font-mono" style={{ padding: '2rem', color: 'var(--color-error)' }}>
        <div className="panel" style={{ borderColor: 'var(--color-error)' }}>
          <div className="panel-title" style={{ color: 'var(--color-error)' }}>SYSTEM FAULT</div>
          <div style={{ marginTop: '10px' }}>{error}</div>
          <div style={{ marginTop: '20px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            Backend API: {process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    // Format as ₹ Cr (Crores) or Lakhs
    if (val >= 10000000) {
      return `₹ ${(val / 10000000).toFixed(4)} Cr`;
    }
    return `₹ ${(val / 100000).toFixed(2)} L`;
  };

  const diagnostics = curve?.diagnostics;
  const isFallback = curve?.model_type === 'cubic_spline' || diagnostics?.validation_status === 'failed_fallback_used';

  return (
    <div className="container">
      {/* 1. Diagnostics Ribbon */}
      <div className="panel" style={{ padding: '8px 12px', borderLeft: isFallback ? '3px solid var(--color-error)' : '3px solid var(--color-success)', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', fontSize: '12px' }}>
          <div>
            <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>ACTIVE CURVE DATE:</span>{' '}
            <span className="font-mono" style={{ fontWeight: 600 }}>{curve?.curve_date}</span>
            <span style={{ margin: '0 10px', color: 'var(--border-color)' }}>|</span>
            <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>MODEL TYPE:</span>{' '}
            <span className="font-mono" style={{ fontWeight: 600, textTransform: 'uppercase', color: isFallback ? 'var(--color-error)' : 'var(--brand-color)' }}>
              {curve?.model_type}
            </span>
          </div>
          <div className="font-mono">
            <span>FIT ERROR (RMSE): {diagnostics?.fit_residual_error.toFixed(6)}</span>
            <span style={{ margin: '0 10px', color: 'var(--border-color)' }}>|</span>
            <span>OPTIMIZER: {diagnostics?.optimizer_converged ? 'CONVERGED' : 'FAILED'}</span>
            <span style={{ margin: '0 10px', color: 'var(--border-color)' }}>|</span>
            <span style={{ color: isFallback ? 'var(--color-error)' : 'var(--color-success)' }}>
              STATUS: {diagnostics?.validation_status.toUpperCase()}
            </span>
          </div>
        </div>
        {isFallback && curve?.diagnostics.validation_notes && (
          <div className="font-mono text-error" style={{ fontSize: '11px', marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '4px' }}>
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
        <div className="metric-card" style={{ borderLeftColor: summary.totalPnl >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
          <div className="metric-label">Scenario P&amp;L</div>
          <div className={`metric-value ${summary.totalPnl >= 0 ? 'text-success' : 'text-error'}`}>
            {summary.totalPnl >= 0 ? '+' : ''}
            {formatCurrency(summary.totalPnl)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Portfolio Modified Dur</div>
          <div className="metric-value">{summary.portfolioModDur.toFixed(3)} Y</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Portfolio DV01</div>
          <div className="metric-value">₹ {Math.round(summary.portfolioDv01).toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Portfolio Convexity</div>
          <div className="metric-value">{summary.portfolioConvexity.toFixed(2)}</div>
        </div>
      </div>

      {/* 3. Portfolio Positions Table */}
      <div className="panel" style={{ overflowX: 'auto' }}>
        <div className="panel-header">
          <span className="panel-title">Current Portfolio Positions</span>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Holding {computedPositions.length} securities
          </span>
        </div>
        <table className="dense-table">
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
            {computedPositions.map((pos) => {
              const isPositive = pos.pnl >= 0;
              return (
                <tr key={pos.security.isin}>
                  <td>{pos.security.isin}</td>
                  <td>{pos.security.security_name}</td>
                  <td className="num">{pos.faceValue.toLocaleString()}</td>
                  <td className="num">₹ {pos.baseCleanPrice.toFixed(4)}</td>
                  <td className="num">₹ {pos.baseDirtyPrice.toFixed(4)}</td>
                  <td className="num">₹ {pos.baseAccrued.toFixed(4)}</td>
                  <td className="num">{(pos.ytm).toFixed(3)}%</td>
                  <td className="num">{pos.modDur.toFixed(3)} Y</td>
                  <td className="num">₹ {Math.round(pos.dv01 * (pos.faceValue / 100.0)).toLocaleString()}</td>
                  <td className="num">₹ {pos.shockedDirtyPrice.toFixed(4)}</td>
                  <td className={`num ${isPositive ? 'text-success' : 'text-error'}`} style={{ fontWeight: 600 }}>
                    {isPositive ? '+' : ''}
                    {pos.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. Bottom Grid: Curve Chart & KRD Ladder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem' }}>
        <CurveChart baseZc={baseZc} shockedZc={shockedZc} title={`G-Sec Zero Rate Curve (As of ${curve?.curve_date})`} />
        <KRDLadder krdValues={summary.portfolioKrd} title="Portfolio Key Rate Durations Ladder" />
      </div>
    </div>
  );
}
