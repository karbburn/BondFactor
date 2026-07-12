'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ZeroCurve } from '../pricing-engine/bootstrap';
import CurveChart from './CurveChart';

interface ArchivedDate {
  curve_date: string;
  model_type: string;
  validation_status: string;
  point_count: number;
}

interface ZeroPoint {
  tenor_years: number;
  zero_rate: number;
  discount_factor: number;
}

export default function HistoricalCurveBrowser() {
  const [dates, setDates] = useState<ArchivedDate[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [zeroPoints, setZeroPoints] = useState<ZeroPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCurve, setLoadingCurve] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/v1/curves/history/dates`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) setDates(data); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [API_BASE]);

  useEffect(() => {
    if (!selectedDate) { setZeroPoints([]); return; }
    let cancelled = false;
    setLoadingCurve(true);
    fetch(`${API_BASE}/api/v1/curves/${selectedDate}/zero-curve`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) setZeroPoints(data); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load curve'); })
      .finally(() => { if (!cancelled) setLoadingCurve(false); });
    return () => { cancelled = true; };
  }, [selectedDate, API_BASE]);

  const historicalZc = useMemo(() => {
    if (zeroPoints.length === 0) return null;
    const maturities = zeroPoints.map(p => p.tenor_years);
    const rates = zeroPoints.map(p => p.zero_rate);
    return new ZeroCurve(maturities, rates);
  }, [zeroPoints]);

  const coverageBanner = useMemo(() => {
    if (dates.length === 0) return null;
    const sorted = [...dates].sort((a, b) => a.curve_date.localeCompare(b.curve_date));
    const earliest = sorted[0].curve_date;
    const latest = sorted[sorted.length - 1].curve_date;
    const count = dates.length;
    return { earliest, latest, count };
  }, [dates]);

  if (loading) {
    return (
      <div className="font-mono" style={{ padding: '20px', color: 'var(--text-secondary)', textAlign: 'center' }}>
        &gt;&gt; LOADING ARCHIVE INDEX...
      </div>
    );
  }

  return (
    <div>
      {/* Coverage banner — always visible */}
      <div className="panel" style={{
        padding: '10px 15px',
        borderLeft: '3px solid var(--color-warning, #FF9F0A)',
        marginBottom: '1rem',
      }}>
        <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--brand-color)', fontWeight: 600 }}>ARCHIVE COVERAGE:</span>{' '}
          {coverageBanner ? (
            <>
              {coverageBanner.earliest} to {coverageBanner.latest} —{' '}
              <span style={{ fontWeight: 600 }}>{coverageBanner.count} date{coverageBanner.count !== 1 ? 's' : ''}</span>{' '}
              archived. Coverage builds daily from each ingestion.
            </>
          ) : (
            <span style={{ color: 'var(--color-error)' }}>
              No archived curves yet. Data will appear here as daily ingestion runs.
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="panel" style={{ borderColor: 'var(--color-error)', padding: '10px 15px', marginBottom: '1rem' }}>
          <div className="font-mono text-error" style={{ fontSize: '11px' }}>{error}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* Date list */}
        <div className="panel" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <div className="panel-header">
            <span className="panel-title" style={{ fontSize: '11px' }}>Archived Dates</span>
          </div>
          {dates.length === 0 ? (
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '15px', textAlign: 'center' }}>
              No dates archived yet.
            </div>
          ) : (
            dates.map(d => (
              <button
                key={d.curve_date}
                onClick={() => { setSelectedDate(d.curve_date); setError(null); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 10px', border: 'none', borderBottom: '1px solid var(--border-color)',
                  background: selectedDate === d.curve_date ? 'var(--bg-tertiary)' : 'transparent',
                  color: selectedDate === d.curve_date ? 'var(--brand-color)' : 'var(--text-primary)',
                  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px',
                }}
              >
                <div style={{ fontWeight: selectedDate === d.curve_date ? 600 : 400 }}>{d.curve_date}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {d.model_type.toUpperCase()} · {d.point_count} pts
                </div>
              </button>
            ))
          )}
        </div>

        {/* Chart + table */}
        <div>
          {loadingCurve && (
            <div className="font-mono" style={{ padding: '20px', color: 'var(--text-secondary)', textAlign: 'center' }}>
              &gt;&gt; LOADING CURVE DATA...
            </div>
          )}

          {!selectedDate && !loadingCurve && (
            <div className="panel" style={{ padding: '3rem', textAlign: 'center' }}>
              <div className="font-mono" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                Select a date from the archive to view its zero curve.
              </div>
            </div>
          )}

          {historicalZc && !loadingCurve && (
            <>
              <CurveChart
                baseZc={historicalZc}
                shockedZc={historicalZc}
                title={`Archived Zero Curve — ${selectedDate}`}
              />

              {/* Yield table */}
              <div className="panel" style={{ marginTop: '1rem', overflowX: 'auto' }}>
                <div className="panel-header">
                  <span className="panel-title" style={{ fontSize: '11px' }}>
                    Zero Curve Data — {selectedDate}
                  </span>
                </div>
                <table className="dense-table" style={{ fontSize: '10px' }}>
                  <thead>
                    <tr>
                      <th>Tenor</th>
                      <th className="num">Zero Rate (%)</th>
                      <th className="num">Discount Factor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeroPoints.map(p => (
                      <tr key={p.tenor_years}>
                        <td>{p.tenor_years < 1 ? `${p.tenor_years * 12}M` : `${p.tenor_years}Y`}</td>
                        <td className="num">{p.zero_rate.toFixed(4)}</td>
                        <td className="num">{p.discount_factor.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
