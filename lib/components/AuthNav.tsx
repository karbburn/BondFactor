'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../state/AuthContext';

export default function AuthNav() {
  const { user, signOut, loading } = useAuth();

  if (loading) {
    return <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }} />;
  }

  if (user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          className="font-mono"
          style={{
            fontSize: '11px',
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
        <button
          className="btn btn-secondary"
          style={{ fontSize: '11px' }}
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
    <Link href="/login" className="btn btn-secondary" style={{ fontSize: '11px', textDecoration: 'none' }}>
      LOGIN
    </Link>
  );
}
