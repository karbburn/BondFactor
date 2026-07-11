'use client';

import React, { createContext, useContext } from 'react';

const ResultsContext = createContext<unknown>(null);

export function ResultsProvider({ children }: { children: React.ReactNode }) {
  return (
    <ResultsContext.Provider value={{}}>
      {children}
    </ResultsContext.Provider>
  );
}

export function useResults() {
  return useContext(ResultsContext);
}
