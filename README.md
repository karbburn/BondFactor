# BondFactor

**Fixed-income risk analytics for Indian Government Securities**

Fit the benchmark yield curve, deform it under economically meaningful scenarios, and see how a G-Sec portfolio responds — price, duration, DV01, convexity, Key Rate Duration, and scenario P&L.

[![Live](https://img.shields.io/badge/Live-bondfactor.vercel.app-blue)](https://bondfactor.vercel.app)
[![API](https://img.shields.io/badge/API-bondfactor--api.onrender.com-green)](https://bondfactor-api.onrender.com)
[![Python 3.12](https://img.shields.io/badge/Python-3.12+-yellow)](https://python.org)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)

---

## Overview

BondFactor is a full-stack fixed-income analytics platform built for Indian Government Securities (G-Secs). It combines a production-grade Python quant backend with a real-time TypeScript pricing engine to deliver institutional-quality risk analysis in the browser.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Yield Curve Fitting** | Nelson-Siegel-Svensson calibration to daily G-Sec par yields, cubic spline fallback on convergence failure |
| **Scenario Deformation** | Factor-shock scenarios (parallel, steepener, flattener, twist, butterfly) as parameterized NSS perturbations |
| **Portfolio Repricing** | Full risk stack recomputed client-side against the shocked curve — DV01-weighted P&L and tenor-bucketed KRD decomposition |
| **Risk Reporting** | Server-side PDF and Excel report generation with branded output |

All calculations use standard Indian G-Sec market conventions: semi-annual coupons, Actual/Actual day count, T+1 settlement.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 14 · Vercel)                                  │
│  ┌────────────────────┐  ┌────────────────────────────────────┐  │
│  │  Portfolio Builder  │  │  TypeScript Pricing Engine         │  │
│  │  Curve Explorer     │  │  Bootstrap · Price · Risk          │  │
│  │  Scenario Composer  │  │  Scenario · KRD                    │  │
│  └────────────────────┘  └────────────────────────────────────┘  │
└─────────────────────────────┬────────────────────────────────────┘
                              │ REST API
┌─────────────────────────────┴────────────────────────────────────┐
│  Backend (FastAPI · Python 3.12 · Render)                        │
│  ┌────────────┐  ┌───────────────┐  ┌────────────────────────┐  │
│  │  Ingestion  │  │  Calibration  │  │  Portfolio CRUD       │  │
│  │  NSE/FBIL   │  │  NSS + spline │  │  Auth + RLS           │  │
│  └────────────┘  └───────────────┘  └────────────────────────┘  │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────┴────────────────────────────────────┐
│  Persistence (Supabase · PostgreSQL)                             │
│  Observations · Calibrations · Zero curves · Securities          │
│  Portfolios · Positions · Users                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Design Decision:** The server ships fitted NSS parameters. The client always bootstraps its own zero curve — base and scenario-shocked — via a parity-tested TypeScript implementation. Scenario repricing is entirely client-side (~100ms for 50 positions) with no network round-trip.

---

## Quantitative Rigor

- **Python is the source of truth.** The TypeScript pricing engine is validated against it via automated parity tests (tolerances: yield 0.1bp, price ₹0.01 per ₹100 face).
- **Golden reference validation** against independently sourced benchmark security values (Layer 3 testing).
- **Calibration diagnostics** surfaced alongside the fitted curve — optimizer convergence, fit residual, parameter stability — so curve quality is never a black box.
- **Separation of concerns:** Scenario P&L (factor-based, curve-level) and KRD (tenor-local, bucket-level) are computed independently, not derived from each other.

Full methodology: [`METHODOLOGY.md`](METHODOLOGY.md)

---

## Tech Stack

| Layer | Technology | Deployment |
|-------|-----------|------------|
| Frontend | Next.js 14, React 18, TypeScript | Vercel |
| Pricing Engine | TypeScript (client-side) | In-browser |
| Backend API | FastAPI, Python 3.12 | Render |
| Quant Core | scipy, numpy | Server-side |
| Auth | Supabase Auth (JWT) | Supabase |
| Database | PostgreSQL | Supabase |

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Supabase project ([free tier](https://supabase.com/pricing) works)

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt

cp .env.example .env        # add your Supabase credentials
python -m pytest tests/ -v  # run tests
uvicorn main:app --reload   # start server
```

### Frontend Setup

```bash
npm install
cp .env.local.example .env.local   # add Supabase URL + anon key
npm run dev                         # http://localhost:3000
```

---

## API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/curves/latest` | Latest fitted curve (NSS params + diagnostics) |
| `GET` | `/api/v1/curves/{date}` | Curve for a specific date |
| `GET` | `/api/v1/key-rate-tenors` | Key rate tenor grid |
| `GET` | `/api/v1/securities` | G-Sec master list |

### Authenticated Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/portfolios` | List portfolios |
| `POST` | `/api/v1/portfolios` | Create portfolio |
| `GET` | `/api/v1/portfolios/{id}` | Get portfolio with positions |
| `PUT` | `/api/v1/portfolios/{id}` | Rename portfolio |
| `DELETE` | `/api/v1/portfolios/{id}` | Delete portfolio |
| `POST` | `/api/v1/portfolios/{id}/positions` | Add position |
| `DELETE` | `/api/v1/portfolios/{id}/positions/{pid}` | Remove position |
| `GET` | `/api/v1/scenarios/saved` | List saved scenarios |
| `POST` | `/api/v1/scenarios/saved` | Save scenario |
| `GET` | `/api/v1/scenarios/saved/{id}` | Get saved scenario |
| `DELETE` | `/api/v1/scenarios/saved/{id}` | Delete saved scenario |
| `POST` | `/api/v1/reports/generate` | Generate report (async) |
| `GET` | `/api/v1/reports/{id}` | Poll report status |
| `GET` | `/api/v1/reports/{id}/download` | Download report |

---

## Project Structure

```
BondFactor/
├── app/                          # Next.js App Router pages
│   ├── portfolio/                # Portfolio builder
│   ├── portfolios/               # Saved portfolio manager
│   ├── curve/                    # Curve explorer
│   ├── validate/                 # Pricing validation
│   ├── reports/                  # Report generation
│   ├── compare/                  # Multi-portfolio comparison
│   └── login/                    # Authentication
├── lib/
│   ├── pricing-engine/           # TypeScript pricing core (parity-tested)
│   ├── state/                    # React context providers
│   ├── supabase/                 # Supabase client
│   └── components/               # Shared UI components
├── backend/
│   ├── main.py                   # FastAPI application
│   ├── api/routers/              # Endpoint definitions
│   ├── api/schemas.py            # Pydantic models
│   ├── db/models.py              # SQLAlchemy models
│   ├── quant_core/               # Python quant reference implementation
│   │   ├── nss.py                # Nelson-Siegel-Svensson
│   │   ├── bootstrap.py          # Zero curve bootstrapping
│   │   ├── pricing.py            # Bond pricing
│   │   ├── risk.py               # Duration / DV01 / Convexity
│   │   ├── scenario.py           # Factor-shock scenarios
│   │   └── krd.py                # Key Rate Duration
│   ├── ingestion/                # Data fetch + validation
│   ├── services/                 # Report generation
│   └── tests/                    # pytest suite
```

---

## Testing

Three-layer testing strategy:

| Layer | Scope | Tolerance |
|-------|-------|-----------|
| **Unit** | All `quant_core` functions against synthetic known-truth curves | Exact / machine precision |
| **Parity** | Every TypeScript function validated against Python counterpart | Yield: 0.1bp, Price: ₹0.01 |
| **Golden Reference** | Benchmark security pricing vs. independently sourced market values | Market-accepted range |

```bash
# Backend (79 tests)
cd backend && python -m pytest tests/ -v

# Frontend type check
npx tsc --noEmit
```

---

## Data Sources

| Source | Type | Status | Notes |
|--------|------|--------|-------|
| **NSE ZCYC** | Zero-coupon yields | Automated | Programmatic fetch via NSE reports API. Cubic spline interpolation, no bootstrap. |
| **FBIL** | Par yields | Primary | Daily benchmark par yield curves. Manual CSV ingestion. NSS fit → bootstrap. |
| **Manual CSV** | Par yields | Guaranteed fallback | For when automated sources are unavailable |

Historical coverage: reliable FBIL par yield data starts from March 31, 2018 (when FBIL took over from FIMMDA).

---

## Design Principles

1. **Correctness before breadth.** Features ship only when modeled to accepted market standard. Otherwise they stay explicitly out of scope.
2. **No implied data that doesn't exist.** Historical coverage and model confidence are always stated accurately in the UI.
3. **One reference implementation.** Python is the source of truth. TypeScript is validated against it.
4. **Practitioner-legible output.** Every number uses conventions a rates desk would recognize.
5. **Append-only historical data.** Curves and calibrations are never overwritten — a new day is a new row.

---

## Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| **Phase 1** | ✅ Complete | Core analytics engine — ingestion, curve fitting, pricing, risk, scenarios, KRD, TypeScript parity, golden reference validation, full frontend |
| **Phase 2** | ✅ Complete | Platform features — auth, portfolio persistence, multi-portfolio management, historical replay, PDF/Excel reporting, saved scenarios |
| **Phase 3** | ✅ Complete | Advanced analytics — historical scenario calibration, risk attribution, performance optimization, expanded visualization |

---

## License

Proprietary. All rights reserved.

---

Built by [Sourabh](https://sourabh08.vercel.app/)
