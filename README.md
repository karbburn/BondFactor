# BondFactor

Professional-grade fixed-income analytics for Indian Government Securities. Fit the benchmark yield curve, deform it under economically meaningful scenarios, and see exactly how a G-Sec portfolio's value and risk profile responds — price, duration, DV01, convexity, Key Rate Duration, and scenario P&L.

## What It Does

BondFactor connects three things most tools treat separately:

1. **Yield curve fitting** — Nelson-Siegel-Svensson calibration to the daily G-Sec par yield curve, with cubic spline fallback on convergence failure.
2. **Scenario deformation** — Factor-shock scenarios (parallel shift, steepener, flattener, twist, butterfly) applied as parameterized NSS perturbations, not ad-hoc rate bumps.
3. **Portfolio repricing** — Full risk stack recomputed client-side against the shocked curve, with DV01-weighted P&L and tenor-bucketed KRD decomposition.

All calculations use standard Indian G-Sec market conventions: semi-annual coupons, Actual/Actual day count, T+1 settlement.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 14, Vercel)                             │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │  Portfolio Builder   │  │  TypeScript Pricing Engine   │  │
│  │  Curve Explorer      │  │  Bootstrap · Price · Risk    │  │
│  │  Scenario Composer   │  │  Scenario · KRD              │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────┴──────────────────────────────────┐
│  Backend (FastAPI, Render)                                  │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Ingestion  │  │  Calibration │  │  Portfolio CRUD    │  │
│  │  FBIL→CSV   │  │  NSS + spline│  │  Auth + RLS        │  │
│  └────────────┘  └──────────────┘  └────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  Persistence (Supabase / Postgres)                          │
│  Raw observations · Calibrations · Zero curves · Securities │
│  Portfolios · Positions · Users                             │
└─────────────────────────────────────────────────────────────┘
```

**Key design decision:** The server ships fitted NSS parameters. The client always bootstraps its own zero curve — base and scenario-shocked — via a parity-tested TypeScript implementation. This means scenario repricing is entirely client-side (target ~100ms for 50 positions) with no network round-trip.

## Quantitative Rigor

- **Python is the source of truth.** The TypeScript pricing engine is validated against it via automated parity tests (tolerances: yield 0.1bp, price ₹0.01 per ₹100 face).
- **Golden reference validation** against independently sourced benchmark security values (Layer 3 testing).
- **Calibration diagnostics** surfaced alongside the fitted curve — optimizer convergence, fit residual, parameter stability — so curve quality is never a black box.
- **Separation of concerns:** Scenario P&L (factor-based, curve-level) and KRD (tenor-local, bucket-level) are computed independently, not derived from each other.

Full methodology documentation: `assets/02_Quant_Methodology_BondFactor.md`

## Tech Stack

| Layer | Technology | Deployment |
|-------|-----------|------------|
| Frontend | Next.js 14, React 18, TypeScript | Vercel |
| Pricing Engine | TypeScript (client-side) | In-browser |
| Backend API | FastAPI, Python 3.12 | Render |
| Quant Core | scipy, numpy | Server-side |
| Auth | Supabase Auth (JWT) | Supabase |
| Database | PostgreSQL | Supabase |
| CI/CD | GitHub Actions | Nightly cron + PR checks |

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Supabase project (free tier works)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt

# Configure environment
cp .env.example .env        # add your Supabase credentials

# Run tests
python -m pytest tests/ -v

# Start server
uvicorn main:app --reload
```

### Frontend

```bash
npm install

# Configure environment
cp .env.local.example .env.local   # add Supabase URL + publishable key

# Development
npm run dev

# Production build
npm run build
```

