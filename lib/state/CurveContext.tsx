'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface TenorItem {
  label: string;
  years: number;
}

export interface SecurityItem {
  id: string;
  isin: string;
  security_name: string;
  issue_date: string;
  maturity_date: string;
  coupon_rate: number;
  coupon_frequency: number;
  face_value: number;
  benchmark_tenor_classification: string | null;
  is_active: boolean;
}

import { NSSParameters } from '../pricing-engine/types';

export interface CurveResponse {
  curve_date: string;
  model_type: string;
  parameters: NSSParameters | null;
  spline_knots: unknown;
  diagnostics: {
    optimizer_converged: boolean;
    fit_residual_error: number;
    parameter_stability_delta: number | null;
    validation_status: string;
    validation_notes: string | null;
  };
}

interface CurveContextType {
  curve: CurveResponse | null;
  keyRateTenors: { effective_date: string; tenors: TenorItem[] } | null;
  securities: SecurityItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CurveContext = createContext<CurveContextType | null>(null);

export function CurveProvider({ children }: { children: React.ReactNode }) {
  const [curve, setCurve] = useState<CurveResponse | null>(null);
  const [keyRateTenors, setKeyRateTenors] = useState<{ effective_date: string; tenors: TenorItem[] } | null>(null);
  const [securities, setSecurities] = useState<SecurityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [curveRes, tenorsRes, secRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/curves/latest`).then(r => {
          if (!r.ok) throw new Error(`Curve fetch failed: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE_URL}/api/v1/key-rate-tenors`).then(r => {
          if (!r.ok) throw new Error(`Tenors fetch failed: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE_URL}/api/v1/securities`).then(r => {
          if (!r.ok) throw new Error(`Securities fetch failed: ${r.status}`);
          return r.json();
        })
      ]);

      setCurve(curveRes);
      setKeyRateTenors(tenorsRes);
      setSecurities(secRes);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred while loading curve details.');
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <CurveContext.Provider value={{ curve, keyRateTenors, securities, loading, error, refresh: fetchData }}>
      {children}
    </CurveContext.Provider>
  );
}

export function useCurve() {
  const context = useContext(CurveContext);
  if (!context) {
    throw new Error('useCurve must be used within a CurveProvider');
  }
  return context;
}
