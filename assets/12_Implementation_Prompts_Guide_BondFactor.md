# BondFactor — Implementation Prompts Guide

**Document version:** 1.0
**Purpose:** A phased sequence of ready-to-paste prompts for a coding agent (Claude Code, or any other LLM/agent) to implement BondFactor, stage by stage, in the order defined by the Development Roadmap.
**Location assumption:** All 11 prior documents live at `\BondFactor\assets\`. If you add Claude Code Skills or other agent skills, place them in `\BondFactor\assets\skills\` (or a similarly named subfolder) — every stage prompt below checks for and uses them.

---

## How to Use This Guide

Each stage below is a **self-contained prompt**. Copy the **Universal Preamble** (Section 0) together with the specific **Stage prompt** into a new chat or agent session — every single time, even if you're continuing with the same LLM you used for the previous stage. Treat every stage as a fresh session with zero shared memory. This is what makes it safe to do Stage 3 in Claude Code and Stage 4 in a different tool or model entirely: nothing about a stage's prompt depends on the agent remembering anything from before, because the preamble forces it to reconstruct context from the docs and the actual repository state, not from conversation history.

Each stage also ends by requiring the agent to update a single running log file (`IMPLEMENTATION_LOG.md`, Section 0) — this log is the actual mechanism that makes cross-agent, cross-session handoff work. Don't skip that step even if it feels redundant; it's more reliable than any LLM's memory.

Do not skip stages or reorder them within a phase — the sequence follows the dependency order in the Development Roadmap (§2.1, §3.1) deliberately. Do not begin a Phase 2 stage until every Phase 1 stage's exit criteria are met (Roadmap §2.2) — this is a hard gate, not a suggestion, per `AGENTS.md` §5.6.

---

## Section 0 — Universal Preamble

**Paste this at the start of every single stage prompt, unmodified:**

```
CONTEXT — READ THIS FIRST. Do not rely on any prior conversation memory; treat this as a
completely fresh session.

This is the BondFactor project: an Indian Government Securities yield curve deformation
and portfolio risk platform. Before writing any code, do the following in order:

1. Read every file in \BondFactor\assets\ that is relevant to this stage's task (the
   specific stage prompt below tells you which documents matter most for this stage,
   but skim all of them if you're unsure — they are short and cross-reference each other).
   The documents are:
     01_PRD_BondFactor.md
     02_Quant_Methodology_BondFactor.md
     03_System_Design_BondFactor.md
     04_Database_Schema_BondFactor.md
     05_API_Specification_BondFactor.md
     06_Frontend_Specification_BondFactor.md
     07_Backend_Specification_BondFactor.md
     08_Testing_Strategy_BondFactor.md
     09_Deployment_Guide_BondFactor.md
     10_Development_Roadmap_BondFactor.md
     11_AGENTS_BondFactor.md

2. Read 11_AGENTS_BondFactor.md in full and follow it for every change you make in this
   session, without exception. Its Section 5 (Project-Specific Guidelines) overrides
   Section 2's "simplicity first" wherever the two would conflict on a financial-
   correctness matter — see AGENTS.md §5.1.

3. Check \BondFactor\assets\skills\ (or any similarly named "skills" subfolder in the
   repository). If any skill file there is relevant to this stage's task — testing,
   API design, frontend/UI, deployment, or anything else — read it and apply its
   guidance. If nothing there is relevant to this stage, say so briefly and proceed.

4. Read IMPLEMENTATION_LOG.md at the repository root, if it exists. This is the running
   record of what previous stages actually built, what assumptions were made, and any
   deviations from the documents. Trust this log over your own assumptions about what
   "should" already exist.

5. Inspect the actual current state of the repository (list files, read existing code
   in quant_core/, lib/pricing-engine/, ingestion/, api/, frontend, tests, etc. as
   applicable) to confirm what previous stages have actually implemented. If the repo
   state doesn't match what IMPLEMENTATION_LOG.md or the docs describe, stop and flag
   the discrepancy before proceeding — do not silently paper over it (AGENTS.md §5.10).

