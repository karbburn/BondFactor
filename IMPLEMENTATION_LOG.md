# BondFactor - Implementation Log

This log is the running record of implementation progress, configurations, decisions, and handoffs between development stages.

---

## [2026-07-11] Stage 0: Repository & Infrastructure Bootstrap

### 1. What was built
- **Backend Folder Structure & Skeleton**:
  - Created `/backend` directory.
  - Initialized `/backend/quant_core` containing framework-independent Python modules: `conventions.py`, `cashflow.py`, `nss.py`, `spline.py`, `calibration_validation.py`, `bootstrap.py`, `pricing.py`, `risk.py`, `scenario.py`, and `krd.py` as empty python files.
  - Initialized `/backend/ingestion` containing `fbil_client.py`, `dbie_client.py`, `manual_csv_loader.py`, and `validators.py` as empty python files.
  - Initialized `/backend/api` containing `routers/` (`curves.py`, `securities.py`, `portfolios.py`, `reports.py`, `internal.py`), `dependencies.py`, and `schemas.py` as empty/placeholder files.
  - Initialized `/backend/db` containing `models.py` and `session.py`.
  - Initialized `/backend/jobs` containing `nightly_ingestion_job.py`.
  - Created `/backend/main.py` as a valid FastAPI application registration entry point importing all routers.
  - Created `/backend/.env.example` listing all backend environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `FBIL_ENDPOINT_URL`, `DBIE_ENDPOINT_URL`, `INTERNAL_SERVICE_KEY`).
