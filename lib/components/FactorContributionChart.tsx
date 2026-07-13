'use client';

import React from 'react';
import { FactorPnLDecomposition } from '../pricing-engine/risk';
import { formatCurrency } from '../utils/format';

interface FactorContributionChartProps {
  factorPnL: FactorPnLDecomposition;
  title?: string;
  hidePanelWrapper?: boolean;
}

export default function FactorContributionChart({ factorPnL, title = 'NSS Factor P&L Contributions', hidePanelWrapper = false }: FactorContributionChartProps) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  if (!factorPnL) {
    return (
      <div className="empty-state">
        No attribution data available
      </div>
    );
  }

  const factors = [
    { label: 'Level (β₀)', value: factorPnL.level },
    { label: 'Slope (β₁)', value: factorPnL.slope },
    { label: 'Curvature 1 (β₂)', value: factorPnL.curvature1 },
    { label: 'Curvature 2 (β₃)', value: factorPnL.curvature2 },
    { label: 'Interaction Residual', value: factorPnL.residual }
  ];

  const width = 500;
  const rowHeight = 28;
  const headerHeight = 25;
  const paddingLeft = 140;
  const paddingRight = 80;
  const plotWidth = width - paddingLeft - paddingRight;
  const height = factors.length * rowHeight + headerHeight + 15;

  const maxAbsVal = Math.max(100.0, ...factors.map(f => Math.abs(f.value)));
  const zeroX = paddingLeft + plotWidth / 2;

  const svgContent = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="auto"
      style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', overflow: 'visible' }}
      role="img"
      aria-label={title}
    >
      {/* Zero baseline */}
      <line
        x1={zeroX}
        y1={headerHeight}
        x2={zeroX}
        y2={height - 15}
        stroke="var(--text-tertiary)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <text
        x={zeroX}
        y={headerHeight - 8}
        textAnchor="middle"
        fill="var(--text-secondary)"
        style={{ fontSize: '8px' }}
      >
        ₹ 0.00
      </text>

      {factors.map((factor, idx) => {
        const val = factor.value;
        const y = headerHeight + idx * rowHeight;
        const barWidth = (val / maxAbsVal) * (plotWidth / 2);
        const barX = val >= 0 ? zeroX : zeroX + barWidth;
        const displayWidth = Math.abs(barWidth);

        const isHovered = hoveredIdx === idx;
        const barColor = val >= 0
          ? (isHovered ? 'var(--accent-hover)' : 'var(--accent)')
          : (isHovered ? 'var(--negative)' : 'var(--negative)');
        const barOpacity = isHovered ? '1.0' : '0.8';

        return (
          <g key={factor.label}>
            {/* Row label */}
            <text
              x={paddingLeft - 10}
              y={y + 18}
              textAnchor="end"
              fill="var(--text-primary)"
              style={{ fontWeight: 500, fontSize: '10px' }}
            >
              {factor.label}
            </text>

            {/* Grid row line */}
            <line
              x1={paddingLeft}
              y1={y + rowHeight}
              x2={width - paddingRight}
              y2={y + rowHeight}
              stroke="var(--border-subtle)"
              strokeWidth="0.5"
            />

            {/* Bar */}
            <rect
              x={barX}
              y={y + 5}
              width={Math.max(1, displayWidth)}
              height={rowHeight - 10}
              fill={barColor}
              opacity={barOpacity}
              rx="1"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'pointer', transition: 'fill 0.15s ease, opacity 0.15s ease' }}
            />

            {/* Value text label beside the bar */}
            <text
              x={val >= 0 ? zeroX + barWidth + 5 : zeroX + barWidth - 5}
              y={y + 17}
              textAnchor={val >= 0 ? 'start' : 'end'}
              fill={val >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
              style={{ fontSize: '9px', fontWeight: 600 }}
            >
              {val >= 0 ? '+' : ''}
              {formatCurrency(val)}
            </text>
          </g>
        );
      })}

      {/* Hover Tooltip */}
      {hoveredIdx !== null && (
        <g
          transform={`translate(${
            zeroX + (factors[hoveredIdx].value / maxAbsVal) * (plotWidth / 2)
          }, ${headerHeight + hoveredIdx * rowHeight - 4})`}
          pointerEvents="none"
        >
          <rect
            width="100"
            height="20"
            x="-50"
            y="-20"
            fill="var(--bg-tertiary)"
            stroke="var(--border-medium)"
            strokeWidth="1"
            rx="2"
            opacity="0.95"
          />
          <text
            x="0"
            y="-7"
            textAnchor="middle"
            fill="var(--text-primary)"
            style={{ fontSize: '9px', fontWeight: 600 }}
          >
            {factors[hoveredIdx].value >= 0 ? '+' : ''}
            {formatCurrency(factors[hoveredIdx].value)}
          </text>
        </g>
      )}
    </svg>
  );

  if (hidePanelWrapper) {
    return svgContent;
  }

  return (
    <div className="panel chart-panel">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
      </div>
      {svgContent}
    </div>
  );
}
