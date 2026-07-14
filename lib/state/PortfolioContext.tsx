'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { SecurityItem, useCurve } from './CurveContext';
import { apiFetch } from '../supabase/api';

export interface PositionItem {
  security: SecurityItem;
  faceValue: number;
}

export interface SavedPortfolio {
  id: string;
  portfolio_name: string;
  position_count: number;
  created_at: string;
  updated_at: string;
}

interface PortfolioContextType {
  portfolio: PositionItem[];
  savedPortfolios: SavedPortfolio[];
  activePortfolioId: string | null;
  activePortfolioName: string;
  addPosition: (security: SecurityItem, faceValue: number) => void;
  removePosition: (isin: string) => void;
  updatePosition: (isin: string, faceValue: number) => void;
  setPortfolio: (positions: PositionItem[]) => void;
  renamePortfolio: (name: string) => void;
  savePortfolio: () => Promise<{ id: string }>;
  loadPortfolio: (portfolioId: string) => Promise<void>;
  fetchSavedPortfolios: () => Promise<void>;
  deleteSavedPortfolio: (portfolioId: string) => Promise<void>;
  clearActivePortfolio: () => void;
  compareIds: string[];
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
}

const PortfolioContext = createContext<PortfolioContextType | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolio, setPortfolioState] = useState<PositionItem[]>([]);
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [activePortfolioName, setActivePortfolioName] = useState<string>("Untitled Portfolio");
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    try { setCompareIds(JSON.parse(localStorage.getItem('compareIds') || '[]')); } catch {}
  }, []);
  const { securities } = useCurve();
  const securitiesRef = useRef(securities);
  useEffect(() => { securitiesRef.current = securities; }, [securities]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('compareIds', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => {
    setCompareIds([]);
    localStorage.removeItem('compareIds');
  }, []);

  const addPosition = useCallback((security: SecurityItem, faceValue: number) => {
    setPortfolioState(prev => {
      const idx = prev.findIndex(p => p.security.isin === security.isin);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], faceValue };
        return updated;
      }
      return [...prev, { security, faceValue }];
    });
  }, []);

  const removePosition = useCallback((isin: string) => {
    setPortfolioState(prev => prev.filter(p => p.security.isin !== isin));
  }, []);

  const updatePosition = useCallback((isin: string, faceValue: number) => {
    setPortfolioState(prev => prev.map(p => p.security.isin === isin ? { ...p, faceValue } : p));
  }, []);

  const setPortfolio = useCallback((positions: PositionItem[]) => {
    setPortfolioState(positions);
  }, []);

  const renamePortfolio = useCallback((name: string) => {
    setActivePortfolioName(name);
  }, []);

  const clearActivePortfolio = useCallback(() => {
    setActivePortfolioId(null);
    // Generate unique default name based on existing saved portfolios
    const existingNames = new Set(savedPortfolios.map(p => p.portfolio_name));
    const candidate = "Portfolio";
    let n = 1;
    while (existingNames.has(`${candidate} (${n})`)) n++;
    setActivePortfolioName(`${candidate} (${n})`);
    setPortfolioState([]);
  }, [savedPortfolios]);

  const fetchSavedPortfolios = useCallback(async () => {
    try {
      const data = await apiFetch("/api/v1/portfolios");
      setSavedPortfolios(data);
    } catch (e) { console.error('Failed to fetch portfolios:', e); }
  }, []);

  const savePortfolio = useCallback(async () => {
    const isUpdate = !!activePortfolioId;
    const url = isUpdate ? `/api/v1/portfolios/${activePortfolioId}` : "/api/v1/portfolios";
    const method = isUpdate ? "PUT" : "POST";

    const result = await apiFetch(url, {
      method,
      body: JSON.stringify({ portfolio_name: activePortfolioName }),
    });

    const portfolioId = result.id;

    // Atomic position replacement — PUT replaces all positions in one request
    await apiFetch(`/api/v1/portfolios/${portfolioId}/positions`, {
      method: "PUT",
      body: JSON.stringify({
        positions: portfolio.map(pos => ({
          security_id: pos.security.id,
          face_value_held: pos.faceValue,
        })),
      }),
    });

    setActivePortfolioId(portfolioId);
    await fetchSavedPortfolios();
    return { id: portfolioId };
  }, [activePortfolioId, activePortfolioName, portfolio, fetchSavedPortfolios]);

  const loadPortfolio = useCallback(async (portfolioId: string) => {
    const data = await apiFetch(`/api/v1/portfolios/${portfolioId}`);
    setActivePortfolioId(data.id);
    setActivePortfolioName(data.portfolio_name);

    // Use ref to always read latest securities, avoiding stale closure on initial load
    const currentSecurities = securitiesRef.current;
    const positions: PositionItem[] = [];
    let unresolved = 0;
    for (const pos of data.positions) {
      const sec = currentSecurities.find(s => s.id === pos.security_id || s.isin === pos.isin);
      if (sec) {
        positions.push({ security: sec, faceValue: pos.face_value_held });
      } else {
        unresolved++;
      }
    }
    if (unresolved > 0) {
      console.warn(`${unresolved} position(s) could not be matched to active securities`);
    }
    setPortfolioState(positions);
  }, []);

  const deleteSavedPortfolio = useCallback(async (portfolioId: string) => {
    await apiFetch(`/api/v1/portfolios/${portfolioId}`, { method: "DELETE" });
    if (activePortfolioId === portfolioId) clearActivePortfolio();
    await fetchSavedPortfolios();
  }, [activePortfolioId, clearActivePortfolio, fetchSavedPortfolios]);

  return (
    <PortfolioContext.Provider value={{
      portfolio, savedPortfolios, activePortfolioId, activePortfolioName,
      addPosition, removePosition, updatePosition, setPortfolio, renamePortfolio,
      savePortfolio, loadPortfolio, fetchSavedPortfolios, deleteSavedPortfolio, clearActivePortfolio,
      compareIds, toggleCompare, clearCompare,
    }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error('usePortfolio must be used within a PortfolioProvider');
  return context;
}
