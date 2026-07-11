'use client';

import React, { createContext, useContext } from 'react';

const ScenarioContext = createContext<unknown>(null);

export function ScenarioProvider({ children }: { children: React.ReactNode }) {
  return (
    <ScenarioContext.Provider value={{}}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  return useContext(ScenarioContext);
}
