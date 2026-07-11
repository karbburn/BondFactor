# BondFactor — Development Roadmap

**Document version:** 1.0
**Depends on:** All preceding documents
**Purpose:** Defines the dependency-driven implementation sequence, phase exit criteria, and hard gates referenced throughout the PRD and prior specs.

---

## 1. Governing Rule

Per the PRD's explicit design principle (§4, §12 risk table): **Phase 2 work does not start until Phase 1's exit criteria are met.** This is a hard gate, not a target — it exists specifically to counter the solo-developer scope-creep risk named in the PRD. Architecture is designed for the full platform from day one (all prior documents describe the complete system); implementation is not.

## 2. Phase 1 — Core Analytics Engine

**Goal:** A mathematically correct, fully tested, single-portfolio analytics engine — usable end-to-end even without authentication, persistence, or reporting.

### 2.1 Milestone Sequence (dependency order)

1. **Data source validation** — confirm actual FBIL and DBIE endpoint structure, stability, and content; this is explicitly the first engineering task, not an assumption (PRD §11, prior discussion). Build the manual CSV fallback path in parallel, since it's needed regardless of how milestone 1 resolves.
2. **Ingestion pipeline** — `fbil_client`, `dbie_client`, `manual_csv_loader`, `validators` (Backend Specification §3).
3. **`quant_core` foundation** — `conventions.py`, `cashflow.py` (Quant Methodology §7.1–7.2), with Layer 1 unit tests written alongside, not after.
4. **Curve fitting** — `nss.py`, `spline.py`, `calibration_validation.py`, `bootstrap.py` (Quant Methodology §3–6), unit-tested against synthetic known-truth curves.
5. **Pricing and risk core** — `pricing.py`, `risk.py` (Quant Methodology §7.3), unit-tested against hand-calculable cases.
6. **Scenario and KRD engines** — `scenario.py`, `krd.py` (Quant Methodology §8–9), including the internal DV01/KRD-sum consistency check (Quant Methodology §9, Testing Strategy §2).
7. **TypeScript pricing engine port** — `/lib/pricing-engine` (Frontend Specification §3), built function-by-function against the now-validated Python reference, with Layer 2 parity tests written per function as it's ported — not as a bulk exercise at the end.
8. **Phase 1 API endpoints** — `GET /curves/latest`, `GET /curves/{date}`, `GET /key-rate-tenors`, `GET /securities` (API Specification §2).
9. **Frontend Phase 1 surface** — landing/example portfolio, portfolio builder, curve explorer, pricing validation panel (Frontend Specification §1–2, journeys 1–3, 6).
10. **Golden reference validation** — source and document benchmark security reference values; run Layer 3 tests (Testing Strategy §4); resolve any unexpected discrepancy before considering Phase 1 complete.

### 2.2 Exit Criteria (all required)

- Ingestion pipeline runs nightly, unattended, with confirmed fallback behavior (tested per Testing Strategy §5, not just implemented).
- NSS calibration validation and cubic-spline fallback behave correctly on both good and deliberately bad synthetic input.
- Layer 1 unit tests pass for all `quant_core` functions.
- Layer 2 parity tests pass for every function in `/lib/pricing-engine` against its Python counterpart, within stated tolerances, as a CI-enforced gate.
- Layer 3 golden reference validation has been run against a real benchmark security set, with any discrepancy documented and understood (not merely "passing" — understood).
- A user can complete Journey 1 (first-time evaluation, under 60 seconds), Journey 2 (portfolio construction and analysis), Journey 3 (curve exploration), and Journey 6 (pricing validation) end-to-end in the deployed application.
- Scenario repricing latency meets the ~100ms target (PRD §10) on a representative 50-position portfolio.

**Only once all of the above are true does Phase 2 begin.**

## 3. Phase 2 — Platform Features

**Goal:** Persistence, multi-portfolio workflows, historical context, and reporting — built on top of a Phase 1 engine that is already known-correct, so Phase 2 work is purely additive (new endpoints, new UI, new tables) rather than revisiting core math.

### 3.1 Milestone Sequence

1. **Authentication** — Supabase Auth integration, login/session handling (Backend Specification §5, Frontend Specification `/login`).
2. **Historical data availability assessment** — the explicit validation task named in the PRD (§6, Journey 4): confirm what historical range FBIL/DBIE actually provide reliably before building anything that promises a specific historical range. This may conclude that historical coverage starts from BondFactor's own launch date going forward, which is an acceptable, honestly-stated outcome (PRD §7.7).
3. **Portfolio persistence** — `portfolios`, `portfolio_positions` tables and endpoints (Database Schema §3, API Specification §3), RLS enabled before any real user data is stored.
4. **Multi-portfolio management and comparison** — build on top of the persistence layer once single-portfolio save/load is confirmed working.
5. **Historical curve archive and replay** — contingent on milestone 2's findings; scoped honestly to whatever range is actually available.
6. **Reporting engine** — `/reports/generate`, PDF/Excel export (API Specification §3, System Design §4.3), built for single-portfolio/single-or-multi-scenario reports first, with the architecture (already specified) supporting comparative reports without redesign later.
7. **Saved custom scenarios** — `saved_scenarios` (lower priority within Phase 2; a convenience feature, not a core workflow).

### 3.2 Exit Criteria

- A user can create an account, save multiple portfolios, and reload them across sessions.
- RLS is confirmed (tested, not just enabled) to prevent cross-user data access.
- Historical replay, if built, accurately states its actual coverage range in the UI at all times.
- Report export produces a correct, independently-server-recomputed (not client-trusted) document matching System Design §4.3.

## 4. Phase 3 — Advanced Analytics (Indicative)

**Goal:** Deepen analytical sophistication once the full platform is stable and in genuine use (even if "use" means the developer's own regular use as a portfolio/interview artifact).

Indicative scope, not committed in detail until Phase 2 is complete and its learnings can inform prioritization:

- Historical scenario calibration (using archived historical curves to calibrate realistic scenario magnitudes — PRD §7.7, an idea flagged early in scoping discussion).
- Advanced risk attribution beyond the current position-level contribution breakdown.
- Performance optimization informed by real usage patterns rather than speculative bottlenecks.
- Expanded visualization.
- Consideration (not commitment) of additional instrument types, explicitly bounded by the same "correctness before breadth" principle that governed the Phase 1 exclusion of derivatives and short positions — any addition here would require its own methodology evaluation in the style of Quant Methodology §3, not a shortcut.

## 5. Effort Sequencing Note

No fixed calendar timeline is imposed here, consistent with the earlier decision that this is a complete-product-not-MVP project sequenced by dependency rather than deadline. Phase 1 is by far the largest and most rigor-intensive phase — the milestone sequence in Section 2.1 is intentionally granular so progress is visible and each piece is validated before the next depends on it, rather than the whole engine being built and tested as one large, hard-to-debug unit.

## 6. Document Map Reference

This roadmap is the final document in the set; every exit criterion referenced here points back to a specific section of the PRD, Quant Methodology, System Design, API Specification, Frontend Specification, Backend Specification, or Testing Strategy documents — nothing in this roadmap introduces a new requirement that isn't already specified elsewhere.
