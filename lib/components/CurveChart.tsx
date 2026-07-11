'use client';

import React from 'react';
import { ZeroCurve } from '../pricing-engine/bootstrap';

interface CurveChartProps {
  baseZc: ZeroCurve;
  shockedZc: ZeroCurve;
  title?: string;
}

export default function CurveChart({ baseZc, shockedZc, title = 'G-Sec Yield Curve' }: CurveChartProps) {
  const points: { t: number; baseRate: number; shockedRate: number }[] = [];
  const maxT = 30.0;
  
  for (let t = 0.5; t <= maxT; t += 0.5) {
    points.push({
      t,
      baseRate: baseZc.getZeroRate(t),
      shockedRate: shockedZc.getZeroRate(t)
    });
  }
  
  const allRates = [...points.map(p => p.baseRate), ...points.map(p => p.shockedRate)];
  const maxRate = Math.max(9.0, Math.ceil(Math.max(...allRates) * 2) / 2);
  const minRate = Math.min(5.0, Math.floor(Math.min(...allRates) * 2) / 2);
  
  const width = 600;
  const height = 300;
  const padding = 40;
  
  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;
  
  const getX = (t: number) => padding + (t / maxT) * plotWidth;
  const getY = (rate: number) => height - padding - ((rate - minRate) / (maxRate - minRate)) * plotHeight;
  
  const basePath = points.reduce((acc, p, idx) => {
    const x = getX(p.t);
    const y = getY(p.baseRate);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');
  
  const shockedPath = points.reduce((acc, p, idx) => {
    const x = getX(p.t);
    const y = getY(p.shockedRate);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');
  
  const yTicks: number[] = [];
  for (let r = minRate; r <= maxRate; r += 0.5) {
    yTicks.push(r);
  }
  
  const xTicks = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30];
  
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span className="font-mono text-brand" style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>
          {title}
        </span>
        <div style={{ display: 'flex', gap: '15px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--brand-color)' }}>● Base Curve</span>
          <span style={{ color: 'var(--color-error)' }}>-- Shocked Curve</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
        {yTicks.map(r => {
          const y = getY(r);
          return (
            <g key={r}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--border-color)" strokeWidth="0.5" />
              <text x={padding - 8} y={y + 3} textAnchor="end" fill="var(--text-secondary)">{r.toFixed(2)}%</text>
            </g>
          );
        })}
        
        {xTicks.map(t => {
          const x = getX(t);
          return (
            <g key={t}>
              <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="var(--border-color)" strokeWidth="0.5" />
              <text x={x} y={height - padding + 15} textAnchor="middle" fill="var(--text-secondary)">{t}Y</text>
            </g>
          );
        })}
        
        <path d={basePath} fill="none" stroke="var(--brand-color)" strokeWidth="2.5" />
        <path d={shockedPath} fill="none" stroke="var(--color-error)" strokeWidth="2" strokeDasharray="4 3" />
        
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-color)" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border-color)" strokeWidth="1" />
      </svg>
    </div>
  );
}
