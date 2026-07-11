'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { SecurityItem, useCurve } from './CurveContext';

export interface PositionItem {
  security: SecurityItem;
  faceValue: number;
}

interface PortfolioContextType {
  portfolio: PositionItem[];
  addPosition: (security: SecurityItem, faceValue: number) => void;
  removePosition: (isin: string) => void;
  updatePosition: (isin: string, faceValue: number) => void;
  setPortfolio: (positions: PositionItem[]) => void;
}

const PortfolioContext = createContext<PortfolioContextType | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolio, setPortfolioState] = useState<PositionItem[]>([]);
  const { securities } = useCurve();

  // Seed default portfolio once securities are loaded
  useEffect(() => {
    if (securities.length > 0 && portfolio.length === 0) {
      const gsSecs = securities.filter(s => s.is_active);
      if (gsSecs.length >= 2) {
        setPortfolioState([
          { security: gsSecs[0], faceValue: 10000000 }, // 10,000,000 face value
          { security: gsSecs[1], faceValue: 5000000 }   // 5,000,000 face value
        ]);
      } else if (gsSecs.length === 1) {
        setPortfolioState([
          { security: gsSecs[0], faceValue: 10000000 }
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [securities]);

  const addPosition = (security: SecurityItem, faceValue: number) => {
    setPortfolioState(prev => {
      const idx = prev.findIndex(p => p.security.isin === security.isin);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx].faceValue = faceValue;
        return updated;
      }
      return [...prev, { security, faceValue }];
    });
  };

  const removePosition = (isin: string) => {
    setPortfolioState(prev => prev.filter(p => p.security.isin !== isin));
  };

  const updatePosition = (isin: string, faceValue: number) => {
    setPortfolioState(prev => 
      prev.map(p => p.security.isin === isin ? { ...p, faceValue } : p)
    );
  };

  const setPortfolio = (positions: PositionItem[]) => {
    setPortfolioState(positions);
  };

  return (
    <PortfolioContext.Provider value={{ portfolio, addPosition, removePosition, updatePosition, setPortfolio }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
}
