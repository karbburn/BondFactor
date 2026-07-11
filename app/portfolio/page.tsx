'use client';

import React, { useState, useMemo } from 'react';
import { useCurve } from '../../lib/state/CurveContext';
import { usePortfolio } from '../../lib/state/PortfolioContext';
import { useResults } from '../../lib/state/ResultsContext';

export default function PortfolioBuilder() {
  const { securities, loading, error } = useCurve();
  const { portfolio, addPosition, removePosition } = usePortfolio();
  const { computedPositions, summary } = useResults();

  const [selectedIsin, setSelectedIsin] = useState('');
  const [faceValue, setFaceValue] = useState(10000000); // Default 1 Cr

  // Filter out securities that are already in the portfolio or expired
  const availableSecurities = useMemo(() => {
    const portfolioIsins = new Set(portfolio.map(p => p.security.isin));
    return securities.filter(s => s.is_active && !portfolioIsins.has(s.isin));
  }, [securities, portfolio]);

  // Set default selection when available list changes
  React.useEffect(() => {
    if (availableSecurities.length > 0 && !selectedIsin) {
      setSelectedIsin(availableSecurities[0].isin);
    }
  }, [availableSecurities, selectedIsin]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIsin || faceValue <= 0) return;
    
    const security = securities.find(s => s.isin === selectedIsin);
    if (security) {
      addPosition(security, faceValue);
      // Reset selected ISIN so the next available one is picked
      setSelectedIsin('');
    }
  };

  if (loading) {
    return (
      <div className="container font-mono" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--brand-color)' }}>
        <div>&gt;&gt; LOADING PORTFOLIO BUILDER...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container font-mono" style={{ padding: '2rem', color: 'var(--color-error)' }}>
        <div className="panel" style={{ borderColor: 'var(--color-error)' }}>
          <div className="panel-title" style={{ color: 'var(--color-error)' }}>SYSTEM FAULT</div>
          <div style={{ marginTop: '10px' }}>{error}</div>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    if (val >= 10000000) {
      return `₹ ${(val / 10000000).toFixed(4)} Cr`;
    }
    return `₹ ${(val / 100000).toFixed(2)} L`;
  };

  return (
    <div className="container">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Current Portfolio & Actions */}
        <div style={{ gridColumn: 'span 2' }}>
          
          {/* Portfolio Metrics Panel */}
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">Total Portfolio Face Value</div>
              <div className="metric-value">
                ₹ {(portfolio.reduce((acc, p) => acc + p.faceValue, 0) / 10000000).toFixed(2)} Cr
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Portfolio Base Clean Value</div>
              <div className="metric-value">{formatCurrency(summary.totalBaseCleanValue)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Portfolio Base Dirty Value</div>
              <div className="metric-value">{formatCurrency(summary.totalBaseDirtyValue)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Portfolio Modified Dur</div>
              <div className="metric-value">{summary.portfolioModDur.toFixed(3)} Y</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Portfolio Total DV01</div>
              <div className="metric-value">₹ {Math.round(summary.portfolioDv01).toLocaleString()}</div>
            </div>
          </div>

          {/* Current Positions Panel */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Portfolio Positions Editor</span>
            </div>
            {computedPositions.length === 0 ? (
              <div className="font-mono text-secondary" style={{ padding: '20px 0', textAlign: 'center' }}>
                [ Portfolio is empty. Use the builder panel on the right to add positions. ]
              </div>
            ) : (
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>ISIN</th>
                    <th>Security Name</th>
                    <th className="num">Face Value</th>
                    <th className="num">Clean Price</th>
                    <th className="num">Dirty Price</th>
                    <th className="num">Base YTM</th>
                    <th className="num">DV01</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {computedPositions.map(pos => (
                    <tr key={pos.security.isin}>
                      <td>{pos.security.isin}</td>
                      <td>{pos.security.security_name}</td>
                      <td className="num">{pos.faceValue.toLocaleString()}</td>
                      <td className="num">₹ {pos.baseCleanPrice.toFixed(4)}</td>
                      <td className="num">₹ {pos.baseDirtyPrice.toFixed(4)}</td>
                      <td className="num">{(pos.ytm).toFixed(3)}%</td>
                      <td className="num">₹ {Math.round(pos.dv01 * (pos.faceValue / 100.0)).toLocaleString()}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-danger font-mono"
                          style={{ fontSize: '10px', padding: '2px 8px' }}
                          onClick={() => removePosition(pos.security.isin)}
                        >
                          DELETE
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Add Security Form */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Add Position</span>
          </div>
          
          {availableSecurities.length === 0 ? (
            <div className="font-mono text-secondary" style={{ fontSize: '12px' }}>
              No further securities available to add (all active bonds already in portfolio).
            </div>
          ) : (
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>SELECT SECURITY:</label>
                <select
                  value={selectedIsin}
                  onChange={(e) => setSelectedIsin(e.target.value)}
                  className="form-input"
                  style={{ width: '100%' }}
                >
                  {availableSecurities.map(s => (
                    <option key={s.isin} value={s.isin}>
                      {s.isin} - {s.security_name} (Matures: {s.maturity_date})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>HOLDINGS FACE VALUE (₹):</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={faceValue}
                  onChange={(e) => setFaceValue(Math.max(100, parseInt(e.target.value) || 0))}
                  className="form-input font-mono"
                  style={{ width: '100%' }}
                />
                <span className="font-mono text-secondary" style={{ fontSize: '10px', textAlign: 'right' }}>
                  ≈ {formatCurrency(faceValue)}
                </span>
              </div>

              <button type="submit" className="btn" style={{ width: '100%', marginTop: '10px' }}>
                ADD POSITION
              </button>
            </form>
          )}

          <div style={{ marginTop: '25px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
            <span className="font-mono text-brand" style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              PHASE 2 COMPILATION:
            </span>
            <button className="btn btn-secondary font-mono" style={{ width: '100%', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'not-allowed' }} disabled>
              [SAVE PORTFOLIO TO CLOUD]
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
