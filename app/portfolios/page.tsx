'use client';

import React from 'react';
import Link from 'next/link';

export default function SavedPortfoliosStub() {
  return (
    <div className="container">
      <div className="panel" style={{ borderLeft: '3px solid var(--brand-color)', padding: '2rem', maxWidth: '600px', margin: '4rem auto' }}>
        <h2 className="font-mono text-brand" style={{ textTransform: 'uppercase', marginBottom: '15px' }}>
          &gt; Saved Portfolio Manager
        </h2>
        <p className="font-mono" style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
          This feature is under development. Once active, it will allow saving, naming, and grouping custom portfolios on the cloud with authenticated access.
        </p>
        <div style={{ marginTop: '25px' }}>
          <Link href="/" className="btn font-mono">
            &lt; Return to Workstation
          </Link>
        </div>
      </div>
    </div>
  );
}
