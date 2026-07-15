'use client';

import React from 'react';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="panel" style={{ borderColor: 'var(--negative)' }}>
            <div className="font-mono text-error" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>
              Something went wrong
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
              {this.state.error.message}
            </div>
            <button className="btn font-mono" onClick={() => this.setState({ error: null })}>
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
