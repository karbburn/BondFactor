'use client';

import React from 'react';
import { DEFAULT_KEY_TENORS } from '../pricing-engine/krd';

interface KRDLadderProps {
  krdValues: number[];
  tenors?: number[];
  title?: string;
}

export default function KRDLadder({ krdValues, tenors = DEFAULT_KEY_TENORS, title = 'Key Rate Duration Ladder (years)' }: KRDLadderProps) {
  const width = 400;
  const rowHeight = 22;
  const headerHeight = 25;
  const paddingLeft = 60;
  const paddingRight = 30;
  const plotWidth = width - paddingLeft - paddingRight;
  
  const height = tenors.length * rowHeight + headerHeight + 15;
  
  const maxAbsKrd = Math.max(0.5, ...krdValues.map(v => Math.abs(v)));
  const zeroX = paddingLeft + plotWidth / 2;
  
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px' }}>
      <div className="font-mono text-brand" style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {title}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
        <line x1={zeroX} y1={headerHeight} x2={zeroX} y2={height - 15} stroke="#8E8E93" strokeWidth="1" strokeDasharray="2 2" />
        <text x={zeroX} y={headerHeight - 8} textAnchor="middle" fill="var(--text-secondary)" style={{ fontSize: '8px' }}>0.0</text>
        
        {tenors.map((t, idx) => {
          const val = krdValues[idx] || 0.0;
          const y = headerHeight + idx * rowHeight;
          const barWidth = (val / maxAbsKrd) * (plotWidth / 2);
          
          const barX = val >= 0 ? zeroX : zeroX + barWidth;
          const displayWidth = Math.abs(barWidth);
          const barColor = val >= 0 ? 'var(--brand-color)' : 'var(--color-error)';
          
          return (
            <g key={t}>
              <text x={paddingLeft - 10} y={y + 14} textAnchor="end" fill="var(--text-primary)" style={{ fontWeight: 500 }}>
                {t < 1 ? `${t * 12}M` : `${t}Y`}
              </text>
              
              <line x1={paddingLeft} y1={y + rowHeight} x2={width - paddingRight} y2={y + rowHeight} stroke="var(--border-color)" strokeWidth="0.5" />
              
              <rect
                x={barX}
                y={y + 4}
                width={Math.max(1, displayWidth)}
                height={rowHeight - 8}
                fill={barColor}
                opacity="0.8"
                rx="1"
              />
              
              <text
                x={val >= 0 ? zeroX + barWidth + 5 : zeroX + barWidth - 5}
                y={y + 14}
                textAnchor={val >= 0 ? 'start' : 'end'}
                fill={val >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
                style={{ fontSize: '9px', fontWeight: 600 }}
              >
                {val.toFixed(3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
