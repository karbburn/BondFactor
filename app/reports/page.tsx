'use client';

import React, { useState, useEffect } from 'react';
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

  useEffect(() => { if (user) fetchSavedPortfolios(); }, [user, fetchSavedPortfolios]);

  useEffect(() => {
    if (activePortfolioId) setSelectedPortfolio(activePortfolioId);
  }, [activePortfolioId]);

  const handleGenerate = async () => {
    if (!selectedPortfolio) return;
    setGenerating(true);
    setError('');
    setReport(null);

    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/v1/reports/generate', {
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

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/v1/reports/${data.report_id}`, {
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
          setError('Lost connection during generation.');
        }
      }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start generation');
      setGenerating(false);
    }
  };

  if (!user) {
    return (
      <div className="container">
        <div className="panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="font-mono" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            Log in to generate reports.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="panel" style={{ padding: '12px 15px', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span className="font-mono text-brand" style={{ fontWeight: 600, fontSize: '13px' }}>
            RISK REPORT GENERATOR
          </span>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Server-side repricing — numbers match quant_core independently
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
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
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
              <div className="font-mono" style={{ marginBottom: '5px' }}>SCENARIO (from Scenario Composer):</div>
              <div>Parallel: {parallelShift >= 0 ? '+' : ''}{parallelShift.toFixed(2)}%</div>
              <div>Slope: {slopeShock >= 0 ? '+' : ''}{slopeShock.toFixed(2)}%</div>
              <div>Curvature 1: {curvature1Shock >= 0 ? '+' : ''}{curvature1Shock.toFixed(2)}%</div>
              <div>Curvature 2: {curvature2Shock >= 0 ? '+' : ''}{curvature2Shock.toFixed(2)}%</div>
              <div>Twist: {twistShock >= 0 ? '+' : ''}{twistShock.toFixed(2)}%</div>
            </div>

            <button
              className="btn"
              onClick={handleGenerate}
              disabled={!selectedPortfolio || generating}
              style={{ width: '100%', marginTop: '10px' }}
            >
              {generating ? 'GENERATING...' : `GENERATE ${format.toUpperCase()}`}
            </button>
          </div>
        </div>

        {/* Status / result panel */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Generation Status</span>
          </div>

          {error && (
            <div className="font-mono text-error" style={{ fontSize: '11px', marginBottom: '10px' }}>{error}</div>
          )}

          {!report && !error && (
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }}>
              Configure and click Generate to create a report.
            </div>
          )}

          {report && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="font-mono" style={{ fontSize: '11px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>{' '}
                <span style={{
                  fontWeight: 600,
                  color: report.status === 'completed' ? 'var(--color-success)' :
                         report.status === 'failed' ? 'var(--color-error)' : 'var(--brand-color)',
                }}>
                  {report.status.toUpperCase()}
                </span>
              </div>

              {report.status === 'processing' && (
                <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  Server is re-deriving portfolio metrics and rendering document...
                </div>
              )}

              {report.status === 'completed' && report.download_url && (
                <a
                  href={report.download_url}
                  className="btn font-mono"
                  style={{ fontSize: '11px', textAlign: 'center', textDecoration: 'none' }}
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
