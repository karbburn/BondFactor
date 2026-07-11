'use client';

import React, { createContext, useContext, useState } from 'react';

interface ScenarioContextType {
  parallelShift: number;
  slopeShock: number;
  curvature1Shock: number;
  curvature2Shock: number;
  twistShock: number;
  twistPivot: number;
  setParallelShift: (v: number) => void;
  setSlopeShock: (v: number) => void;
  setCurvature1Shock: (v: number) => void;
  setCurvature2Shock: (v: number) => void;
  setTwistShock: (v: number) => void;
  setTwistPivot: (v: number) => void;
  resetScenarios: () => void;
}

const ScenarioContext = createContext<ScenarioContextType | null>(null);

export function ScenarioProvider({ children }: { children: React.ReactNode }) {
  const [parallelShift, setParallelShift] = useState(0.0);
  const [slopeShock, setSlopeShock] = useState(0.0);
  const [curvature1Shock, setCurvature1Shock] = useState(0.0);
  const [curvature2Shock, setCurvature2Shock] = useState(0.0);
  const [twistShock, setTwistShock] = useState(0.0);
  const [twistPivot, setTwistPivot] = useState(5.0);

  const resetScenarios = () => {
    setParallelShift(0.0);
    setSlopeShock(0.0);
    setCurvature1Shock(0.0);
    setCurvature2Shock(0.0);
    setTwistShock(0.0);
    setTwistPivot(5.0);
  };

  return (
    <ScenarioContext.Provider
      value={{
        parallelShift,
        slopeShock,
        curvature1Shock,
        curvature2Shock,
        twistShock,
        twistPivot,
        setParallelShift,
        setSlopeShock,
        setCurvature1Shock,
        setCurvature2Shock,
        setTwistShock,
        setTwistPivot,
        resetScenarios
      }}
    >
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  const context = useContext(ScenarioContext);
  if (!context) {
    throw new Error('useScenario must be used within a ScenarioProvider');
  }
  return context;
}
