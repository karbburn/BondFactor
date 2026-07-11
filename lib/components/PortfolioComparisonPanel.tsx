'use client';

import React from 'react';
import { ComputedPosition, PortfolioSummary } from '../pricing-engine/computeResults';
import { DEFAULT_KEY_TENORS } from '../pricing-engine/krd';

interface Props {
  name: string;
  computedPositions: ComputedPosition[];
  summary: PortfolioSummary;
  color: string;
}

const formatCurrency = (val: number) => {
  if (val >= 10000000) return `₹ ${(val / 10000000).toFixed(4)} Cr`;
  return `₹ ${(val / 100000).toFixed(2)} L`;
};

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', padding: '10px 0' }}>
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
        <div style={{ overflowX: 'auto', marginTop: '8px' }}>
          <table className="dense-table" style={{ fontSize: '10px' }}>
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
      <div style={{ marginTop: '10px' }}>
        <div className="font-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>KRD Profile</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '40px' }}>
          {summary.portfolioKrd.map((v, i) => {
            const maxKrd = Math.max(0.1, ...summary.portfolioKrd);
            const h = Math.max(1, (Math.abs(v) / maxKrd) * 36);
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <div
                  style={{
                    width: '100%', height: `${h}px`,
                    backgroundColor: v >= 0 ? color : 'var(--color-error)',
                    borderRadius: '1px', opacity: 0.8,
                  }}
                  title={`${DEFAULT_KEY_TENORS[i] < 1 ? DEFAULT_KEY_TENORS[i] * 12 + 'M' : DEFAULT_KEY_TENORS[i] + 'Y'}: ${v.toFixed(3)}`}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
          {DEFAULT_KEY_TENORS.map((t, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '7px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {t < 1 ? `${t * 12}M` : `${t}Y`}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
