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
  title: "BondFactor // Fixed Income Workstation",
  description: "Bloomberg-inspired Indian G-Sec curve deformation and risk analytics engine.",
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
                  <a href="#main-content" className="skip-link">Skip to content</a>
                  <div className="layout-wrapper">
                    <Navbar />
                    <main id="main-content" className="layout-main">
                      {children}
                    </main>
                    <footer className="layout-footer">
                      <div className="font-mono footer-content">
                        BONDFACTOR RISK ENGINE // PORTFOLIO ANALYTICS PLATFORM
                        <span className="footer-details">
                          v1.0.0 (Build: 2026-07-12) | Powered by FastAPI + Supabase
                        </span>
                        <div className="footer-legal">
                          <Link href="/privacy" className="footer-legal-link">Privacy Policy</Link>
                          <span className="footer-legal-sep">|</span>
                          <Link href="/terms" className="footer-legal-link">Terms of Use</Link>
                        </div>
                      </div>
                    </footer>
                  </div>
                </ResultsProvider>
              </ScenarioProvider>
            </PortfolioProvider>
          </CurveProvider>
        </AuthProvider>
      </body>
    </html>
  );
}