Open [http://localhost:3000](http://localhost:3000).

## API Endpoints

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/curves/latest` | Latest fitted curve (NSS params + diagnostics) |
| `GET` | `/api/v1/curves/{date}` | Curve for a specific date |
| `GET` | `/api/v1/key-rate-tenors` | Key rate tenor grid |
| `GET` | `/api/v1/securities` | G-Sec master list |

### Authenticated (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/portfolios` | List user's portfolios |
| `POST` | `/api/v1/portfolios` | Create portfolio |
| `GET` | `/api/v1/portfolios/{id}` | Get portfolio with positions |
| `PUT` | `/api/v1/portfolios/{id}` | Rename portfolio |
| `DELETE` | `/api/v1/portfolios/{id}` | Delete portfolio + positions |
| `POST` | `/api/v1/portfolios/{id}/positions` | Add position |
| `DELETE` | `/api/v1/portfolios/{id}/positions/{pid}` | Remove position |

## Project Structure

```
BondFactor/
├── app/                          # Next.js pages
│   ├── portfolio/                # Portfolio builder
│   ├── portfolios/               # Saved portfolio manager
│   ├── curve/                    # Curve explorer
│   ├── validate/                 # Pricing validation
│   ├── history/                  # Historical replay (Phase 2)
│   ├── reports/                  # Report generation (Phase 2)
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
│   ├── api/dependencies.py       # Auth middleware
│   ├── db/models.py              # SQLAlchemy models
│   ├── db/session.py             # Database connection
│   ├── quant_core/               # Python quant reference
│   │   ├── conventions.py        # Market conventions
│   │   ├── cashflow.py           # Cashflow generation
│   │   ├── nss.py                # Nelson-Siegel-Svensson
│   │   ├── spline.py             # Cubic spline fitting
│   │   ├── bootstrap.py          # Zero curve bootstrapping
│   │   ├── pricing.py            # Bond pricing
│   │   ├── risk.py               # Duration/DV01/convexity
│   │   ├── scenario.py           # Factor-shock scenarios
│   │   └── krd.py                # Key Rate Duration
│   ├── ingestion/                # Data fetch + validation
│   └── tests/                    # 60 tests (pytest)
└── assets/                       # Design docs (gitignored)
```

## Testing

Three-layer testing strategy:

- **Layer 1 — Unit tests:** All `quant_core` functions tested against synthetic known-truth curves and hand-calculable cases.
- **Layer 2 — Parity tests:** Every TypeScript pricing function validated against its Python counterpart (yield: 0.1bp, price: ₹0.01).
- **Layer 3 — Golden reference:** Benchmark security pricing verified against independently sourced market values.

```bash
# Backend (60 tests)
cd backend && python -m pytest tests/ -v

# Frontend type check
npx tsc --noEmit
```

## Data Sources

BondFactor uses publicly available G-Sec data:

- **FBIL** — Primary source for daily par yield curves (G-Sec Par Yield, ZCYC). No public API; manual CSV ingestion path implemented.
- **RBI DBIE** — Fallback source via Database on Indian Economy.
- **Manual CSV** — Guaranteed fallback when automated sources are unavailable.

Historical data availability: reliable FBIL par yield data starts from March 31, 2018 (when FBIL took over from FIMMDA). Coverage builds up from the platform's launch date forward.

## Design Principles

1. **Correctness before breadth.** Features ship only when modeled to accepted market standard. Otherwise they stay explicitly out of scope.
2. **No implied data that doesn't exist.** Historical coverage and model confidence are always stated accurately in the UI.
3. **One reference implementation.** Python is the source of truth. TypeScript is validated against it.
4. **Practitioner-legible output.** Every number uses conventions a rates desk would recognize.
5. **Append-only historical data.** Curves and calibrations are never overwritten — a new day is a new row.

## Roadmap

- **Phase 1 (Complete):** Core analytics engine — ingestion, curve fitting, pricing, risk, scenarios, KRD, TypeScript parity, golden reference validation, full frontend.
- **Phase 2 (In Progress):** Platform features — authentication, portfolio persistence, multi-portfolio management, historical replay, PDF/Excel reporting.
- **Phase 3 (Indicative):** Advanced analytics — historical scenario calibration, risk attribution, performance optimization, expanded visualization.

## License

Internal project. Not licensed for external use.
