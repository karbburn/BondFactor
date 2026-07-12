'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthNav from './AuthNav';

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/portfolio', label: 'Portfolio Builder' },
    { href: '/compare', label: 'Compare' },
    { href: '/curve', label: 'Curve Explorer' },
    { href: '/validate', label: 'Pricing Validation' },
    { href: '/history', label: '[Historical Replay]', secondary: true },
    { href: '/reports', label: '[Reports]', secondary: true },
  ];

  return (
    <header className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span className="font-mono text-brand" style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.1em' }}>
          BONDFACTOR // TERMINAL
        </span>
        <span style={{ fontSize: '10px', backgroundColor: '#262636', padding: '2px 6px', borderRadius: '2px', color: '#8E8E93' }}>
          v1.0.0
        </span>
      </div>
      <nav className="nav-links">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link ${isActive ? 'active' : ''} ${link.secondary ? 'text-secondary' : ''}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <AuthNav />
    </header>
  );
}
