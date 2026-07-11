# BondFactor — API Specification

**Document version:** 1.0
**Framework:** FastAPI
**Base path:** `/api/v1`
**Depends on:** System Design & Architecture v1.0, Database Schema v1.0
**Feeds into:** Frontend Specification, Backend Specification

---

## 1. Design Principles

- The API is intentionally thin for interactive use — most computation happens client-side (System Design §4.2), so most endpoints here are read/fetch operations rather than compute operations.
- All endpoints are versioned under `/api/v1` from the start, so a future breaking change doesn't require an unversioned migration.
- Errors follow a consistent envelope (Section 6) rather than ad hoc per-endpoint error shapes.
- Endpoints are grouped by Phase so Phase 1 frontend work is never blocked on Phase 2 endpoints existing.

## 2. Phase 1 Endpoints — Core Data Access

### `GET /curves/latest`
Returns the most recent valid fitted curve (NSS parameters, or cubic-spline fallback data) plus its calibration diagnostics.

**Response 200**
```json
{
  "curve_date": "2026-07-10",
  "model_type": "nss",
  "parameters": {
    "beta0": 6.82, "beta1": -1.14, "beta2": 0.63, "beta3": -0.28,
    "tau1": 1.35, "tau2": 6.10
  },
  "diagnostics": {
    "optimizer_converged": true,
    "fit_residual_error": 0.0021,
    "parameter_stability_delta": 0.014,
    "validation_status": "passed"
  }
}
```
If the active curve for the latest date is a cubic-spline fallback, `model_type` is `"cubic_spline"` and `parameters` is replaced with a `spline_knots` array; `diagnostics.validation_status` is `"failed_fallback_used"` with `validation_notes` populated.

### `GET /curves/{date}`
Same shape as above, for a specific historical date. Returns `404` if no calibration exists for that date.

### `GET /curves/history?start=&end=`
Returns an array of curve summaries (date, model_type, validation_status) across a date range, for the historical browsing UI *(supports Phase 2 replay; endpoint itself is Phase 1 since it's a straightforward extension of the above)*.

### `GET /key-rate-tenors`
Returns the currently active benchmark key-rate tenor grid (Database Schema §2, `key_rate_tenor_grid`), so the client's KRD computation always uses the live, source-driven grid rather than a hardcoded one.

**Response 200**
```json
{
  "effective_date": "2026-07-01",
  "tenors": [
    {"label": "91D", "years": 0.25},
    {"label": "1Y", "years": 1.0},
    {"label": "2Y", "years": 2.0},
    {"label": "5Y", "years": 5.0},
    {"label": "10Y", "years": 10.0}
  ]
}
```

### `GET /securities`
Returns the securities master list, optionally filtered.

**Query params:** `active_only` (bool, default `true`), `maturity_after`, `maturity_before`.

**Response 200:** array of security objects (`isin`, `security_name`, `issue_date`, `maturity_date`, `coupon_rate`, `coupon_frequency`, `face_value`, `benchmark_tenor_classification`).

### `GET /securities/{isin}`
Single security detail. `404` if not found.

## 3. Phase 2 Endpoints — Platform Features (Auth-Gated)

All endpoints in this section require a valid Supabase session token in the `Authorization: Bearer` header. Ownership is enforced via RLS at the database layer (Database Schema §6), not solely at the API layer.

### `GET /portfolios`
Returns the authenticated user's portfolios (summary only — id, name, position count, updated_at).

### `POST /portfolios`
Creates a new portfolio.

**Request**
```json
{ "portfolio_name": "Base Case Book" }
```
**Response 201:** created portfolio object.

### `GET /portfolios/{id}`
Returns full portfolio detail including positions.

### `PUT /portfolios/{id}`
Updates portfolio metadata (e.g., rename).

### `DELETE /portfolios/{id}`
Deletes a portfolio and its positions (cascade).

### `POST /portfolios/{id}/positions`
Adds a position.

**Request**
```json
{ "security_id": "uuid", "face_value_held": 5000000 }
```
Server-side validation mirrors the portfolio validation rules in PRD §7.6: security must exist and be active, `face_value_held` must be a sane positive number, and the security's maturity must fall within the currently available curve's tenor range. Invalid input returns `422` with a descriptive error, not silent acceptance.

### `DELETE /portfolios/{id}/positions/{position_id}`
Removes a position.

### `POST /reports/generate`
Generates a report for a portfolio under one or more scenario configurations (System Design §4.3 — server re-derives the result independently rather than trusting client-submitted numbers).

**Request**
```json
{
  "portfolio_id": "uuid",
  "format": "pdf",
  "scenarios": [
    {"name": "Bear Steepener", "beta0_shock": 0, "beta1_shock": 0.5, "beta2_shock": 0, "beta3_shock": 0}
  ]
}
```
**Response 202:** `{ "report_id": "uuid", "status": "processing" }` — report generation is async given it involves server-side repricing and document rendering.

### `GET /reports/{report_id}`
Returns generation status and, when complete, a download URL.

### `GET/POST/DELETE /scenarios/saved`
CRUD for named custom scenario compositions (Database Schema §3, `saved_scenarios`), same auth/ownership pattern as portfolios.

## 4. Phase 1 Internal/Operational Endpoints

These are not consumed by the frontend; they exist for the ingestion/calibration pipeline and operational visibility.

### `POST /internal/ingestion/trigger`
Triggered by the GitHub Actions scheduled job. Protected by a service-role key, not user auth.

### `GET /internal/ingestion/status?date=`
Returns the ingestion/calibration status for a given date — used for operational alerting, and optionally surfaced read-only in an admin view.

## 5. Not Exposed as Endpoints (by design)

Consistent with System Design §2 and §4.2: there is **no** `/pricing/reprice` or `/scenarios/apply` endpoint for interactive use. Scenario deformation, repricing, and risk computation happen entirely client-side. The only server-side repricing path is inside `/reports/generate`, where it serves a different purpose (an independently-verified export, not interactive UI).

## 6. Error Envelope

All error responses share a consistent shape:

```json
{
  "error": {
    "code": "SECURITY_NOT_FOUND",
    "message": "No active security found for the given ISIN.",
    "details": {}
  }
}
```

Standard HTTP status codes are used (`400` malformed request, `401` unauthenticated, `403` unauthorized/RLS violation, `404` not found, `422` validation failure, `500` unexpected server error). `error.code` is a stable, documented string for programmatic handling; `error.message` is human-readable.

## 7. Rate Limiting and Free-Tier Considerations

Given free-tier Render hosting, the API is not expected to handle high concurrent load. No custom rate limiting is implemented in Phase 1; if abuse or excessive load becomes an issue, a lightweight per-IP limit would be added at the FastAPI middleware layer before considering paid infrastructure.

## 8. Document Map Reference

Request/response shapes here map directly to the Database Schema tables (Section 2). Client consumption patterns (when each endpoint is called, and what triggers a call vs. a purely client-side computation) are detailed in the Frontend Specification.
