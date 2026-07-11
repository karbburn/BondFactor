'use client';

import React, { createContext, useContext } from 'react';

const PortfolioContext = createContext<unknown>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  return (
    <PortfolioContext.Provider value={{}}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  return useContext(PortfolioContext);
}
