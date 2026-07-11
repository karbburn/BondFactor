'use client';

import React from 'react';
import HistoricalCurveBrowser from '../../lib/components/HistoricalCurveBrowser';

export default function HistoryPage() {
  return (
    <div className="container">
      <div className="panel" style={{ padding: '12px 15px', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span className="font-mono text-brand" style={{ fontWeight: 600, fontSize: '13px' }}>
            HISTORICAL CURVE ARCHIVE
          </span>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Browse archived zero curves by date
          </span>
        </div>
      </div>
      <HistoricalCurveBrowser />
    </div>
  );
}
