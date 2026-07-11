# BondFactor — Backend Specification

**Document version:** 1.0
**Framework:** FastAPI, Python
**Depends on:** System Design & Architecture v1.0, API Specification v1.0, Database Schema v1.0

---

## 1. Service Structure

The backend is organized as a modular FastAPI application, structured so the quantitative core (the Python reference implementation referenced throughout the Quant Methodology document) is a standalone, framework-independent package — importable and testable without spinning up the API — with FastAPI routers as a thin layer on top.

```
/backend
  /quant_core                  — framework-independent reference implementation
    conventions.py             — centralized day-count, settlement, coupon-frequency constants
    cashflow.py                — cashflow schedule generation
    nss.py                     — NSS fitting and evaluation
    spline.py                  — cubic spline fitting and evaluation
    calibration_validation.py  — convergence/plausibility/goodness-of-fit/stability checks
    bootstrap.py                — zero curve bootstrap from a fitted par curve
    pricing.py                  — clean/dirty price, YTM
    risk.py                     — duration, DV01, convexity
    scenario.py                 — NSS factor-shock application
    krd.py                      — local zero-curve tenor bump + KRD calc
  /ingestion
    fbil_client.py              — FBIL fetch + parse
    dbie_client.py               — DBIE fetch + parse (fallback)
    manual_csv_loader.py         — manual fallback ingestion path
    validators.py                — completeness/sanity checks on raw data
  /api
    routers/
      curves.py
      securities.py
      portfolios.py             — Phase 2
      reports.py                — Phase 2
      internal.py                — ingestion trigger, status
    dependencies.py              — auth/session validation, DB session injection
    schemas.py                   — Pydantic request/response models, mirroring API Specification
  /db
    models.py                    — SQLAlchemy models mirroring Database Schema tables
    session.py
  /jobs
    nightly_ingestion_job.py     — orchestrates ingestion → calibration → validation → persistence → archival bootstrap
  main.py                        — FastAPI app instantiation, router registration
```

## 2. `quant_core` — Design Notes

This package exists as the **single source of quantitative truth** referenced in the Quant Methodology document. It has no FastAPI or database dependency, which means:

- It can be imported directly by unit and parity tests without any web server running.
- It is the reference implementation the TypeScript pricing engine (Frontend Specification §3) is validated against — every function in `/lib/pricing-engine` on the frontend has a named counterpart here, and the Testing Strategy's parity suite runs both side-by-side against shared test fixtures.
- Calibration validation logic (`calibration_validation.py`) implements exactly the checks defined in Quant Methodology §5 — convergence, parameter plausibility, goodness-of-fit, day-over-day stability, and numerical smoothness — and returns a structured result (`passed` / `failed_fallback_used` with reasons) rather than a bare boolean, so the reason for a fallback is always recorded, never just inferred.

## 3. Ingestion Service Behavior

`fbil_client.py` and `dbie_client.py` each implement a `fetch(date) -> RawObservationBatch | FetchFailure` interface, so the orchestrating job (`nightly_ingestion_job.py`) can attempt them in priority order without source-specific branching logic at the orchestration level:

```python
def run_ingestion(date):
    result = fbil_client.fetch(date)
    if result.failed:
        result = dbie_client.fetch(date)
    if result.failed:
        flag_for_manual_import(date)
        raise_operational_alert(date, reason="both automated sources failed")
        return
    validated = validators.validate(result)
    persist_raw_observations(validated)
```

Each source client is responsible for translating its own response format (HTML/CSV/whatever the source actually returns) into the same internal `RawObservationBatch` shape, isolating source-format fragility to a single, small module per source — so a future FBIL page-structure change is a one-file fix, not a pipeline rewrite.

## 4. Calibration Job Behavior

```python
def run_calibration(date):
    par_data = load_validated_observations(date)
    nss_result = nss.fit(par_data)
    validation = calibration_validation.validate(nss_result, previous_day=get_previous_calibration())
    if validation.passed:
        active_curve = nss_result
    else:
        raise_operational_alert(date, reason=validation.failure_reason)
        active_curve = spline.fit(par_data)  # fallback
        preserve_previous_nss_calibration()   # explicit no-overwrite
    persist_calibration(date, active_curve, validation)
    zero_curve = bootstrap.bootstrap(active_curve)
    persist_reference_zero_curve(date, zero_curve)
```

This directly implements System Design §4.1 and Quant Methodology §5–6; nothing in this job is left implicit.

## 5. Authentication (Phase 2)

Supabase Auth issues and validates session tokens; FastAPI does not implement its own user/password handling. `dependencies.py` provides a `get_current_user` dependency that validates the bearer token against Supabase and raises `401` on failure. Row Level Security at the database layer (Database Schema §6) is the actual enforcement mechanism for data ownership — the API layer's auth check is a fast-fail convenience, not the sole safeguard.

## 6. Logging and Observability

- Every ingestion attempt (success or failure, per source) is logged with enough structured detail to answer "why does today's curve look like this" without re-running the job.
- Calibration validation failures raise an alert (initially: a logged error visible in Render's log stream and/or a simple webhook notification — full alerting infrastructure is not over-engineered for a single-maintainer project, but the failure is never silent).
- Report generation (Phase 2) logs request parameters and completion status for debugging failed exports.

## 7. Configuration Management

Environment-specific configuration (Supabase connection string, service-role keys, FBIL/DBIE endpoint URLs) is managed via environment variables, injected through Render's environment configuration and GitHub Actions secrets for the scheduled job — never committed to the repository. Full variable list and setup steps are in the Deployment Guide.

## 8. Document Map Reference

This module structure directly implements the responsibilities assigned to the Ingestion Service and Calibration Service in System Design §3, persists to the tables defined in the Database Schema, and exposes the endpoints defined in the API Specification. Its `quant_core` package is what the Testing Strategy's unit and parity test layers exercise directly.
