'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePortfolio } from '../../lib/state/PortfolioContext';
import { useAuth } from '../../lib/state/AuthContext';

export default function SavedPortfoliosPage() {
  const { user } = useAuth();
  const { savedPortfolios, fetchSavedPortfolios, loadPortfolio, deleteSavedPortfolio } = usePortfolio();

  useEffect(() => { if (user) fetchSavedPortfolios(); }, [user, fetchSavedPortfolios]);

  if (!user) {
    return (
      <div className="container">
        <div className="panel" style={{ padding: '2rem', maxWidth: '600px', margin: '4rem auto' }}>
          <h2 className="font-mono text-brand" style={{ marginBottom: '15px' }}>Saved Portfolios</h2>
          <p className="font-mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Log in to view your saved portfolios.</p>
          <div style={{ marginTop: '25px' }}><Link href="/login" className="btn font-mono">Log In</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="panel" style={{ maxWidth: '700px', margin: '2rem auto' }}>
        <div className="panel-header">
          <span className="panel-title">Saved Portfolios</span>
          <Link href="/portfolio" className="btn font-mono" style={{ fontSize: '11px' }}>+ NEW</Link>
        </div>
        {savedPortfolios.length === 0 ? (
          <div className="font-mono text-secondary" style={{ padding: '20px 0', textAlign: 'center' }}>
            [ No saved portfolios yet. Create one in the Portfolio Builder. ]
          </div>
        ) : (
          <table className="dense-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Positions</th>
                <th>Updated</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {savedPortfolios.map(sp => (
                <tr key={sp.id}>
                  <td>{sp.portfolio_name}</td>
                  <td className="num">{sp.position_count}</td>
                  <td className="font-mono" style={{ fontSize: '11px' }}>{new Date(sp.updated_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn font-mono" style={{ fontSize: '10px', padding: '2px 8px', marginRight: '6px' }}
                      onClick={() => { loadPortfolio(sp.id); window.location.href = '/portfolio'; }}>
                      LOAD
                    </button>
                    <button className="btn btn-danger font-mono" style={{ fontSize: '10px', padding: '2px 8px' }}
                      onClick={() => deleteSavedPortfolio(sp.id)}>
                      DELETE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
