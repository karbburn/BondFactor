'use client';

import React, { createContext, useContext } from 'react';

const CurveContext = createContext<unknown>(null);

export function CurveProvider({ children }: { children: React.ReactNode }) {
  return (
    <CurveContext.Provider value={{}}>
      {children}
    </CurveContext.Provider>
  );
}

export function useCurve() {
  return useContext(CurveContext);
}
