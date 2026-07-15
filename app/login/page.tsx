'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/state/AuthContext';

export default function LoginPage() {
  const { user, signInWithGoogle, signOut, loading } = useAuth();

  const viewKey = useMemo(() => {
    if (loading) return 'loading';
    if (user) return 'authenticated';
    return 'google';
  }, [loading, user]);

  const handleLogoutClick = () => {
    if (confirm('Are you sure you want to log out of your session?')) {
      signOut();
    }
  };

  if (loading) {
    return (
      <div key={viewKey} className="container loading-container fade-in">
        <div>Loading...</div>
      </div>
    );
  }

  if (user) {
    return (
      <div key={viewKey} className="container fade-in">
        <div className="panel auth-panel auth-panel-success">
          <h2 className="font-mono text-brand auth-heading">
            Authenticated
          </h2>
          <div className="font-mono auth-info">
            <div>USER: <span className="text-primary">{user.email}</span></div>
            <div>STATUS: <span className="text-success">ACTIVE SESSION</span></div>
            <div>ID: <span className="auth-id">{user.id}</span></div>
          </div>
          <div className="auth-actions">
            <Link href="/" className="btn font-mono">{'<'} Return to Workstation</Link>
            <button className="btn btn-danger font-mono" onClick={handleLogoutClick}>LOGOUT</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key={viewKey} className="container fade-in">
      <div className="panel auth-panel auth-panel-brand">
        <h2 className="font-mono text-brand auth-heading">
          Sign In
        </h2>

        <div className="auth-social">
          <button
            className="btn google-btn font-mono"
            onClick={() => signInWithGoogle()}
          >
            Sign in with Google
          </button>
        </div>

        <div className="auth-back">
          <Link href="/" className="font-mono auth-back-link">
            Return to Workstation
          </Link>
        </div>
      </div>
    </div>
  );
}
