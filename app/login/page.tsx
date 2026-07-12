'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/state/AuthContext';

export default function LoginPage() {
  const { user, signIn, signUp, signInWithGoogle, signOut, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Force re-mount on state change so fade-in animation re-triggers
  const viewKey = useMemo(() => {
    if (loading) return 'loading';
    if (user) return 'authenticated';
    return isSignUp ? 'signup' : 'signin';
  }, [loading, user, isSignUp]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    if (result.error) {
      setError(result.error);
    } else if (result.message) {
      setMessage(result.message);
    } else {
      router.push('/');
    }
    setSubmitting(false);
  };

  return (
    <div key={viewKey} className="container fade-in">
      <div className="panel auth-panel auth-panel-brand">
        <h2 className="font-mono text-brand auth-heading">
          {isSignUp ? 'Create Account' : 'Sign In'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="font-mono form-label">
              Email
            </label>
            <input
              type="email"
              className="form-input form-input-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="font-mono form-label">
              Password
            </label>
            <input
              type="password"
              className="form-input form-input-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
            {isSignUp && (
              <span className="font-mono password-hint" style={{ color: password.length >= 6 ? 'var(--color-success)' : 'var(--text-secondary)' }}>
                {password.length >= 6 ? '✓ Password meets 6-character minimum' : '⚠ Minimum 6 characters required'}
              </span>
            )}
          </div>

          {error && (
            <div className="alert-error">
              {error}
            </div>
          )}

          {message && (
            <div className="alert-success">
              {message}
            </div>
          )}

          <button
            type="submit"
            className="btn font-mono form-submit"
            disabled={submitting}
          >
            {submitting ? 'PROCESSING...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <button
            className="font-mono auth-toggle"
            onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>

        <div className="auth-social">
          <div className="font-mono auth-or">OR</div>
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
