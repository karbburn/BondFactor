import type { Metadata, Viewport } from "next";
import "./globals.css";
import React from "react";
import Link from "next/link";
import { JetBrains_Mono, Outfit } from "next/font/google";

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/site";

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
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BondFactor | Fixed Income Risk Engine for Indian G-Secs",
    template: "%s | BondFactor",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "Finance",
  keywords: [
    "BondFactor",
    "Indian Government Securities",
    "G-Sec",
    "G-Sec yield curve",
    "Nelson-Siegel-Svensson",
    "NSS calibration",
    "bond risk analytics",
    "duration",
    "DV01",
    "convexity",
    "Key Rate Duration",
    "scenario analysis",
    "fixed income India",
    "FBIL par yields",
  ],
  authors: [{ name: "Sourabh", url: "https://www.sourabhpradhan.in/" }],
  creator: "Sourabh",
  publisher: "BondFactor",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "BondFactor | Fixed Income Risk Engine for Indian G-Secs",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "BondFactor | Fixed Income Risk Engine for Indian G-Secs",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0f13",
  width: "device-width",
  initialScale: 1,
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      founder: {
        "@type": "Person",
        name: "Sourabh",
        url: "https://www.sourabhpradhan.in/",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: SITE_DESCRIPTION,
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="canonical" href={SITE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
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
                        <span>Built by <a href="https://www.sourabhpradhan.in/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sourabh</a></span>
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


