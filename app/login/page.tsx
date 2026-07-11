'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/state/AuthContext';

export default function LoginPage() {
  const { user, signIn, signUp, signOut, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="font-mono" style={{ color: 'var(--brand-color)' }}>&gt;&gt; LOADING AUTH STATE...</div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="container">
        <div className="panel" style={{ borderLeft: '3px solid var(--color-success)', padding: '2rem', maxWidth: '600px', margin: '4rem auto' }}>
          <h2 className="font-mono text-brand" style={{ textTransform: 'uppercase', marginBottom: '15px' }}>
            &gt; Authenticated
          </h2>
          <div className="font-mono" style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
            <div>USER: <span style={{ color: 'var(--text-primary)' }}>{user.email}</span></div>
            <div>STATUS: <span className="text-success">ACTIVE SESSION</span></div>
            <div>ID: <span style={{ fontSize: '11px' }}>{user.id}</span></div>
          </div>
          <div style={{ marginTop: '25px', display: 'flex', gap: '10px' }}>
            <Link href="/" className="btn font-mono">&lt; Return to Workstation</Link>
            <button className="btn btn-danger font-mono" onClick={() => { signOut(); }}>LOGOUT</button>
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
    <div className="container">
      <div className="panel" style={{ borderLeft: '3px solid var(--brand-color)', padding: '2rem', maxWidth: '500px', margin: '4rem auto' }}>
        <h2 className="font-mono text-brand" style={{ textTransform: 'uppercase', marginBottom: '20px' }}>
          &gt; {isSignUp ? 'Create Account' : 'Sign In'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Email
            </label>
            <input
              type="email"
              className="form-input"
              style={{ width: '100%' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Password
            </label>
            <input
              type="password"
              className="form-input"
              style={{ width: '100%' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <div className="font-mono text-error" style={{ fontSize: '12px', marginBottom: '15px', padding: '8px', border: '1px solid var(--color-error)', borderRadius: '2px', backgroundColor: 'rgba(255,59,48,0.1)' }}>
              {error}
            </div>
          )}

          {message && (
            <div className="font-mono text-success" style={{ fontSize: '12px', marginBottom: '15px', padding: '8px', border: '1px solid var(--color-success)', borderRadius: '2px', backgroundColor: 'rgba(52,199,89,0.1)' }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            className="btn font-mono"
            style={{ width: '100%', marginBottom: '15px' }}
            disabled={submitting}
          >
            {submitting ? '&gt;&gt; PROCESSING...' : isSignUp ? '&gt; Create Account' : '&gt; Sign In'}
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '15px', textAlign: 'center' }}>
          <button
            className="font-mono"
            style={{ background: 'none', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', fontSize: '12px' }}
            onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Link href="/" className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            &lt; Return to Workstation
          </Link>
        </div>
      </div>
    </div>
  );
}
