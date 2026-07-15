import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import Link from "next/link";
import { JetBrains_Mono, Outfit } from "next/font/google";

import { CurveProvider } from "../lib/state/CurveContext";
import { PortfolioProvider } from "../lib/state/PortfolioContext";
import { ScenarioProvider } from "../lib/state/ScenarioContext";
import { ResultsProvider } from "../lib/state/ResultsContext";
import { AuthProvider } from "../lib/state/AuthContext";
import Navbar from "../lib/components/Navbar";
import ErrorBoundary from "../lib/components/ErrorBoundary";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BondFactor | Fixed Income Risk Engine",
  description: "Indian G-Sec yield curve deformation and risk analytics engine.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AuthProvider>
          <CurveProvider>
            <PortfolioProvider>
              <ScenarioProvider>
                <ResultsProvider>
                <ErrorBoundary>
                  <a href="#main-content" className="skip-link">Skip to content</a>
                  <div className="layout-wrapper">
                    <Navbar />
                    <main id="main-content" className="layout-main">
                      {children}
                    </main>
                    <footer className="layout-footer">
                      <div className="footer-content">
                        <span>BONDFACTOR Fixed Income Risk Engine</span>
                        <div className="footer-legal">
                          <Link href="/privacy">Privacy Policy</Link>
                          <span>|</span>
                          <Link href="/terms">Terms of Use</Link>
                        </div>
                        <span>Built by <a href="https://sourabh08.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sourabh</a></span>
                      </div>
                    </footer>
                  </div>
                </ErrorBoundary>
                </ResultsProvider>
              </ScenarioProvider>
            </PortfolioProvider>
          </CurveProvider>
        </AuthProvider>
      </body>
    </html>
  );
}


