'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../state/AuthContext';

export default function AuthNav() {
  const { user, signOut, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
        <span className="font-mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          SYSTEM: ONLINE
        </span>
      </div>
    );
  }

  if (user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
        <span className="font-mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          {user.email}
        </span>
        <span className="font-mono text-success" style={{ fontSize: "12px" }}>
          ● LIVE DATA
        </span>
        <button
          className="font-mono"
          style={{
            fontSize: "11px",
            color: "var(--color-error)",
            background: "none",
            border: "1px solid var(--color-error)",
            padding: "2px 8px",
            borderRadius: "2px",
            cursor: "pointer",
          }}
          onClick={() => signOut()}
        >
          LOGOUT
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
      <span className="font-mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
        SYSTEM: ONLINE
      </span>
      <Link href="/login" className="font-mono" style={{
        fontSize: "11px",
        color: "var(--brand-color)",
        border: "1px solid var(--brand-color)",
        padding: "2px 8px",
        borderRadius: "2px",
        textDecoration: "none",
      }}>
        LOGIN
      </Link>
    </div>
  );
}