- **Frontend Folder Structure & Skeleton**:
  - Initialized a Next.js 14 project using TypeScript and App Router at the repository root `/` (with eslint and typescript, no Tailwind CSS).
  - Created `/app` page routes: `/page.tsx` (landing), `/portfolio` (builder), `/curve` (explorer), `/validate` (pricing validation), `/history` (replay), `/reports` (generation), `/portfolios` (saved portfolios list), and `/login` (auth).
  - Created `/lib/pricing-engine` containing TypeScript modules: `conventions.ts`, `cashflow.ts`, `bootstrap.ts`, `pricing.ts`, `risk.ts`, `scenario.ts`, `krd.ts`, and `types.ts`.
  - Created `/lib/state` containing React Context providers: `CurveContext.tsx`, `PortfolioContext.tsx`, `ScenarioContext.tsx`, and `ResultsContext.tsx` using `unknown` in `createContext` to prevent strict TypeScript/ESLint warnings about explicit `any`.
  - Created `.env.example` at the repository root listing all frontend environment variables (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **Infrastructure Scaffolding**:
  - Created `SUPABASE_SETUP.md` outlining project creation, keys, database migrations, RLS setup, Auth, and Storage.
  - Created `.github/workflows/nightly-ingestion.yml` containing a workflow triggered on a daily cron schedule (14:00 UTC / 7:30 PM IST) and on manual dispatch, calling the internal trigger API with authentication.

### 2. Assumptions or Deviations from the Docs
- Initialized Next.js at the repository root `/` instead of a `/frontend` subdirectory, which aligns with the Frontend Specification's use of `/app` and `/lib` at the root and is standard for Next.js monorepos when Vercel compiles from the root.
- Used `createContext<unknown>` in Context files instead of `createContext<any>` to prevent ESLint strict type compilation errors, resolving build failures on `npm run build`.

### 3. Tests & Verification Status
- **Backend Verification**: Ran `uvicorn main:app --app-dir backend --port 8080` in the background and verified that it successfully starts, outputs `"Application startup complete"`, and runs without errors.
- **Frontend Verification**: Ran `npm run build` at the root and verified that the Next.js app builds, compiles, and type-checks successfully with no errors.

### 4. Next Stage (Stage 1) Info
- **Goal**: Research and validate the actual live endpoints/formats for FBIL par yield curves and RBI DBIE historical yield data.
- **Deliverables**: A findings report (`SOURCES_FINDINGS.md`) at the repository root and sample raw response data files (if stable formats are verified).

## [2026-07-11] Stage 1: Data Source Validation

### 1. What was built / researched
- Conducted research into FBIL and RBI DBIE daily G-Sec yield curve publishing structures.
- Documented findings in [SOURCES_FINDINGS.md](file:///c:/Users/soura/Downloads/BondFactor/SOURCES_FINDINGS.md) at the repository root.
- Created mock test fixtures:
  - [sample_fbil_yields.csv](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/fixtures/sample_fbil_yields.csv)
  - [sample_dbie_yields.csv](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/fixtures/sample_dbie_yields.csv)
  representing typical daily G-Sec par yield benchmark structures (91D, 182D, 364D, 2Y, 5Y, 10Y, 15Y, 30Y, 40Y tenors).

### 2. Assumptions or Deviations from the Docs
- Confirmed that FBIL's portal is a JavaScript-rendered Angular SPA protected by Google reCAPTCHA, and RBI DBIE uses dynamic session-based queries. Thus, direct, unauthenticated HTTP scraping is not programmatically stable.
- Stated that the `manual_csv` loader path is the primary robust ingestion method for daily operations, while API/mock integrations will serve as fallback/development targets.

### 3. Tests & Verification Status
- Verified research findings against live portal HTTP headers and compiled reports.
- Verified that `SOURCES_FINDINGS.md` and test fixtures are fully documented and exist in the workspace.

### 4. Next Stage (Stage 2) Info
- **Goal**: Implement the ingestion pipeline modules (`fbil_client.py`, `dbie_client.py`, `manual_csv_loader.py`, `validators.py`, and orchestration `run_ingestion()`).
- **Deliverables**: Working ingestion pipeline persisting raw observations, with automated fallback tests using the mocked csv fixtures created in Stage 1.

## [2026-07-11] Stage 2: Ingestion Pipeline

### 1. What was built
- **Database Models & Session Management**:
  - Implemented the `RawParYieldObservation` model in [backend/db/models.py](file:///c:/Users/soura/Downloads/BondFactor/backend/db/models.py).
  - Setup the database connection engine and SessionLocal injection in [backend/db/session.py](file:///c:/Users/soura/Downloads/BondFactor/backend/db/session.py), defaulting to a local `sqlite:///bondfactor.db` file-based database for development when `DATABASE_URL` is unset.
  - Configured automatic table creation at startup in [backend/main.py](file:///c:/Users/soura/Downloads/BondFactor/backend/main.py).
- **Ingestion Clients**:
  - Implemented the FBIL client in [backend/ingestion/fbil_client.py](file:///c:/Users/soura/Downloads/BondFactor/backend/ingestion/fbil_client.py) and DBIE client in [backend/ingestion/dbie_client.py](file:///c:/Users/soura/Downloads/BondFactor/backend/ingestion/dbie_client.py), returning FetchFailure by default (as validated in Stage 1) unless mocked.
  - Implemented the manual loader in [backend/ingestion/manual_csv_loader.py](file:///c:/Users/soura/Downloads/BondFactor/backend/ingestion/manual_csv_loader.py) which reads from CSV files matching `manual_yields_YYYY-MM-DD.csv` in `backend/data/`.
- **Data Validation & Orchestration**:
  - Implemented completeness and sanity checks (yield range: 0% to 25%, tenor positive) in [backend/ingestion/validators.py](file:///c:/Users/soura/Downloads/BondFactor/backend/ingestion/validators.py).
  - Implemented the priority sequence (FBIL -> DBIE -> Manual CSV -> Alert/Error) in [backend/jobs/nightly_ingestion_job.py](file:///c:/Users/soura/Downloads/BondFactor/backend/jobs/nightly_ingestion_job.py).
- **Internal API Router**:
  - Implemented `POST /internal/ingestion/trigger` in [backend/api/routers/internal.py](file:///c:/Users/soura/Downloads/BondFactor/backend/api/routers/internal.py), protected by a Bearer authorization token checking `INTERNAL_SERVICE_KEY`.

### 2. Assumptions or Deviations from the Docs
- Added `DATABASE_URL` as a proposed environment variable to support SQLAlchemy database connection engine.
- Configured default local sqlite connection to file-based `bondfactor.db` rather than in-memory `:memory:` to resolve multithreading/connection table-isolation issues when calling endpoints in FastAPI.
- Made `tenor_label`, `tenor_years`, and `par_yield` columns in `raw_par_yield_observations` table nullable, allowing failed ingestion attempts (which contain error payloads instead of par yields) to be saved in the database for compliance and auditing.
- Avoided deprecated `datetime.utcnow()` and replaced with timezone-aware `datetime.now(timezone.utc)` standard.

### 3. Tests & Verification Status
- Written 5 integration tests in [backend/tests/test_ingestion.py](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/test_ingestion.py).
- Ran `pytest tests/test_ingestion.py` in the `backend/` directory, confirming **5 passed, 0 failed** in 0.90s.
- Successfully verified API endpoint invocation: called `POST /internal/ingestion/trigger` using PowerShell's `Invoke-RestMethod` and confirmed it successfully resolved manual fallback, validated entries, inserted rows, and returned HTTP 200.

### 4. Next Stage (Stage 3) Info
- **Goal**: Implement `quant_core` foundation modules (`conventions.py` and `cashflow.py`) in `/backend/quant_core` and write Layer 1 unit tests.
- **Deliverables**: Working G-Sec day-count (Actual/Actual), settlement (T+1), coupon-frequency configurations, cashflow schedule generation, and passing tests verified against hand-calculated cases.

## [2026-07-11] Stage 3: quant_core Foundation

### 1. What was built
- **Centralized Conventions**:
  - Implemented [conventions.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/conventions.py) containing semi-annual coupon frequency (`2`), day-count (`ACT/ACT` ICMA), and T+1 settlement weekday-aware logic (excluding weekends).
  - Implemented Actual/Actual (ICMA) accrued interest calculations based on the calendar days since the preceding coupon date divided by the actual days in the coupon period.
- **Cashflow Schedule Generation**:
  - Implemented [cashflow.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/cashflow.py) that generates unadjusted coupon schedules backwards from maturity to avoid date slippage.
  - Implemented odd first coupon period checks that prorate the first coupon amount by the actual days since the issue date relative to the full coupon period.

### 2. Assumptions or Deviations from the Docs
- Handled T+1 settlement as next business day weekday-aware (excluding weekends) in the absence of an external holiday calendar, placing a ponytail comment detailing this ceiling and its upgrade path.
- Verified that day-count and accrued interest calculations exactly match the Actual/Actual (ICMA) specification, overriding 30/360 or other regional conventions in accordance with `02_Quant_Methodology_BondFactor.md` §7.2.

### 3. Tests & Verification Status
- Written 6 unit tests in [backend/tests/test_quant_core.py](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/test_quant_core.py) validating conventions, settlement, cashflows, and accrued interest.
- Verified accrued interest calculations against 3 hand-computed cases (standard, leap year, and short first coupon proration), showing the mathematical work in the test descriptions and asserting exact numerical matches.
- Ran `pytest` in `backend/` and confirmed **6 passed, 0 failed** for the core math suite. Total suite: **11 passed, 0 failed**.

### 4. Next Stage (Stage 4) Info
- **Goal**: Implement curve fitting modules (`nss.py`, `spline.py`, `calibration_validation.py`, and `bootstrap.py`) in `/backend/quant_core` and write Layer 1 unit tests.
- **Deliverables**: Nelson-Siegel-Svensson and cubic spline calibration, validation check (passed / failed fallback) reporting, par-to-zero bootstrapping, and passing tests.

## [2026-07-11] Stage 4: Curve Fitting

### 1. What was built
- **Nelson-Siegel-Svensson Fitting**:
  - Implemented [nss.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/nss.py) containing the 6-parameter Nelson-Siegel-Svensson model evaluation (with safe division-by-zero boundary at $t=0$) and nonlinear least squares optimization using `scipy.optimize.minimize` (L-BFGS-B).
- **Cubic Spline Fitting**:
  - Implemented [spline.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/spline.py) wrapping Scipy's `CubicSpline` to provide natural cubic spline interpolation and extrapolation as the primary fallback model.
- **Bootstrapping Engine**:
  - Implemented [bootstrap.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/bootstrap.py) which takes a continuous par curve function (avoiding ad-hoc sparse point interpolation as per Approach 2) and recursively solves for the discount factors and continuously compounded zero-coupon yields.
  - Returns a `ZeroCurve` object providing linear zero rate interpolation and flat boundary extrapolation.
- **Calibration Validation Orchestrator**:
  - Implemented [calibration_validation.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/calibration_validation.py) which evaluates convergence, parameter limits, goodness-of-fit (RMSE < 15 bps), day-over-day stability (jump < 5.0), and smoothness (oscillations and bounds).
  - Automatically falls back to Natural Cubic Spline on NSS validation failure, returning a structured `CalibrationValidationResult` object containing the active curve function and reasons for fallback.

### 2. Assumptions or Deviations from the Docs
- Structured `CalibrationValidationResult` to contain a list of `reasons` and the active `curve_fn` callable, allowing downstream routines to evaluate the curve transparently regardless of the model selected (NSS or Spline).
- Validated that the bootstrapping routine assumes a continuous par curve function input, maintaining strict consistency with Quant Methodology §3.2.

### 3. Tests & Verification Status
- Added 5 unit tests in [backend/tests/test_quant_core.py](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/test_quant_core.py):
  1. `test_nss_evaluation`: Verifies NSS mathematical evaluation and $t=0$ limit.
  2. `test_nss_parameter_recovery`: Confirms L-BFGS-B recovers NSS parameters from synthetic inputs.
  3. `test_cubic_spline_fit`: Asserts that the cubic spline passes exactly through input points.
  4. `test_bootstrap_reprices_par`: Bootstraps zero curve from a par curve, prices par bonds, and asserts they cost exactly 100.0 (par yields reproduced to a tight tolerance $< 10^{-11}$).
  5. `test_calibration_validation_and_fallback`: Asserts that clean inputs pass NSS, while a spiked input fails validation and falls back to Cubic Spline.
- Confirmed all backend unit tests pass: **16 passed, 0 failed** in 3.46s.

### 4. Next Stage (Stage 5) Info
- **Goal**: Implement `pricing.py` and `risk.py` in `/backend/quant_core` and write Layer 1 unit tests.
- **Deliverables**: Pricing equations (clean price, dirty price, YTM) and analytical/numerical risk metrics (Macaulay duration, Modified duration, DV01, convexity), with passing unit tests.

## [2026-07-11] Stage 5: Pricing and Risk Core

### 1. What was built
- **Pricing Module**:
  - Implemented [pricing.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/pricing.py) which discounts future cashflows ($CF_j$ for dates $d_j > S$) off the bootstrapped zero curve to calculate dirty price.
  - Implemented clean price calculations by subtracting accrued interest (Actual/Actual) from the dirty price.
  - Implemented YTM calculations using Brent's root-finding method (`scipy.optimize.brentq`) over a standard Gov bond yield search bracket.
- **Risk Core Module**:
  - Implemented [risk.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/risk.py) providing analytical Macaulay Duration and Modified Duration.
  - Implemented **DV01** using a direct 1 basis point (0.01% parallel increase) bump-and-reprice on the zero curve, rather than a duration approximation.
  - Implemented **Convexity** using a symmetric 10 basis point (0.1% parallel shift up and down) bump-and-reprice on the zero curve, calculating the normalized second derivative: $\frac{P_+ + P_- - 2 P_0}{P_0 \cdot 10^{-6}}$.

### 2. Assumptions or Deviations from the Docs
- Confirmed that time fraction in years from settlement to coupon date is calculated as $(d_j - S).days / 365.0$ consistent with standard day-count metrics.
- Verified that DV01 and Convexity calculations are computed by shifting the `ZeroCurve` rates directly and repricing cashflows, ensuring exact sensitivity modeling for non-parallel shifts and curvature effects.

### 3. Tests & Verification Status
- Added 2 unit tests in [backend/tests/test_quant_core.py](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/test_quant_core.py):
  1. `test_zcb_duration_sanity`: Checks that a single-cashflow Zero Coupon Bond has Macaulay duration exactly equal to its time-to-maturity (expressed as days/365.0).
  2. `test_gsec_pricing_and_risk`: Bootstraps flat 6% curve, creates cashflows for a 5-year 6% G-Sec, prices the bond (clean/dirty), solves YTM (very close to 6.0%), asserts YTM repricing reproduces the dirty price to tolerance $< 10^{-11}$, and confirms duration, DV01, and convexity fall inside mathematically correct ranges.
- Confirmed all backend unit tests pass: **18 passed, 0 failed** in 1.96s.

### 4. Next Stage (Stage 6) Info
- **Goal**: Implement `portfolios.py` and `scenarios.py` in `/backend/quant_core` and write unit tests.
- **Deliverables**: Aggregate portfolio risk and cashflow metrics, scenario shock factor deformations (parallel shift, steepener/flattener, twist, butterfly), and passing tests.

## [2026-07-11] Stage 6: Scenario and KRD Engines

### 1. What was built
- **Scenario Shock Engine**:
  - Implemented [scenario.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/scenario.py) which applies shocks in the NSS factor space (parallel level shift, slope shock, curvature 1 & 2 shocks).
  - Implemented twist shocks which shift $\beta_1$ and calculate the exact offsetting shift in $\beta_0$ to preserve the yield at the pivot maturity.
  - Implemented `get_shocked_zero_curve` which deforms the NSS parameters and runs the bootstrapping engine to return a shocked zero-coupon curve.
- **Key Rate Duration Engine**:
  - Implemented [krd.py](file:///c:/Users/soura/Downloads/BondFactor/backend/quant_core/krd.py) which computes sensitivities to rate bumps at standard tenor nodes (0.25Y to 40Y).
  - Designed the decorator class `KRD_PerturbedZeroCurve` which center-bumps the continuously evaluated ZeroCurve zero rate by 1bp (with linear tapering to neighboring key tenors), eliminating grid discretization errors.
  - Implemented `calculate_key_rate_durations` to return the vector of key rate durations.

### 2. Assumptions or Deviations from the Docs
- **Strict Code Independence**: Ensured complete decoupling between `scenario.py` and `krd.py`. The scenario engine operates by deforming the NSS parameter space upstream of bootstrapping, whereas the KRD engine applies local bumps directly on the zero rate space. They share no code or perturbation functions, conforming to AGENTS.md §5.3.

### 3. Tests & Verification Status
- Added 2 unit tests in [backend/tests/test_quant_core.py](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/test_quant_core.py):
  1. `test_scenario_shocks`: Verifies parallel, slope, and twist shocks. Checks that the yield at the pivot maturity (5.0Y) is preserved exactly (down to 12 decimal places) after a twist shock.
  2. `test_krd_reconciliation`: Generates a 10-year G-Sec cashflow, bootstraps a flat 7% zero curve, and verifies that the sum of the KRD durations reconciles exactly with Macaulay Duration ($\sum \text{KRD}_k \approx \text{MacD}$), and the sum of KRD sensitivities ($\sum \text{KRD}_k \cdot P_0 \cdot 0.0001$) reconciles exactly with the parallel zero curve DV01.
- Confirmed all backend unit tests pass: **20 passed, 0 failed** in 2.02s.

### 4. Next Stage (Stage 7) Info
- **Goal**: Implement `portfolios.py` in `/backend/quant_core` (or `/backend/api` routers if needed) and verify portfolio level risk aggregations.
- **Deliverables**: Aggregate portfolio risk metric summaries, cashflow distribution metrics, and corresponding unit tests.

## [2026-07-11] Stage 7: TypeScript Pricing Engine Port

### 1. What was built
- **TypeScript Pricing Port**:
  - Faithfully translated every G-Sec pricing and risk function from Python `/backend/quant_core` to `/lib/pricing-engine` in TypeScript, including:
    - [conventions.ts](file:///c:/Users/soura/Downloads/BondFactor/lib/pricing-engine/conventions.ts): T+1 settlement and accrued interest.
    - [cashflow.ts](file:///c:/Users/soura/Downloads/BondFactor/lib/pricing-engine/cashflow.ts): backwards cashflow schedule generator and odd first period proration.
    - [bootstrap.ts](file:///c:/Users/soura/Downloads/BondFactor/lib/pricing-engine/bootstrap.ts): ZeroCurve model and par curve bootstrap.
    - [pricing.ts](file:///c:/Users/soura/Downloads/BondFactor/lib/pricing-engine/pricing.ts): clean/dirty price, and a custom bisection root finder for YTM.
    - [risk.ts](file:///c:/Users/soura/Downloads/BondFactor/lib/pricing-engine/risk.ts): Macaulay/Modified duration, and direct zero curve bump-and-reprice calculations for DV01 and convexity.
    - [scenario.ts](file:///c:/Users/soura/Downloads/BondFactor/lib/pricing-engine/scenario.ts): NSS yields, factor shocks, twist pivot calculations.
    - [krd.ts](file:///c:/Users/soura/Downloads/BondFactor/lib/pricing-engine/krd.ts): KRD local zero rate bumps with linear tapering via the `KRD_PerturbedZeroCurve` decorator.

### 2. Assumptions or Deviations from the Docs
- **Day Count timezone safety**: Time fractions are calculated as `t = Math.round((d2 - d1) / MS_IN_DAY) / 365.0` in TypeScript to eliminate hour drifts and timezone discrepancies in client environments.

### 3. Tests & Verification Status
- **Layer 2 Parity Suite**:
  - Implemented [parity_fixtures.json](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/fixtures/parity_fixtures.json) to hold baseline NSS parameters, scenario shocks, trade/settlement dates, and a test portfolio (covering regular, odd-coupon, and ZCBs).
  - Python suite [test_parity.py](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/test_parity.py) evaluates the input fixtures and writes the expected calculations to `parity_outputs.json`.
  - TypeScript suite [parity.test.ts](file:///c:/Users/soura/Downloads/BondFactor/lib/pricing-engine/parity.test.ts) reads both JSON files and asserts parity under exact tolerances (0.1bp for yield, ₹0.01 for price, 1e-4 for duration/KRD, 1e-5 for DV01, 1e-3 for convexity).
  - Confirmed all **25 TypeScript parity tests pass successfully** via `npx vitest run`.
- **CI/CD Integration**:
  - Created [backend/requirements.txt](file:///c:/Users/soura/Downloads/BondFactor/backend/requirements.txt) to document Python packages.
  - Implemented [ci.yml](file:///c:/Users/soura/Downloads/BondFactor/.github/workflows/ci.yml) to run both Python tests and TypeScript vitest parity checks on every PR and push.

---

## [2026-07-11] Stage 8: Phase 1 API Endpoints

### 1. What was built
- **Database Schema Expansion**:
  - Expanded [models.py](file:///c:/Users/soura/Downloads/BondFactor/backend/db/models.py) to declare all Phase 1 analytics models: `CurveCalibration`, `ReferenceZeroCurve`, `KeyRateTenorGrid`, and `Security`.
- **API Router Implementations**:
  - Implemented [curves.py](file:///c:/Users/soura/Downloads/BondFactor/backend/api/routers/curves.py): `GET /curves/latest`, `GET /curves/{date}`, `GET /curves/history`, and `GET /key-rate-tenors` (with fallback list).
  - Implemented [securities.py](file:///c:/Users/soura/Downloads/BondFactor/backend/api/routers/securities.py): `GET /securities` (with `active_only` and date filtering) and `GET /securities/{isin}`.
  - Implemented [internal.py](file:///c:/Users/soura/Downloads/BondFactor/backend/api/routers/internal.py): `GET /internal/ingestion/status` (service-key protected operational endpoint).
- **FastAPI Core Integration & Global Error Envelope**:
  - Updated [main.py](file:///c:/Users/soura/Downloads/BondFactor/backend/main.py) to mount routers with versioned `/api/v1` prefixes.
  - Registered global exception handlers for `StarletteHTTPException` and `RequestValidationError` to format all error codes/messages inside the exact `{ "error": { "code", "message", "details" } }` API Spec §6 envelope.
  - Corrected trigger route URL in GHA [nightly-ingestion.yml](file:///c:/Users/soura/Downloads/BondFactor/.github/workflows/nightly-ingestion.yml) to point to `/api/v1/internal/ingestion/trigger`.

### 2. Assumptions or Deviations from the Docs
- Static endpoint routing precedence: `/curves/history` is declared before path parameter `/curves/{date_val}` in the router to avoid route matching conflicts.

### 3. Tests & Verification Status
- Created [test_api.py](file:///c:/Users/soura/Downloads/BondFactor/backend/tests/test_api.py) with 7 test cases covering success responses, query filters, nonexistent records 404, invalid query formats 422, auth headers 401/403, and verification of the global error envelope shape.
- Confirmed all backend unit tests pass: **28 passed, 0 failed** in 3.64s.

### 4. Next Stage (Stage 9) Info
- **Goal**: Implement Phase 1 frontend routes (`/` dashboard and `/analytics/curves` historical curves explorer), fetching curves, key-rate-tenors, and securities from the backend endpoints.
- **Deliverables**: Premium, responsive Next.js views displaying interactive curves, calibrator status panel, and master list table.
