'use client';

import React from 'react';
import { ZeroCurve } from '../pricing-engine/bootstrap';

interface CurveChartProps {
  baseZc: ZeroCurve;
  shockedZc: ZeroCurve;
  title?: string;
}

export default function CurveChart({ baseZc, shockedZc, title = 'G-Sec Yield Curve' }: CurveChartProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [hoverData, setHoverData] = React.useState<{
    x: number;
    baseY: number;
    shockedY: number;
    t: number;
    baseRate: number;
    shockedRate: number;
  } | null>(null);

  if (!baseZc || !shockedZc) {
    return (
      <div className="empty-state">
        No curve data available
      </div>
    );
  }

  const points: { t: number; baseRate: number; shockedRate: number }[] = [];
  const maxT = 30.0;
  
  for (let t = 0.5; t <= maxT; t += 0.5) {
    points.push({
      t,
      baseRate: baseZc.getZeroRate(t),
      shockedRate: shockedZc.getZeroRate(t)
    });
  }
  
  if (points.length === 0) {
    return (
      <div className="empty-state">
        No curve data available
      </div>
    );
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

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const relativeX = clientX - rect.left;
    const svgX = (relativeX / rect.width) * width;

    const mouseT = ((svgX - padding) / plotWidth) * maxT;
    if (mouseT < 0 || mouseT > maxT) {
      setHoverData(null);
      return;
    }

    let closestPoint = points[0];
    let minDiff = Math.abs(points[0].t - mouseT);
    for (const p of points) {
      const diff = Math.abs(p.t - mouseT);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = p;
      }
    }

    setHoverData({
      x: getX(closestPoint.t),
      baseY: getY(closestPoint.baseRate),
      shockedY: getY(closestPoint.shockedRate),
      t: closestPoint.t,
      baseRate: closestPoint.baseRate,
      shockedRate: closestPoint.shockedRate
    });
  };

  const handleMouseLeave = () => {
    setHoverData(null);
  };
  
  return (
    <div className="panel chart-panel">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        <div style={{ display: 'flex', gap: '15px', fontSize: '11px', fontFamily: 'var(--font-mono)', alignItems: 'center' }}>
          <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="12" height="6" style={{ display: 'inline-block' }}><line x1="0" y1="3" x2="12" y2="3" stroke="var(--accent)" strokeWidth="2.5" /></svg> Base
          </span>
          <span style={{ color: 'var(--negative)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="12" height="6" style={{ display: 'inline-block' }}><line x1="0" y1="3" x2="12" y2="3" stroke="var(--negative)" strokeWidth="2" strokeDasharray="3 2" /></svg> Shocked
          </span>
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="auto"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={title}
      >
        {yTicks.map(r => {
          const y = getY(r);
          return (
            <g key={r}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--border-subtle)" strokeWidth="0.5" />
              <text x={padding - 8} y={y + 3} textAnchor="end" fill="var(--text-secondary)">{r.toFixed(2)}%</text>
            </g>
          );
        })}
        
        {xTicks.map(t => {
          const x = getX(t);
          return (
            <g key={t}>
              <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="var(--border-subtle)" strokeWidth="0.5" />
              <text x={x} y={height - padding + 15} textAnchor="middle" fill="var(--text-secondary)">{t}Y</text>
            </g>
          );
        })}
        
        <path d={basePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        <path d={shockedPath} fill="none" stroke="var(--negative)" strokeWidth="2" strokeDasharray="4 3" />
        
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-subtle)" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border-subtle)" strokeWidth="1" />

        {hoverData && (
          <g>
            <line
              x1={hoverData.x}
              y1={padding}
              x2={hoverData.x}
              y2={height - padding}
              stroke="var(--text-tertiary)"
              strokeWidth="1"
              strokeDasharray="2 2"
              pointerEvents="none"
            />
            <circle
              cx={hoverData.x}
              cy={hoverData.baseY}
              r="4.5"
              fill="var(--accent)"
              stroke="#000"
              strokeWidth="1"
              pointerEvents="none"
            />
            <circle
              cx={hoverData.x}
              cy={hoverData.shockedY}
              r="4.5"
              fill="var(--negative)"
              stroke="#000"
              strokeWidth="1"
              pointerEvents="none"
            />
            <g
              transform={`translate(${
                hoverData.x > width / 2 ? hoverData.x - 145 : hoverData.x + 15
              }, ${Math.min(height - padding - 75, Math.max(padding, (hoverData.baseY + hoverData.shockedY) / 2 - 37))})`}
              pointerEvents="none"
            >
              <rect
                width="130"
                height="70"
                fill="var(--bg-secondary)"
                stroke="var(--border-medium)"
                strokeWidth="1"
                rx="3"
                opacity="0.95"
              />
              <text x="10" y="20" fill="var(--text-primary)" fontWeight="bold" fontSize="10">
                Tenor: {hoverData.t.toFixed(1)}Y
              </text>
              <text x="10" y="38" fill="var(--accent)" fontSize="9">
                Base: {hoverData.baseRate.toFixed(4)}%
              </text>
              <text x="10" y="54" fill="var(--negative)" fontSize="9">
                Shocked: {hoverData.shockedRate.toFixed(4)}%
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}
