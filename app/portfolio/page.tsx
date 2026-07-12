'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useCurve } from '../../lib/state/CurveContext';
import { usePortfolio } from '../../lib/state/PortfolioContext';
import { useResults } from '../../lib/state/ResultsContext';
import { useAuth } from '../../lib/state/AuthContext';

export default function PortfolioBuilder() {
  const { securities, loading, error } = useCurve();
  const { portfolio, addPosition, removePosition, activePortfolioId, activePortfolioName,
    renamePortfolio, savePortfolio, savedPortfolios, fetchSavedPortfolios, loadPortfolio,
    deleteSavedPortfolio, clearActivePortfolio, compareIds, toggleCompare } = usePortfolio();
  const { computedPositions, summary } = useResults();
  const { user } = useAuth();

  const [selectedIsin, setSelectedIsin] = useState('');
  const [faceValue, setFaceValue] = useState(10000000); // Default 1 Cr
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [editName, setEditName] = useState(false);
  const [lastAddedIsin, setLastAddedIsin] = useState<string | null>(null);

  useEffect(() => { if (user) fetchSavedPortfolios(); }, [user, fetchSavedPortfolios]);

  // Filter out securities that are already in the portfolio or expired
  const availableSecurities = useMemo(() => {
    const portfolioIsins = new Set(portfolio.map(p => p.security.isin));
    return securities.filter(s => s.is_active && !portfolioIsins.has(s.isin));
  }, [securities, portfolio]);

  // Set default selection when available list changes
  useEffect(() => {
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
      setLastAddedIsin(security.isin);
      // Clear highlight after 1s
      setTimeout(() => setLastAddedIsin(null), 1000);
      setSelectedIsin('');
    }
  };

  const handleRemovePositionClick = (isin: string, name: string) => {
    if (confirm(`Are you sure you want to remove ${name} (${isin}) from your portfolio?`)) {
      removePosition(isin);
    }
  };

  const handleDeleteSavedPortfolioClick = (id: string, name: string) => {
    if (confirm(`Are you sure you want to permanently delete the saved portfolio "${name}"?`)) {
      deleteSavedPortfolio(id);
    }
  };

  if (loading) {
    return (
      <div className="container loading-container fade-in">
        <div>&gt;&gt; LOADING PORTFOLIO BUILDER...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container error-container fade-in">
        <div className="error-panel">
          <div className="error-title">SYSTEM FAULT</div>
          <div className="mt-10">{error}</div>
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
    <div className="container fade-in">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        
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
          <div className="panel table-wrapper table-scroll-hint">
            <div className="panel-header">
              <span className="panel-title">Portfolio Positions Editor</span>
            </div>
            {computedPositions.length === 0 ? (
              <div className="empty-state">
                Portfolio is empty. Use the builder panel on the right to add positions.
              </div>
            ) : (
              <table className="dense-table">
                <caption>Current portfolio components and asset breakdown</caption>
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
                  {computedPositions.map(pos => {
                    const isNew = pos.security.isin === lastAddedIsin;
                    return (
                      <tr key={pos.security.isin} className={isNew ? 'row-flash' : ''}>
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
                            onClick={() => handleRemovePositionClick(pos.security.isin, pos.security.security_name)}
                          >
                            DELETE
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
            <div className="empty-state">
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
                  aria-label="Select Security"
                >
                  {availableSecurities.map(s => (
                    <option key={s.isin} value={s.isin}>
                      {s.security_name} ({s.isin}) - Matures: {s.maturity_date}
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
                  aria-label="Holdings Face Value"
                />
                
                {/* Presets */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
                  {[
                    { label: '1L', val: 100000 },
                    { label: '5L', val: 500000 },
                    { label: '10L', val: 1000000 },
                    { label: '1Cr', val: 10000000 },
                    { label: '5Cr', val: 50000000 },
                    { label: '10Cr', val: 100000000 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="btn btn-secondary font-mono"
                      style={{ fontSize: '9px', padding: '2px 6px', flex: 1 }}
                      onClick={() => setFaceValue(preset.val)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <span className="font-mono text-secondary" style={{ fontSize: '10px', textAlign: 'right', marginTop: '5px' }}>
                  ≈ {formatCurrency(faceValue)}
                </span>
              </div>

              <button type="submit" className="btn" style={{ width: '100%', marginTop: '10px' }}>
                ADD POSITION
              </button>
            </form>
          )}

          {/* Cloud Persistence Panel */}
          <div style={{ marginTop: '25px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
            <span className="font-mono text-brand" style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              CLOUD PERSISTENCE:
            </span>

            {!user ? (
              <div className="font-mono text-secondary" style={{ fontSize: '11px' }}>
                Log in to save portfolios to the cloud.
              </div>
            ) : (
              <>
                {/* Portfolio name + save */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  {editName ? (
                    <input
                      className="form-input font-mono" style={{ flex: 1, fontSize: '11px' }}
                      value={activePortfolioName}
                      onChange={e => renamePortfolio(e.target.value)}
                      onBlur={() => setEditName(false)}
                      onKeyDown={e => e.key === 'Enter' && setEditName(false)}
                      autoFocus
                      aria-label="Portfolio Name"
                    />
                  ) : (
                    <button className="btn btn-secondary font-mono" style={{ flex: 1, fontSize: '11px', textAlign: 'left' }}
                      onClick={() => setEditName(true)}>
                      {activePortfolioName} ✎
                    </button>
                  )}
                  <button
                    className="btn font-mono" style={{ fontSize: '11px', minWidth: '80px' }}
                    disabled={saving || portfolio.length === 0}
                    onClick={async () => {
                      setSaving(true); setSaveMsg('');
                      try { await savePortfolio(); setSaveMsg('Saved.'); }
                      catch (e: unknown) { setSaveMsg(e instanceof Error ? e.message : 'Error.'); }
                      setSaving(false);
                    }}>
                    {saving ? '...' : activePortfolioId ? 'UPDATE' : 'SAVE'}
                  </button>
                </div>
                {saveMsg && <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{saveMsg}</div>}
                {activePortfolioId && (
                  <button className="btn btn-secondary font-mono" style={{ fontSize: '10px', width: '100%', marginBottom: '10px' }}
                    onClick={clearActivePortfolio}>NEW PORTFOLIO</button>
                )}

                {/* Saved list */}
                {savedPortfolios.length > 0 ? (
                  <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '8px', border: '1px solid var(--border-color)', borderRadius: '2px', padding: '5px' }}>
                    {savedPortfolios.map(sp => (
                      <div key={sp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={compareIds.includes(sp.id)}
                            onChange={() => toggleCompare(sp.id)}
                            style={{ accentColor: 'var(--brand-color)' }}
                            aria-label={`Compare ${sp.portfolio_name}`}
                          />
                          <button className="font-mono" style={{ fontSize: '10px', color: sp.id === activePortfolioId ? 'var(--brand-color)' : 'var(--text-primary)',
                            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                            onClick={() => loadPortfolio(sp.id)}>
                            {sp.portfolio_name} <span style={{ color: 'var(--text-secondary)' }}>({sp.position_count})</span>
                          </button>
                        </label>
                        <button className="font-mono" style={{ fontSize: '10px', color: 'var(--color-error)', background: 'none',
                          border: 'none', cursor: 'pointer' }}
                          onClick={() => handleDeleteSavedPortfolioClick(sp.id, sp.portfolio_name)}>DEL</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="font-mono text-secondary" style={{ fontSize: '10px', padding: '10px 0', textAlign: 'center' }}>
                    No saved portfolios.
                  </div>
                )}
                
                {compareIds.length >= 2 && (
                  <a href="/compare" className="btn font-mono" style={{ fontSize: '10px', width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                    COMPARE {compareIds.length} PORTFOLIOS
                  </a>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
