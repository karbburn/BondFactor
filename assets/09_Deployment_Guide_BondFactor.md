# BondFactor — Deployment Guide

**Document version:** 1.0
**Depends on:** System Design & Architecture v1.0, Backend Specification v1.0

---

## 1. Infrastructure Overview

All infrastructure is free-tier, consistent with the project's stated constraint (PRD §11 assumptions):

| Component | Provider | Tier |
|---|---|---|
| Frontend (Next.js 14) | Vercel | Free (Hobby) |
| Backend API (FastAPI) | Render | Free web service |
| Nightly ingestion/calibration job | GitHub Actions | Free (public repo) or included minutes (private repo) |
| Database + Auth + Storage | Supabase | Free tier |

## 2. Supabase Setup

1. Create a new Supabase project. Note the project URL, anon key, and service-role key.
2. Run the schema migrations corresponding to the Database Schema document (Phase 1 tables first; Phase 2 tables added when Phase 2 begins — the schema is designed so this is additive, not a restructure).
3. Enable Row Level Security on `portfolios`, `portfolio_positions`, `saved_scenarios`, and `report_generations` per Database Schema §6, before any Phase 2 auth-gated feature goes live — RLS is not something to enable retroactively after user data exists.
4. Enable Supabase Auth (email/password or magic link — either is sufficient for a portfolio project's Phase 2 scope; not a decision that affects the rest of the architecture).
5. If report artifacts (Phase 2) are stored in Supabase Storage, create a bucket with access rules matching the RLS pattern (user can only access their own generated reports).

## 3. Render Setup (Backend)

1. Create a new Web Service, connected to the backend repository/subdirectory.
2. Build command and start command per the FastAPI app entry point (`backend/main.py`).
3. Environment variables required:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — for server-side DB writes (ingestion, calibration)
   - `SUPABASE_ANON_KEY` — if any anonymous-key-scoped operations are needed
   - `FBIL_ENDPOINT_URL`, `DBIE_ENDPOINT_URL` — kept as configuration, not hardcoded, so a source URL change (System Design's known risk) is a config update, not a code change
   - `INTERNAL_SERVICE_KEY` — protects `/internal/*` endpoints (API Specification §4) from public access
4. Confirm the free-tier cold-start behavior is acceptable given the architecture decision that interactive use does not depend on backend responsiveness (System Design §6) — this is a known, accepted trade-off, not an oversight to "fix" later by upgrading tier.

## 4. Vercel Setup (Frontend)

1. Connect the frontend repository/subdirectory as a new Vercel project.
2. Framework preset: Next.js (auto-detected).
3. Environment variables required:
   - `NEXT_PUBLIC_API_BASE_URL` — the deployed Render backend URL
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — for client-side Supabase Auth (Phase 2)
4. Confirm the production domain resolves to `bondfactor.vercel.app` (or a custom domain, if added later — no architectural dependency on the specific domain).

## 5. GitHub Actions Setup (Scheduled Ingestion)

1. Add a workflow file (e.g., `.github/workflows/nightly-ingestion.yml`) with a `schedule` (cron) trigger set to run shortly after FBIL's typical daily publication time, accounting for IST.
2. The workflow calls the backend's `/internal/ingestion/trigger` endpoint (API Specification §4), authenticated via `INTERNAL_SERVICE_KEY` stored as a GitHub Actions secret — the job itself does not need direct database credentials if it delegates execution to the already-deployed backend, keeping the credential surface smaller.
3. Add a failure notification step (e.g., a workflow-level failure triggers a GitHub notification by default; optionally extend to a webhook/email for faster visibility) so an ingestion failure is noticed promptly rather than silently sitting until someone happens to check the app.
4. Add a manual `workflow_dispatch` trigger alongside the schedule, so ingestion can be re-run on demand — useful during initial development and for recovering from a transient failure without waiting for the next scheduled run.

## 6. Environment Promotion / Branching Strategy

- `main` branch deploys to production (Vercel/Render production environments).
- Feature branches get Vercel preview deployments automatically (Vercel's default behavior) — useful for reviewing frontend changes before merge.
- The Render backend does not need a full preview-environment-per-branch setup for a solo-developer project; local development against a local or a Supabase development project is sufficient before merging to `main`.

## 7. Monitoring and Alerting (Free-Tier Appropriate)

- **Ingestion/calibration failures:** surfaced via the operational alert mechanism defined in the Backend Specification (§6) — at minimum, visible in Render's log stream; a simple webhook-to-email or webhook-to-chat notification is a reasonable low-cost addition if silent log-only visibility proves insufficient in practice.
- **Uptime:** free-tier uptime monitoring (e.g., a simple external ping service) is a reasonable addition for the backend, given free-tier cold-start/sleep behavior, primarily to catch prolonged outages rather than to guarantee always-on availability, which is explicitly not a goal (System Design §7).
- **CI status:** GitHub Actions' own status checks on pull requests serve as the primary signal for test/parity failures (Testing Strategy §6); no additional tooling needed at this scale.

## 8. Rollback Strategy

- **Frontend:** Vercel retains prior deployments; rollback is a one-click revert to a previous deployment.
- **Backend:** Render retains deploy history similarly; rollback via redeploying a previous commit.
- **Database:** Given the append-only, versioned-by-date design of the core market data tables (Database Schema §1), a bad calibration or ingestion run does not require a destructive rollback — the fallback and preservation logic (Backend Specification §4) means a bad day's data is flagged and isolated rather than corrupting historical records that need to be manually repaired.

## 9. Secrets Management Summary

| Secret | Stored in | Used by |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Render environment | Backend (ingestion, calibration writes) |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Render + Vercel environment | Backend + Frontend (Phase 2 auth) |
| `INTERNAL_SERVICE_KEY` | Render environment + GitHub Actions secrets | Internal endpoint protection |
| `FBIL_ENDPOINT_URL`, `DBIE_ENDPOINT_URL` | Render environment | Ingestion clients |

No secret is ever committed to the repository; `.env.example` files document required variable names without values.

## 10. Document Map Reference

This guide operationalizes the deployment topology described in System Design & Architecture §3 and the configuration requirements noted in the Backend Specification §7.
