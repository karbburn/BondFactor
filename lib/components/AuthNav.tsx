'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../state/AuthContext';

export default function AuthNav() {
  const { user, signOut, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          SYSTEM: INITIALIZING...
        </span>
      </div>
    );
  }

  if (user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <span
          className="font-mono"
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            maxWidth: '160px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          title={user.user_metadata?.name || user.email}
        >
          {user.user_metadata?.name || user.email}
        </span>
        <span
          className="font-mono text-success"
          style={{ fontSize: '12px', cursor: 'help' }}
          title="Backend connected"
        >
          ● LIVE DATA
        </span>
        <button
          className="font-mono"
          style={{
            fontSize: '11px',
            color: 'var(--color-error)',
            background: 'none',
            border: '1px solid var(--color-error)',
            padding: '2px 8px',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
          onClick={() => {
            if (confirm('Are you sure you want to log out of your session?')) {
              signOut();
            }
          }}
        >
          LOGOUT
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
      <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
        SYSTEM: ONLINE
      </span>
      <Link href="/login" className="font-mono" style={{
        fontSize: '11px',
        color: 'var(--brand-color)',
        border: '1px solid var(--brand-color)',
        padding: '2px 8px',
        borderRadius: '2px',
        textDecoration: 'none',
      }}>
        LOGIN
      </Link>
    </div>
  );
}
