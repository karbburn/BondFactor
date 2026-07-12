'use client';

import React from 'react';
import { ComputedPosition, PortfolioSummary } from '../pricing-engine/computeResults';
import { DEFAULT_KEY_TENORS } from '../pricing-engine/krd';
import { formatCurrency } from '../utils/format';

interface Props {
  name: string;
  computedPositions: ComputedPosition[];
  summary: PortfolioSummary;
  color: string;
}

export default function PortfolioComparisonPanel({ name, computedPositions, summary, color }: Props) {
  return (
    <div className="panel" style={{ borderLeftColor: color, borderLeftWidth: '3px' }}>
      <div className="panel-header" style={{ borderBottomColor: color }}>
        <span className="panel-title" style={{ color }}>{name}</span>
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {computedPositions.length} securities
        </span>
      </div>

      {/* Summary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', padding: '10px 0' }}>
        <div>
          <div className="font-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Base Dirty Value</div>
          <div className="font-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{formatCurrency(summary.totalBaseDirtyValue)}</div>
        </div>
        <div>
          <div className="font-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Scenario P&amp;L</div>
          <div className={`font-mono ${summary.totalPnl >= 0 ? 'text-success' : 'text-error'}`} style={{ fontSize: '13px', fontWeight: 600 }}>
            {summary.totalPnl >= 0 ? '+' : ''}{formatCurrency(summary.totalPnl)}
          </div>
        </div>
        <div>
          <div className="font-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Mod Duration</div>
          <div className="font-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{summary.portfolioModDur.toFixed(3)} Y</div>
        </div>
        <div>
          <div className="font-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>DV01</div>
          <div className="font-mono" style={{ fontSize: '13px', fontWeight: 600 }}>₹ {Math.round(summary.portfolioDv01).toLocaleString()}</div>
        </div>
        <div>
          <div className="font-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Convexity</div>
          <div className="font-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{summary.portfolioConvexity.toFixed(2)}</div>
        </div>
      </div>

      {/* Positions table */}
      {computedPositions.length > 0 && (
        <div className="table-wrapper table-scroll-hint" style={{ marginTop: '8px' }}>
          <table className="dense-table" style={{ fontSize: '10px' }}>
            <caption>Positions table for {name}</caption>
            <thead>
              <tr>
                <th>ISIN</th>
                <th>Face Value</th>
                <th className="num">Clean</th>
                <th className="num">YTM</th>
                <th className="num">Mod Dur</th>
                <th className="num">DV01</th>
                <th className="num">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {computedPositions.map(pos => (
                <tr key={pos.security.isin}>
                  <td>{pos.security.isin}</td>
                  <td className="num">{pos.faceValue.toLocaleString()}</td>
                  <td className="num">₹ {pos.baseCleanPrice.toFixed(4)}</td>
                  <td className="num">{pos.ytm.toFixed(3)}%</td>
                  <td className="num">{pos.modDur.toFixed(3)} Y</td>
                  <td className="num">₹ {Math.round(pos.dv01 * (pos.faceValue / 100.0)).toLocaleString()}</td>
                  <td className={`num ${pos.pnl >= 0 ? 'text-success' : 'text-error'}`} style={{ fontWeight: 600 }}>
                    {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* KRD bar sparkline */}
      <div style={{ marginTop: '15px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
        <div className="font-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>KRD Profile</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '45px', padding: '0 5px' }}>
          {summary.portfolioKrd.map((v, i) => {
            const maxKrd = Math.max(0.1, ...summary.portfolioKrd.map(Math.abs));
            const h = Math.max(1, (Math.abs(v) / maxKrd) * 40);
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <div
                  style={{
                    width: '100%', height: `${h}px`,
                    backgroundColor: v >= 0 ? color : 'var(--negative)',
                    borderRadius: '1px', opacity: 0.8,
                    transition: 'all 0.15s ease',
                  }}
                  title={`${DEFAULT_KEY_TENORS[i] < 1 ? DEFAULT_KEY_TENORS[i] * 12 + 'M' : DEFAULT_KEY_TENORS[i] + 'Y'}: ${v.toFixed(3)}`}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '3px', marginTop: '4px', padding: '0 5px' }}>
          {DEFAULT_KEY_TENORS.map((t, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
              {t < 1 ? `${t * 12}M` : `${t}Y`}
            </div>
          ))}
        </div>
        <div className="font-mono" style={{ fontSize: '8px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '6px', letterSpacing: '0.05em' }}>
          Maturity Tenor (Months / Years)
        </div>
      </div>
    </div>
  );
}