If anything about this stage's task is ambiguous, or the repository state contradicts
what you expected to find, stop and ask rather than guessing (AGENTS.md §1). State any
assumptions you do make explicitly before writing code.

At the end of this stage, append a new dated entry to IMPLEMENTATION_LOG.md (create it
at the repository root if it doesn't exist yet) summarizing: what was built, any
assumptions or deviations from the docs, what tests were written and their current
status, and what the next stage should know before starting. This entry is what makes
the next stage — possibly run by a different LLM entirely — able to pick up seamlessly.
```

---

## Phase 1 — Core Analytics Engine

Per Roadmap §2.1–2.2. None of these stages are usable as a product in isolation; Phase 1 is not complete, and Phase 2 does not begin, until every exit criterion in Roadmap §2.2 is met.

### Stage 0 — Repository & Infrastructure Bootstrap

*Primary docs: System Design §3, Deployment Guide (all), Backend Specification §1*

```
STAGE 0 TASK:
Set up the initial repository structure and infrastructure scaffolding — no business
logic yet. Deliverables:

1. Repository skeleton matching the module structure in Backend Specification §1
   (/backend/quant_core, /backend/ingestion, /backend/api, /backend/db, /backend/jobs)
   and Frontend Specification §2/§3 (/app routes, /lib/pricing-engine, /lib/state).
2. Placeholder Supabase project setup instructions followed per Deployment Guide §2
   (do not fabricate credentials — tell me exactly what I need to create/provide
   manually, such as project creation and obtaining keys).
3. Environment variable templates (.env.example for backend and frontend) listing every
   variable named in Deployment Guide §3, §4, §9 — no real values.
4. Empty but valid FastAPI app entry point (main.py) and Next.js app shell that both
   run locally without errors, with no functional endpoints yet.
5. Base GitHub Actions workflow file skeleton per Deployment Guide §5 (schedule trigger
   + workflow_dispatch, calling a placeholder endpoint) — does not need to work end to
   end yet, since /internal/ingestion/trigger doesn't exist until Stage 2.

VERIFY: Backend and frontend both start locally with no errors. Folder structure
matches the specs. No business logic, no fabricated credentials, no placeholder
functions pretending to be real implementations.
```

### Stage 1 — Data Source Validation

*Primary docs: PRD §11, Quant Methodology §2, Roadmap §2.1 milestone 1*

```
STAGE 1 TASK:
This is explicitly the first real engineering task per the Roadmap, and it is a
research/validation task, not a coding task in the usual sense. Investigate the actual,
current structure of:
  - FBIL's published daily benchmark G-Sec par yield curve (URL, format, whether it's a
    stable direct download or requires other retrieval methods, exact tenor points
    published)
  - RBI DBIE's equivalent historical/current G-Sec yield data (how it's queried, what
    report/series identifiers are relevant, format)

