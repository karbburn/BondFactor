'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePortfolio } from '../../lib/state/PortfolioContext';
import { useAuth } from '../../lib/state/AuthContext';
import { useScenario } from '../../lib/state/ScenarioContext';
import { getSupabase } from '../../lib/supabase/client';

interface ReportStatus {
  report_id: string;
  status: string;
  download_url: string | null;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { savedPortfolios, fetchSavedPortfolios, activePortfolioId } = usePortfolio();
  const { parallelShift, slopeShock, curvature1Shock, curvature2Shock, twistShock, twistPivot } = useScenario();

  const [selectedPortfolio, setSelectedPortfolio] = useState('');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<ReportStatus | null>(null);
  const [error, setError] = useState('');

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { if (user) fetchSavedPortfolios(); }, [user, fetchSavedPortfolios]);

  useEffect(() => {
    if (activePortfolioId) setSelectedPortfolio(activePortfolioId);
  }, [activePortfolioId]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const handleCancel = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setGenerating(false);
    setReport(null);
    setError('Report generation cancelled by user.');
  };

  const handleGenerate = async () => {
    if (!selectedPortfolio) return;
    setGenerating(true);
    setError('');
    setReport(null);

    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const res = await fetch(`${base}/api/v1/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          portfolio_id: selectedPortfolio,
          format,
          scenarios: [{
            name: 'Current Scenario',
            parallel_shift: parallelShift,
            slope_shock: slopeShock,
            curvature1_shock: curvature1Shock,
            curvature2_shock: curvature2Shock,
            twist_shock: twistShock,
            twist_pivot: twistPivot,
          }],
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `API error ${res.status}`);
      }

      const data: ReportStatus = await res.json();
      setReport(data);

      let ticks = 0;
      const maxTicks = 20; // 20 ticks of 1500ms = 30 seconds
      
      // Poll for completion
      const pollInterval = setInterval(async () => {
        ticks++;
        if (ticks >= maxTicks) {
          clearInterval(pollInterval);
          setGenerating(false);
          setError('Report generation taking longer than expected (30s timeout). Please try again.');
          return;
        }

        try {
          const pollRes = await fetch(`${base}/api/v1/reports/${data.report_id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const pollData: ReportStatus = await pollRes.json();
          if (pollData.status === 'completed' || pollData.status === 'failed') {
            clearInterval(pollInterval);
            setReport(pollData);
            setGenerating(false);
            if (pollData.status === 'failed') setError('Report generation failed.');
          }
        } catch {
          clearInterval(pollInterval);
          setGenerating(false);
          setError('Lost connection to reports server.');
        }
      }, 1500);

      pollIntervalRef.current = pollInterval;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start generation');
      setGenerating(false);
    }
  };

  if (!user) {
    return (
      <div className="container fade-in">
        <div className="panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="font-mono text-secondary" style={{ fontSize: '12px' }}>
            Log in to generate workstation risk reports.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container fade-in">
      <div className="panel" style={{ padding: '12px 15px', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span className="font-mono text-brand" style={{ fontWeight: 600, fontSize: '13px' }}>
            RISK REPORT GENERATOR
          </span>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Server-side repricing — matches quant_core results
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Config panel */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Report Configuration</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>PORTFOLIO:</label>
              <select
                value={selectedPortfolio}
                onChange={e => setSelectedPortfolio(e.target.value)}
                className="form-input"
                aria-label="Select Portfolio"
              >
                <option value="">Select a portfolio...</option>
                {savedPortfolios.map(sp => (
                  <option key={sp.id} value={sp.id}>{sp.portfolio_name} ({sp.position_count} positions)</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>FORMAT:</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {(['pdf', 'xlsx'] as const).map(f => (
                  <button
                    key={f}
                    className={`btn font-mono ${format === f ? '' : 'btn-secondary'}`}
                    style={{ flex: 1, fontSize: '11px' }}
                    onClick={() => setFormat(f)}
                    aria-pressed={format === f}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
              <div className="font-mono" style={{ marginBottom: '5px', fontWeight: 600 }}>ACTIVE NSS CURVE SHOCKS:</div>
              <div>Level: {parallelShift >= 0 ? '+' : ''}{parallelShift.toFixed(2)}%</div>
              <div>Slope: {slopeShock >= 0 ? '+' : ''}{slopeShock.toFixed(2)}%</div>
              <div>Curvature 1: {curvature1Shock >= 0 ? '+' : ''}{curvature1Shock.toFixed(2)}%</div>
              <div>Curvature 2: {curvature2Shock >= 0 ? '+' : ''}{curvature2Shock.toFixed(2)}%</div>
              <div>Twist: {twistShock >= 0 ? '+' : ''}{twistShock.toFixed(2)}%</div>
            </div>

            {generating ? (
              <button
                className="btn btn-danger"
                onClick={handleCancel}
                style={{ width: '100%', marginTop: '10px' }}
              >
                CANCEL GENERATION
              </button>
            ) : (
              <button
                className="btn"
                onClick={handleGenerate}
                disabled={!selectedPortfolio}
                style={{ width: '100%', marginTop: '10px' }}
              >
                GENERATE {format.toUpperCase()}
              </button>
            )}
          </div>
        </div>

        {/* Status / result panel */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Generation Status</span>
          </div>

          {error && (
            <div className="alert-error" style={{ marginBottom: '15px' }}>
              {error}
            </div>
          )}

          {!report && !error && (
            <div className="font-mono text-secondary" style={{ fontSize: '11px', padding: '20px', textAlign: 'center' }}>
              Configure and click Generate to run report engine.
            </div>
          )}

          {report && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="font-mono" style={{ fontSize: '11px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>{' '}
                <span style={{
                  fontWeight: 600,
                   color: report.status === 'completed' ? 'var(--positive)' :
                          report.status === 'failed' ? 'var(--negative)' : 'var(--accent)',
                }}>
                  {report.status.toUpperCase()}
                </span>
              </div>

              {report.status === 'processing' && (
                <div>
                  <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Re-calculating fixed-income portfolio risk metrics and compiling document...
                  </div>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" />
                  </div>
                </div>
              )}

              {report.status === 'completed' && report.download_url && (
                <a
                  href={report.download_url}
                  className="btn font-mono"
                  style={{ fontSize: '11px', textAlign: 'center', textDecoration: 'none', display: 'block', marginTop: '10px' }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  DOWNLOAD {format.toUpperCase()}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
