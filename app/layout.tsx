import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import Link from "next/link";

import { CurveProvider } from "../lib/state/CurveContext";
import { PortfolioProvider } from "../lib/state/PortfolioContext";
import { ScenarioProvider } from "../lib/state/ScenarioContext";
import { ResultsProvider } from "../lib/state/ResultsContext";

export const metadata: Metadata = {
  title: "BondFactor // Fixed Income Workstation",
  description: "Bloomberg-inspired Indian G-Sec curve deformation and risk analytics engine.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <CurveProvider>
          <PortfolioProvider>
            <ScenarioProvider>
              <ResultsProvider>
                <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
                  <header className="navbar">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="font-mono text-brand" style={{ fontWeight: 700, fontSize: "16px", letterSpacing: "0.1em" }}>
                        BONDFACTOR // TERMINAL
                      </span>
                      <span style={{ fontSize: "10px", backgroundColor: "#262636", padding: "2px 6px", borderRadius: "2px", color: "#8E8E93" }}>
                        v1.0.0
                      </span>
                    </div>
                    <nav className="nav-links">
                      <Link href="/" className="nav-link">
                        Dashboard
                      </Link>
                      <Link href="/portfolio" className="nav-link">
                        Portfolio Builder
                      </Link>
                      <Link href="/curve" className="nav-link">
                        Curve Explorer
                      </Link>
                      <Link href="/validate" className="nav-link">
                        Pricing Validation
                      </Link>
                      <Link href="/history" className="nav-link text-secondary">
                        [Historical Replay]
                      </Link>
                      <Link href="/reports" className="nav-link text-secondary">
                        [Reports]
                      </Link>
                    </nav>
                    <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                      <span className="font-mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        SYSTEM: ONLINE
                      </span>
                      <span className="font-mono text-success" style={{ fontSize: "12px" }}>
                        ● LIVE DATA
                      </span>
                    </div>
                  </header>
                  <main style={{ flex: 1 }}>
                    {children}
                  </main>
                  <footer style={{ backgroundColor: "var(--bg-secondary)", borderTop: "1px solid var(--border-color)", padding: "10px 1.5rem", textAlign: "center", fontSize: "11px", color: "var(--text-secondary)" }}>
                    <div className="font-mono">
                      BONDFACTOR RISK ENGINE // PORTFOLIO ANALYTICS PLATFORM // FREE-TIER RUNTIME
                    </div>
                  </footer>
                </div>
              </ResultsProvider>
            </ScenarioProvider>
          </PortfolioProvider>
        </CurveProvider>
      </body>
    </html>
  );
}
