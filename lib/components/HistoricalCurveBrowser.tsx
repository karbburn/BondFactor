'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  const fetchDates = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/v1/curves/history/dates`)
      .then(r => { if (!r.ok) throw new Error(`History HTTP ${r.status}`); return r.json(); })
      .then(data => { setDates(data); })
      .catch(e => { setError(e instanceof Error ? e.message : 'Failed to load archive index'); })
      .finally(() => { setLoading(false); });
  }, [API_BASE]);

  useEffect(() => {
    fetchDates();
  }, [fetchDates]);

  useEffect(() => {
    if (!selectedDate) { setZeroPoints([]); return; }
    let cancelled = false;
    setLoadingCurve(true);
    fetch(`${API_BASE}/api/v1/curves/${selectedDate}/zero-curve`)
      .then(r => { if (!r.ok) throw new Error(`Curve HTTP ${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) setZeroPoints(data); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load curve data'); })
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

  // Filtered dates based on search
  const filteredDates = useMemo(() => {
    return dates.filter(d => d.curve_date.includes(searchQuery));
  }, [dates, searchQuery]);

  // Keyboard navigation handler for listbox
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredDates.length === 0) return;
    let nextIdx = focusedIdx;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIdx = focusedIdx < filteredDates.length - 1 ? focusedIdx + 1 : 0;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIdx = focusedIdx > 0 ? focusedIdx - 1 : filteredDates.length - 1;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIdx >= 0 && focusedIdx < filteredDates.length) {
        setSelectedDate(filteredDates[focusedIdx].curve_date);
        setError(null);
      }
    }
    if (nextIdx !== focusedIdx) {
      setFocusedIdx(nextIdx);
      const btn = document.getElementById(`date-btn-${filteredDates[nextIdx].curve_date}`);
      if (btn) btn.focus();
    }
  };

  if (loading) {
    return (
      <div className="container fade-in">
        {/* Coverage banner skeleton */}
        <div className="panel skeleton" style={{ height: '42px', marginBottom: '1rem' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem' }}>
          <div className="panel" style={{ height: '350px' }}>
            <div className="skeleton skeleton-text" style={{ width: '60%', marginBottom: '15px' }} />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton skeleton-table-row" style={{ height: '24px', marginBottom: '8px' }} />
            ))}
          </div>
          <div>
            <div className="panel skeleton skeleton-chart-box" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Coverage banner — 12px font and prominent border */}
      <div className="panel" style={{
        padding: '12px 18px',
        marginBottom: '1rem',
      }}>
        <div className="font-mono" style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.6' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>ARCHIVE COVERAGE:</span>{' '}
          {coverageBanner ? (
            <>
              {coverageBanner.earliest} to {coverageBanner.latest} —{' '}
              <span style={{ fontWeight: 600 }}>{coverageBanner.count} date{coverageBanner.count !== 1 ? 's' : ''}</span>{' '}
              archived. Historical coverage builds daily upon backend par yield ingestion.
            </>
          ) : (
            <span style={{ color: 'var(--negative)' }}>
              No archived curves yet. Daily ingestion data will populate this workstation database.
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="panel" style={{ borderColor: 'var(--negative)', padding: '12px 15px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="font-mono text-error" style={{ fontSize: '11px' }}>{error}</div>
          <button className="btn btn-secondary font-mono" style={{ fontSize: '9px', padding: '2px 8px' }} onClick={fetchDates}>
            RETRY
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* Date search and listbox */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title" style={{ fontSize: '11px' }}>Archived Curves</span>
          </div>
          
          <input
            type="text"
            className="form-input"
            style={{ width: '100%', marginBottom: '10px', fontSize: '11px' }}
            placeholder="Filter by date..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setFocusedIdx(-1); }}
            aria-label="Filter archived dates"
          />

          {filteredDates.length === 0 ? (
            <div className="font-mono text-secondary" style={{ fontSize: '10px', padding: '15px', textAlign: 'center' }}>
              No matching dates.
            </div>
          ) : (
            <div
              role="listbox"
              aria-label="Archived dates"
              onKeyDown={handleKeyDown}
              style={{ maxHeight: '420px', overflowY: 'auto', outline: 'none' }}
              tabIndex={0}
            >
              {filteredDates.map((d, idx) => (
                <button
                  key={d.curve_date}
                  id={`date-btn-${d.curve_date}`}
                  onClick={() => { setSelectedDate(d.curve_date); setError(null); }}
                  onFocus={() => setFocusedIdx(idx)}
                  role="option"
                  aria-selected={selectedDate === d.curve_date}
                  tabIndex={focusedIdx === idx || (focusedIdx === -1 && idx === 0) ? 0 : -1}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 10px', border: 'none', borderBottom: '1px solid var(--border-subtle)',
                    background: selectedDate === d.curve_date ? 'var(--bg-tertiary)' : 'transparent',
                    color: selectedDate === d.curve_date ? 'var(--accent)' : 'var(--text-primary)',
                    cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px',
                    outline: 'none'
                  }}
                >
                  <div style={{ fontWeight: selectedDate === d.curve_date ? 600 : 400 }}>{d.curve_date}</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {d.model_type.toUpperCase()} · {d.point_count} pts
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chart + table */}
        <div>
          {loadingCurve ? (
            <div className="panel skeleton skeleton-chart-box" />
          ) : !selectedDate ? (
            <div className="panel" style={{ padding: '3rem', textAlign: 'center' }}>
              <div className="font-mono text-secondary" style={{ fontSize: '12px' }}>
                Select a date from the archive to view its Zero curve structure.
              </div>
            </div>
          ) : historicalZc ? (
            <>
              <CurveChart
                baseZc={historicalZc}
                shockedZc={historicalZc}
                title={`Archived Zero Curve — ${selectedDate}`}
              />

              {/* Yield table */}
              <div className="panel table-wrapper table-scroll-hint" style={{ marginTop: '1rem' }}>
                <div className="panel-header">
                  <span className="panel-title" style={{ fontSize: '11px' }}>
                    Zero Curve Data — {selectedDate}
                  </span>
                </div>
                <table className="dense-table" style={{ fontSize: '10px' }}>
                  <caption>Yield curve data points for selected archive date {selectedDate}</caption>
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
                        <td className="num">{p.zero_rate.toFixed(4)}%</td>
                        <td className="num">{p.discount_factor.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