Report back concretely: what you found, whether each source is a stable, scriptable
endpoint or something messier, and what the manual CSV fallback format should
therefore look like (matching the RawObservationBatch shape implied by Database
Schema §2's raw_par_yield_observations table). Do not write the ingestion client code
yet — that's Stage 2. This stage's deliverable is a short findings document
(SOURCES_FINDINGS.md at the repo root) plus, if a stable format was found, one or two
sample raw responses saved for use as test fixtures in Stage 2.

If you cannot access these sources directly (e.g. no internet/browsing available in
this environment), say so explicitly and list exactly what a human needs to verify
manually before Stage 2 can proceed with confidence — do not guess at endpoint
structure and present it as verified.

VERIFY: SOURCES_FINDINGS.md exists and is honest about what was actually confirmed
versus assumed. IMPLEMENTATION_LOG.md entry clearly flags this as a validation task
whose findings the rest of the project depends on.
```

### Stage 2 — Ingestion Pipeline

*Primary docs: Backend Specification §3, System Design §4.1, §6, Database Schema §2*

```
STAGE 2 TASK:
Implement the ingestion pipeline per Backend Specification §3:
  - fbil_client.py, dbie_client.py, manual_csv_loader.py — each implementing the
    fetch(date) -> RawObservationBatch | FetchFailure interface
  - validators.py — completeness and sanity-bound checks before data is persisted
  - The orchestration logic (fbil -> dbie fallback -> manual flag + alert) per System
    Design §4.1 and Backend Specification §3's run_ingestion() sketch
  - Persistence into raw_par_yield_observations per Database Schema §2

Use the findings and sample fixtures from Stage 1 (read SOURCES_FINDINGS.md).

Write integration tests per Testing Strategy §5 (ingestion fallback testing) using
mocked source responses — confirm the FBIL-fails-fall-to-DBIE path and the
both-fail-flag-and-alert path both work correctly.

VERIFY: Ingestion pipeline runs against mocked sources and correctly persists data,
falls back correctly, and never silently swallows a failure (AGENTS.md §5.5).
```

### Stage 3 — quant_core Foundation

*Primary docs: Quant Methodology §7.1–7.2, Backend Specification §1–2, Testing Strategy §2*

```
STAGE 3 TASK:
Implement conventions.py and cashflow.py in /backend/quant_core, per Quant Methodology
§7.1–7.2: centralized day-count (Actual/Actual), settlement (T+1), coupon frequency
(semi-annual) constants/functions, and cashflow schedule generation for a G-Sec given
coupon rate, coupon frequency, issue date, and maturity date.

Write Layer 1 unit tests (Testing Strategy §2) covering: correct coupon dates/amounts
across various frequency/date combinations, edge cases (odd first coupon period,
maturity falling exactly on a coupon date), and accrued interest calculation under
Actual/Actual across multiple date ranges including leap years, verified against
hand-computed expected values you show your work for.

This is the foundation every later quant_core module depends on — do not proceed past
what's explicitly asked (no pricing, no curve fitting yet) even if it seems like a
natural next step.

VERIFY: All unit tests pass. Every day-count/settlement/frequency assumption traces to
Quant Methodology §7.2, nowhere else.
```

### Stage 4 — Curve Fitting

*Primary docs: Quant Methodology §3–6 (the full comparative evaluation and chosen methodology), Backend Specification §2, Testing Strategy §2*

```
STAGE 4 TASK:
Implement nss.py, spline.py, calibration_validation.py, and bootstrap.py in
/backend/quant_core, per Quant Methodology §4 (NSS and cubic spline fitting), §5
(calibration validation checks: convergence, parameter plausibility, goodness-of-fit,
day-over-day stability, numerical smoothness), and §6 (bootstrapping the zero curve
from a validated par curve).

Before writing code, briefly confirm your understanding of why fit-then-bootstrap was
chosen (Quant Methodology §3.2, §3.6) — this affects how bootstrap.py should be
structured (it should assume a continuous par curve as input, not raw sparse points,
since that ad hoc-interpolation problem is exactly what Approach 2 was chosen to avoid).

Implement calibration_validation.py to return a structured result (passed /
failed_fallback_used with reasons), not a bare boolean, per Backend Specification §2.

Write Layer 1 unit tests per Testing Strategy §2: NSS evaluation against known
parameters, NSS calibration recovering known parameters from a synthetic curve with
noise, cubic spline fit/evaluation, bootstrap correctness (reprice par instruments off
the bootstrapped zero curve and confirm their par yields are reproduced to a tight
tolerance), and calibration validation explicitly tested against deliberately bad/noisy
synthetic input to confirm the fallback path triggers correctly.

VERIFY: All unit tests pass, including the deliberately-bad-input fallback test. The
bootstrap function's input assumption (continuous curve, not sparse points) is
consistent with the Stage 3→4 handoff and Quant Methodology §3.2.
```

### Stage 5 — Pricing and Risk Core

*Primary docs: Quant Methodology §7.3, Testing Strategy §2*

```
STAGE 5 TASK:
Implement pricing.py and risk.py in /backend/quant_core per Quant Methodology §7.3:
clean price, dirty price, YTM, Macaulay duration, modified duration, DV01 (via
bump-and-reprice against the zero curve, not a duration-derived approximation), and
convexity (via symmetric bump-and-reprice).

These functions consume the cashflow schedules from Stage 3 (cashflow.py) and the
bootstrapped zero curve from Stage 4 (bootstrap.py) — do not reimplement either.

Write Layer 1 unit tests per Testing Strategy §2, including the stated sanity check: a
single-cashflow zero-coupon bond should have duration equal to its maturity by
construction — use this and similar hand-calculable cases to verify correctness before
trusting the implementation on more complex portfolios.

VERIFY: All unit tests pass, including the zero-coupon duration sanity check. DV01 and
convexity are computed via bump-and-reprice, not shortcut formulas — confirm this
explicitly in your summary.
```

### Stage 6 — Scenario and KRD Engines

*Primary docs: Quant Methodology §8–9, AGENTS.md §5.3, Testing Strategy §2*

```
STAGE 6 TASK:
Implement scenario.py and krd.py in /backend/quant_core per Quant Methodology §8
(NSS factor-shock scenarios: parallel, steepener, flattener, twist, butterfly, custom
composition) and §9 (Key Rate Duration via independent local zero-curve tenor bumps
with linear tapering).

These two modules must remain independent — krd.py must NOT call into scenario.py or
share a perturbation function with it, per AGENTS.md §5.3. If you find yourself wanting
to unify them for "cleaner" code, stop — this is a deliberate, documented design
decision, not an oversight.

Write Layer 1 unit tests per Testing Strategy §2, including the KRD internal
consistency check: confirm the sum of KRD bucket sensitivities approximately
reconciles with total parallel DV01 (from Stage 5's risk.py) for a test portfolio.

VERIFY: All unit tests pass, including the KRD-sum-vs-DV01 reconciliation check.
scenario.py and krd.py have no shared perturbation logic — confirm this explicitly.
```

### Stage 7 — TypeScript Pricing Engine Port

*Primary docs: Frontend Specification §3, System Design §2, Quant Methodology §10, Testing Strategy §3, AGENTS.md §5.2*

```
STAGE 7 TASK:
Port every function from /backend/quant_core (conventions, cashflow, bootstrap,
pricing, risk, scenario, krd — Stages 3–6) to /lib/pricing-engine in TypeScript, per
Frontend Specification §3. This is a faithful port, not a reinterpretation — the
Python implementation is the reference; do not "improve" the math or add functionality
during translation (AGENTS.md §5.2).

Per System Design §2: the client bootstraps its own zero curve from NSS parameters
(base or scenario-shocked) using this same ported bootstrap.ts — do not build a
separate code path for the base-case curve.

For every ported function, write a Layer 2 parity test (Testing Strategy §3) against a
shared fixture set — synthetic NSS parameter sets and test portfolios expressed once,
in a shared JSON format, consumed by both the Python and TypeScript test suites. Do not
author separate, potentially-divergent test cases for each language.

Enforce the exact tolerances from Quant Methodology §10: yield within 0.1bp, price
within ₹0.01 per ₹100 face value, and metric-appropriate tolerances for duration/DV01/
convexity/KRD. Set this up as a CI check (Testing Strategy §6) that fails the build on
any breach — not an optional/manual check.

VERIFY: Every quant_core function has a corresponding TypeScript function and a passing
parity test. CI is configured to run this suite and block merges on failure.
```

### Stage 8 — Phase 1 API Endpoints

*Primary docs: API Specification §2, §4, §6–7, Backend Specification §1*

```
STAGE 8 TASK:
Implement the Phase 1 FastAPI endpoints per API Specification §2 (GET /curves/latest,
GET /curves/{date}, GET /curves/history, GET /key-rate-tenors, GET /securities, GET
/securities/{isin}) and §4 (POST /internal/ingestion/trigger, GET
/internal/ingestion/status — service-key protected, not user-facing).

Follow the error envelope defined in API Specification §6 consistently across every
endpoint. Do not implement any endpoint from API Specification §3 (Phase 2, auth-gated)
yet — that's out of scope until Phase 2 begins (AGENTS.md §5.6).

Note API Specification §5 explicitly: there is no /pricing/reprice or /scenarios/apply
endpoint. Do not add one, even if it seems convenient for testing — interactive
computation is client-side only, per System Design §4.2.

VERIFY: Every Phase 1 endpoint is implemented, tested (basic request/response and
error-path tests), and matches the documented response shapes exactly. No Phase 2 or
interactive-compute endpoints were added.
```

### Stage 9 — Frontend Phase 1 Surface

*Primary docs: Frontend Specification (all), PRD §6 Journeys 1, 2, 3, 6*

```
STAGE 9 TASK:
Build the Phase 1 frontend surface per Frontend Specification: the landing/example
portfolio page (Journey 1), portfolio builder (Journey 2), curve explorer (Journey 3),
and pricing validation panel (Journey 6). Do not build the Phase 2 routes
(/history, /reports, /portfolios, /login) yet — stub them as clearly
"coming in Phase 2" if you want placeholders, but do not implement their logic.

Wire the frontend to /lib/pricing-engine (Stage 7) for all interactive scenario/
repricing/risk computation — never route this through the API (Frontend Specification
§6, System Design §4.2). Wire it to the Stage 8 API endpoints only for the initial
curve/securities/key-rate-tenor fetch on load.

Follow the design direction assumption stated in Frontend Specification §1 (dense,
data-table-oriented, Bloomberg-terminal-inspired layout, ink/amber palette,
JetBrains Mono) unless told otherwise before starting.

Build the state management structure from Frontend Specification §4
(CurveContext, PortfolioContext, ScenarioContext, ResultsContext) as specified — no
external state library unless you hit a concrete limitation that justifies one
(AGENTS.md §5.9 on unnecessary dependencies applies here too).

VERIFY: Journeys 1, 2, 3, and 6 are all completable end to end in the running
application. Scenario slider interaction triggers no network call. No Phase 2 routes
have real logic yet.
```

### Stage 10 — Golden Reference Validation & Phase 1 Exit Check

*Primary docs: Testing Strategy §4, PRD §10, Roadmap §2.2*

```
STAGE 10 TASK:
Source or construct a curated set of benchmark G-Secs with independently verifiable
market values (traded clean price, YTM) per Testing Strategy §4. Where an authoritative
reference truly cannot be sourced, document a manually verified calculation
transparently as such, per the same section — do not present a manual calculation as
an authoritative reference.

Run these as Layer 3 golden reference tests against the Stage 3–6 quant_core
implementation. For any discrepancy, determine and document whether it's within the
expected range explained by the default-free/liquidity-agnostic pricing assumption
(Quant Methodology §7.2, §11) or an actual bug — do not wave away a discrepancy without
this determination.

Wire these same reference cases into the PricingValidationPanel component (Stage 9)
so they're user-facing, per Frontend Specification §5 and PRD Journey 6.

Finally: go through every exit criterion in Development Roadmap §2.2 explicitly and
report status on each one (pass/fail/not-yet-attempted). Do not declare Phase 1
complete unless every criterion is genuinely met — this determines whether Phase 2 can
begin (AGENTS.md §5.6).

VERIFY: Golden reference results are documented with causes for any discrepancy.
PricingValidationPanel surfaces real reference data. A clear, honest statement is
produced on every Roadmap §2.2 exit criterion.
```

---

## Phase 2 — Platform Features

**Do not begin any Stage 11+ prompt until Stage 10's report confirms every Phase 1 exit criterion is met.** If it isn't, the next session's task is to close that gap, not to proceed.

### Stage 11 — Authentication

*Primary docs: Backend Specification §5, Frontend Specification §2 (`/login`), Deployment Guide §2*

```
STAGE 11 TASK:
Integrate Supabase Auth per Backend Specification §5 and Deployment Guide §2/§4.
Implement the get_current_user FastAPI dependency (validates bearer token, raises 401
on failure) and the frontend /login route with session handling.

Do not implement custom password/user handling — Supabase Auth is the sole mechanism,
per Backend Specification §5. Do not enable any Phase 2 data table's RLS policy yet if
that table doesn't exist — that's Stage 13.

VERIFY: A user can sign up, log in, and the frontend correctly reflects authenticated
vs. unauthenticated state. Protected API routes correctly reject unauthenticated
requests with 401.
```

### Stage 12 — Historical Data Availability Assessment

*Primary docs: PRD §6 Journey 4, §7.7, Roadmap §3.1 milestone 2*

```
STAGE 12 TASK:
This is a research/validation task, like Stage 1. Determine what historical range of
G-Sec par yield data is actually reliably available from FBIL/DBIE (per Stage 1's
findings and any further investigation needed). Report findings honestly in
HISTORICAL_DATA_FINDINGS.md — including the possibility that reliable coverage only
realistically starts from BondFactor's own launch/ingestion date going forward, which
PRD §7.7 explicitly treats as an acceptable, honestly-stated outcome rather than a
failure.

Do not build the historical archive or replay feature (Stage 15) until this assessment
is complete and documented — building it first and discovering the data doesn't
support it would violate the "never imply data availability that doesn't exist"
principle (PRD §4 principle 2).

VERIFY: HISTORICAL_DATA_FINDINGS.md exists with an honest, specific statement of what
range is actually available and how confident that assessment is.
```

### Stage 13 — Portfolio Persistence

*Primary docs: Database Schema §3, §6, API Specification §3, AGENTS.md §5.7, §5.8*

```
STAGE 13 TASK:
Implement the portfolios and portfolio_positions tables (Database Schema §3) and their
CRUD endpoints (API Specification §3: GET/POST /portfolios, GET/PUT/DELETE
/portfolios/{id}, POST/DELETE for positions). Enable Row Level Security per Database
Schema §6 BEFORE any real user data is stored against these tables — do not treat RLS
as a later hardening step.

Implement the portfolio validation rules from PRD §7.6 / API Specification §3 (security
must exist and be active, sane positive face value, maturity within the available
curve's tenor range) with clear 422 rejection on invalid input, not silent acceptance.

Wire the frontend to allow explicit Save/Load actions (Frontend Specification §6) —
no automatic background sync, and still no localStorage/sessionStorage use anywhere
for this data (AGENTS.md §5.7).

VERIFY: RLS is tested, not just enabled — confirm one test user genuinely cannot query
another user's portfolio data. Invalid position input is rejected with a clear error,
not silently dropped or accepted.
```

### Stage 14 — Multi-Portfolio Management and Comparison

*Primary docs: PRD §7.6, Frontend Specification §5*

```
STAGE 14 TASK:
Build on Stage 13 to support multiple portfolios per user and side-by-side portfolio/
scenario comparison in the UI, per PRD §6 and §7.6. This is purely additive on top of
the already-working single-portfolio persistence — do not modify the Stage 13 schema
or core CRUD logic beyond what's strictly needed to support multiple portfolios (which
the schema already supports natively, since portfolio_id was always a foreign key, not
a singleton).

VERIFY: A user can create, save, and compare at least two portfolios side by side under
the same or different scenarios.
```

### Stage 15 — Historical Curve Archive and Replay

*Primary docs: PRD §7.7, Database Schema §5.3, Frontend Specification §5 (HistoricalCurveBrowser)*

```
STAGE 15 TASK:
Using Stage 12's findings, implement the historical curve archive and replay feature
scoped honestly to whatever range is actually available — per PRD §7.7, the UI must
state its actual coverage range explicitly, always, not just on a details/about page.

Wire this to the reference_zero_curves archival table (Database Schema §2/§5.3), not
to a live re-fitting of historical dates.

If Stage 12 concluded that no meaningful historical range exists yet (coverage starts
from launch date forward), implement this stage as "coverage builds up going forward"
with that fact stated plainly in the UI, rather than skipping the feature or
overstating what's available.

VERIFY: The UI never implies a historical range that isn't actually backed by real
archived data.
```

### Stage 16 — Reporting Engine

*Primary docs: API Specification §3 (/reports/generate), System Design §4.3, Database Schema §3*

```
STAGE 16 TASK:
Implement PDF/Excel report generation per API Specification §3 and System Design §4.3:
the server independently re-derives the portfolio/scenario result server-side (Python,
same quant_core logic) rather than trusting client-submitted numbers, then renders the
document. Cover the report contents specified in PRD §7.8: composition, before/after
curves, full risk stack, scenario P&L, supporting visualizations.

Build this for single-portfolio, single-or-multi-scenario reports first, per PRD §7.8 —
do not build comparative (multi-portfolio) export yet, but keep the architecture (as
already specified) able to support it later without a redesign.

VERIFY: A generated report's numbers match what the server independently computes, not
just what the client displayed. Report generation status polling works correctly for
the async flow (API Specification §3, 202 response).
```

### Stage 17 — Saved Custom Scenarios

*Primary docs: Database Schema §3 (saved_scenarios), API Specification §3*

```
STAGE 17 TASK:
Implement CRUD for named, reusable custom scenario compositions (Database Schema §3
saved_scenarios table, API Specification §3 endpoints), following the same
auth/ownership/RLS pattern established in Stage 13. This is a lower-priority
convenience feature per Roadmap §3.1 — keep it simple and don't let it grow scope
beyond straightforward CRUD plus applying a saved scenario in the ScenarioComposer
(Frontend Specification §5).

VERIFY: A user can save a custom scenario composition and re-apply it in a later
session.
```

---

## Phase 3 — Advanced Analytics (Indicative)

Per Roadmap §4, this phase is **not committed in detail** — its scope should be re-evaluated once Phase 2 is complete and real usage (even just the developer's own regular use) can inform prioritization. Do not run a "Stage 18" prompt as a default next step the way Stages 0–17 are meant to be run sequentially.

### Stage 18 — Phase 3 Scoping Session (not an implementation stage)

*Primary docs: Roadmap §4, all prior docs as reference*

```
STAGE 18 TASK (SCOPING ONLY — DO NOT WRITE IMPLEMENTATION CODE IN THIS SESSION):
Phase 1 and Phase 2 are complete. Review Development Roadmap §4's indicative Phase 3
scope (historical scenario calibration, advanced risk attribution, performance
optimization, expanded visualization, possible additional instrument types) against
how the platform has actually been used since Phase 2 shipped.

Produce a prioritized, re-scoped Phase 3 plan — in the same style as this document's
other stages (self-contained prompts, dependency-ordered, with exit criteria) — but do
not implement anything yet. If any new instrument type or major capability is being
considered, note explicitly that it requires its own methodology evaluation in the
style of Quant Methodology §3 (comparative evaluation of approaches, not just a chosen
approach asserted) before implementation begins, per AGENTS.md §5.9's spirit of not
adding scope without a documented reason.

VERIFY: A concrete, re-scoped Phase 3 stage sequence exists, in this same prompt
format, ready to be run stage-by-stage like Phases 1 and 2 were.
```

---

## Document Map Reference

This guide operationalizes the Development Roadmap into literal, executable prompts. Every stage traces back to a specific Roadmap milestone (§2.1 for Stages 0–10, §3.1 for Stages 11–17, §4 for Stage 18) and every instruction inside each stage prompt traces back to a specific section of one of the other ten documents — nothing here introduces a new requirement that isn't already specified elsewhere in the BondFactor document set.
