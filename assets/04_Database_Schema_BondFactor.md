# BondFactor — Database Schema

**Document version:** 1.0
**Platform:** PostgreSQL via Supabase
**Depends on:** System Design & Architecture v1.0
**Feeds into:** API Specification, Backend Specification

---

## 1. Design Principles

- Every table that stores a market-derived value (curve fits, diagnostics) is versioned by date and never overwritten — history is preserved even when a calibration is later superseded or flagged as a fallback, consistent with the auditability requirement.
- Tables are tagged by the implementation phase (PRD/Roadmap) in which they become necessary, so Phase 1 work is not blocked waiting on Phase 2 schema.
- Row Level Security (RLS) is used on all user-owned tables (portfolios, positions) once Supabase Auth is introduced in Phase 2 — no user-owned data is queryable across accounts.

## 2. Phase 1 Tables — Core Analytics Engine

### `raw_par_yield_observations`
Stores every ingestion attempt's raw output, regardless of source or success, for auditability.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `observation_date` | date | Trading day the data represents |
| `source` | text | `fbil` \| `dbie` \| `manual_csv` |
| `tenor_label` | text | e.g. `91D`, `1Y`, `10Y` — as published by the source |
| `tenor_years` | numeric | Tenor converted to a consistent numeric year fraction |
| `par_yield` | numeric | As published, in percent |
| `fetch_status` | text | `success` \| `failed` \| `manual_override` |
| `fetched_at` | timestamptz | |
| `raw_payload` | jsonb | Original response, for debugging source format changes |

Indexes: `(observation_date, source)`, `(observation_date, tenor_years)`.

### `curve_calibrations`
One row per trading day per model attempted (NSS and, if triggered, its cubic-spline fallback).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `curve_date` | date | |
| `model_type` | text | `nss` \| `cubic_spline` |
| `is_active` | boolean | Whether this is the curve actually used downstream for `curve_date` (true for the fallback if NSS failed, true for NSS if it passed validation) |
| `beta0` | numeric, nullable | NSS only |
| `beta1` | numeric, nullable | NSS only |
| `beta2` | numeric, nullable | NSS only |
| `beta3` | numeric, nullable | NSS only |
| `tau1` | numeric, nullable | NSS only |
| `tau2` | numeric, nullable | NSS only |
| `spline_knots` | jsonb, nullable | Cubic spline only — knot points and coefficients |
| `optimizer_converged` | boolean | |
| `fit_residual_error` | numeric | Goodness-of-fit metric (Quant Methodology §5) |
| `parameter_stability_delta` | numeric, nullable | Day-over-day parameter change, null on first calibration |
| `validation_status` | text | `passed` \| `failed_fallback_used` |
| `validation_notes` | text, nullable | Human-readable reason on failure |
| `created_at` | timestamptz | |

Indexes: unique `(curve_date, model_type)`; `(curve_date, is_active)`.

### `reference_zero_curves`
Server-side bootstrapped zero curve, archival/reporting use only (System Design §5.3) — not the live client bootstrap source.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `curve_date` | date | |
| `calibration_id` | uuid, FK → `curve_calibrations.id` | Which fit this was bootstrapped from |
| `tenor_years` | numeric | |
| `discount_factor` | numeric | |
| `zero_rate` | numeric | Derived, stored for convenience/inspection |

Indexes: `(curve_date, tenor_years)`.

### `key_rate_tenor_grid`
The dynamic benchmark tenor grid used for KRD buckets (Quant Methodology §9), refreshed whenever the source's published tenor structure changes rather than hardcoded.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `effective_date` | date | Date this grid definition became active |
| `tenor_label` | text | |
| `tenor_years` | numeric | |
| `source` | text | Which data source's published grid this reflects |

### `securities`
Bond master data.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `isin` | text, unique | |
| `security_name` | text | |
| `issue_date` | date | |
| `maturity_date` | date | |
| `coupon_rate` | numeric | Annual, percent |
| `coupon_frequency` | integer | `2` for semi-annual (standard) |
| `face_value` | numeric | Typically 100 |
| `benchmark_tenor_classification` | text, nullable | If this security is one of the published benchmark tenor points |
| `is_active` | boolean | Whether still outstanding / not yet matured |

Indexes: `(isin)` unique, `(maturity_date)`.

## 3. Phase 2 Tables — Platform Features

### `portfolios`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid, FK → Supabase `auth.users.id` | RLS enforced |
| `portfolio_name` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `portfolio_positions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `portfolio_id` | uuid, FK → `portfolios.id` | |
| `security_id` | uuid, FK → `securities.id` | |
| `face_value_held` | numeric | Position size |
| `position_type` | text | `long` only (Phase 1–2 scope; PRD §9) |
| `added_at` | timestamptz | |

### `saved_scenarios`
Optional named/reusable custom scenario compositions (Quant Methodology §8 custom scenario).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid, FK → `auth.users.id` | |
| `scenario_name` | text | |
| `beta0_shock` | numeric | |
| `beta1_shock` | numeric | |
| `beta2_shock` | numeric | |
| `beta3_shock` | numeric | |
| `created_at` | timestamptz | |

### `report_generations`
Metadata for generated reports; the artifact itself may be stored in Supabase Storage with a reference here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid, FK → `auth.users.id` | |
| `portfolio_id` | uuid, FK → `portfolios.id` | |
| `format` | text | `pdf` \| `xlsx` |
| `scenario_config` | jsonb | Snapshot of applied scenario(s) at generation time |
| `storage_path` | text | |
| `generated_at` | timestamptz | |

## 4. Phase 3 Tables — Advanced Analytics (indicative, not committed)

Schema for historical scenario calibration and advanced attribution is deferred until Phase 3 scope is finalized in the Roadmap; noted here only so Phase 1–2 tables are not designed in a way that would conflict with likely future additions (e.g., `reference_zero_curves` already being date-indexed naturally supports a future historical-move-calibration feature without restructuring).

## 5. Relationships Summary

```
raw_par_yield_observations ──(feeds)──> curve_calibrations ──(bootstrapped into)──> reference_zero_curves
curve_calibrations ──(validated against)──> key_rate_tenor_grid (independent, source-driven)
securities ──(referenced by)──> portfolio_positions ──(belongs to)──> portfolios ──(owned by)──> auth.users
portfolios ──(exported via)──> report_generations
```

## 6. Row Level Security (Phase 2)

- `portfolios`: users can only `SELECT`/`INSERT`/`UPDATE`/`DELETE` rows where `user_id = auth.uid()`.
- `portfolio_positions`: access gated via a join to `portfolios.user_id = auth.uid()`.
- `saved_scenarios`, `report_generations`: same pattern as `portfolios`.
- All Phase 1 tables (`raw_par_yield_observations`, `curve_calibrations`, `reference_zero_curves`, `key_rate_tenor_grid`, `securities`) are public-read, since they are market data with no user ownership; writes are restricted to the ingestion/calibration service role only.

## 7. Document Map Reference

This schema is the persistence layer referenced throughout the API Specification (request/response shapes map closely to these tables) and the Backend Specification (repository/service layer implementation).
