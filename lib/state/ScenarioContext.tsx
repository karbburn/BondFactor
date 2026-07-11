'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ScenarioValues {
  parallelShift: number;
  slopeShock: number;
  curvature1Shock: number;
  curvature2Shock: number;
  twistShock: number;
  twistPivot: number;
}

interface ScenarioContextType extends ScenarioValues {
  setParallelShift: (v: number) => void;
  setSlopeShock: (v: number) => void;
  setCurvature1Shock: (v: number) => void;
  setCurvature2Shock: (v: number) => void;
  setTwistShock: (v: number) => void;
  setTwistPivot: (v: number) => void;
  resetScenarios: () => void;
  loadScenario: (s: ScenarioValues) => void;
}

const ScenarioContext = createContext<ScenarioContextType | null>(null);

export function ScenarioProvider({ children }: { children: React.ReactNode }) {
  const [parallelShift, setParallelShift] = useState(0.0);
  const [slopeShock, setSlopeShock] = useState(0.0);
  const [curvature1Shock, setCurvature1Shock] = useState(0.0);
  const [curvature2Shock, setCurvature2Shock] = useState(0.0);
  const [twistShock, setTwistShock] = useState(0.0);
  const [twistPivot, setTwistPivot] = useState(5.0);

  const resetScenarios = useCallback(() => {
    setParallelShift(0.0);
    setSlopeShock(0.0);
    setCurvature1Shock(0.0);
    setCurvature2Shock(0.0);
    setTwistShock(0.0);
    setTwistPivot(5.0);
  }, []);

  const loadScenario = useCallback((s: ScenarioValues) => {
    setParallelShift(s.parallelShift);
    setSlopeShock(s.slopeShock);
    setCurvature1Shock(s.curvature1Shock);
    setCurvature2Shock(s.curvature2Shock);
    setTwistShock(s.twistShock);
    setTwistPivot(s.twistPivot);
  }, []);

  return (
    <ScenarioContext.Provider
      value={{
        parallelShift, slopeShock, curvature1Shock, curvature2Shock,
        twistShock, twistPivot,
        setParallelShift, setSlopeShock, setCurvature1Shock,
        setCurvature2Shock, setTwistShock, setTwistPivot,
        resetScenarios, loadScenario,
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
