'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { SecurityItem, useCurve } from './CurveContext';
import { getSupabase } from '../supabase/client';

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

async function apiFetch(path: string, options: RequestInit = {}) {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...((options.headers as Record<string, string>) || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolio, setPortfolioState] = useState<PositionItem[]>([]);
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [activePortfolioName, setActivePortfolioName] = useState<string>("Untitled Portfolio");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const { securities } = useCurve();

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const clearCompare = useCallback(() => { setCompareIds([]); }, []);

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
    setActivePortfolioName("Untitled Portfolio");
    setPortfolioState([]);
  }, []);

  const fetchSavedPortfolios = useCallback(async () => {
    try {
      const data = await apiFetch("/api/v1/portfolios");
      setSavedPortfolios(data);
    } catch { /* silent */ }
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

    // Delete existing positions on update, then re-add
    if (isUpdate && result.positions) {
      for (const pos of result.positions) {
        await apiFetch(`/api/v1/portfolios/${portfolioId}/positions/${pos.id}`, { method: "DELETE" });
      }
    }

    // Add current positions
    for (const pos of portfolio) {
      await apiFetch(`/api/v1/portfolios/${portfolioId}/positions`, {
        method: "POST",
        body: JSON.stringify({ security_id: pos.security.id, face_value_held: pos.faceValue }),
      });
    }

    setActivePortfolioId(portfolioId);
    await fetchSavedPortfolios();
    return { id: portfolioId };
  }, [activePortfolioId, activePortfolioName, portfolio, fetchSavedPortfolios]);

  const loadPortfolio = useCallback(async (portfolioId: string) => {
    const data = await apiFetch(`/api/v1/portfolios/${portfolioId}`);
    setActivePortfolioId(data.id);
    setActivePortfolioName(data.portfolio_name);

    const positions: PositionItem[] = [];
    for (const pos of data.positions) {
      const sec = securities.find(s => s.id === pos.security_id || s.isin === pos.isin);
      if (sec) positions.push({ security: sec, faceValue: pos.face_value_held });
    }
    setPortfolioState(positions);
  }, [securities]);

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
