# BondFactor — Testing Strategy

**Document version:** 1.0
**Depends on:** Quantitative Methodology Specification v1.0, Backend Specification v1.0, Frontend Specification v1.0

---

## 1. Guiding Principle

Consistent with the project's "financial correctness over feature count" principle, testing is not treated as a coverage-percentage exercise. It exists to answer three separate, increasingly strict questions: does each function work in isolation, does the production (TypeScript) implementation match the reference (Python) implementation, and does the reference implementation itself match reality. These map to the three layers below, each with a distinct purpose and none substituting for the others.

## 2. Layer 1 — Unit Testing

**Purpose:** Verify every mathematical function in `quant_core` (Backend Specification §2) in isolation, against hand-computable or independently derivable expected values.

**Coverage targets:**
- Cashflow schedule generation — correct coupon dates/amounts and redemption for a range of coupon frequencies, issue/maturity date combinations, including edge cases (odd first coupon period, maturity falling exactly on a coupon date).
- Day-count / accrued interest calculation under Actual/Actual — verified against manually computed reference cases across multiple date ranges, including leap years.
- Discount factor generation and zero-rate conversion.
- NSS evaluation (given fixed parameters, does the model produce the expected yield at a given tenor) — separate from calibration, which is tested independently below.
- NSS calibration — fit against a synthetic, known-truth par curve (generated from a chosen set of NSS parameters plus small noise) and confirm the optimizer recovers parameters close to the known input.
- Cubic spline fit and evaluation.
- Bootstrap correctness — given a known par curve, confirm the bootstrapped zero curve, when used to reprice the same par instruments, reproduces their par yields to a tight tolerance (an internal consistency check, not just a golden-value check).
- Duration, DV01, convexity — verified against hand-calculated values for simple test bonds (e.g., a single-cashflow zero-coupon bond, where duration equals maturity by construction, is a useful sanity check).
- KRD — verified that the sum of KRD bucket sensitivities approximately reconciles with total parallel DV01 for a test portfolio (Quant Methodology §9's stated internal consistency check).
- Calibration validation logic — explicitly tested with deliberately bad/noisy synthetic input to confirm it correctly triggers the fallback path, not just tested on well-behaved data where it trivially passes.

**Tooling:** `pytest` for the Python `quant_core` package; equivalent test runner (e.g., `vitest`) for the TypeScript `/lib/pricing-engine` package, run independently of Layer 2.

## 3. Layer 2 — Python ↔ TypeScript Parity Testing

**Purpose:** Confirm the production TypeScript implementation matches the validated Python reference implementation, function for function, within defined tolerances (Quant Methodology §10).

**Tolerances (CI-enforced, hard gate):**
- Yield: within 0.1 basis points
- Price: within ₹0.01 per ₹100 face value
- Duration, DV01, Convexity, KRD: tolerance defined per metric based on its numerical derivation method (e.g., bump-and-reprice-derived metrics inherit a tolerance proportional to the price tolerance above and the bump size used)

**Methodology:**
- A shared set of fixture inputs (NSS parameter sets, portfolios, scenario configurations) is maintained in a source-of-truth format (JSON) consumed by both the Python and TypeScript test suites, so both languages are tested against identical inputs rather than separately-authored, potentially-divergent test cases.
- For each fixture, both implementations compute the full pipeline (bootstrap → cashflow → price → risk → scenario/KRD) and results are diffed against the tolerances above.
- Any new function added to either `quant_core` or `/lib/pricing-engine` requires a corresponding parity test before merge — this is enforced as a CI check, not a code review reminder.
- Parity testing covers both the base-case curve and scenario-shocked curves, since the scenario shock path (System Design §2) is where the client-side bootstrap is actually exercised.

**On failure:** CI blocks the merge. There is no "acceptable known divergence" override — a failing parity test means either a genuine bug or a tolerance that needs re-justifying, not a check to be silenced.

## 4. Layer 3 — Golden Reference Validation

**Purpose:** Confirm the Python reference implementation itself is correct relative to observable market reality, not just internally consistent with its own TypeScript port.

**Methodology:**
- A curated set of benchmark G-Secs is selected for which independently verifiable market values (traded clean price, YTM) are obtainable — from FBIL/DBIE published data, exchange-reported trade data, or other publicly available authoritative sources.
- For each, BondFactor's calculated clean price and YTM (off the corresponding date's fitted curve) are compared against the reference value, with the expected discrepancy magnitude and cause documented explicitly — recall (Quant Methodology §7.2, PRD §9) that BondFactor prices assume default-free, liquidity-agnostic valuation, so small deviations from actual traded prices are expected, not evidence of a bug, provided they fall within a plausible bid-ask/liquidity-premium range for that security.
- Where an authoritative reference value cannot be sourced for a given test case, a manually verified calculation (worked by hand or cross-checked against a second independent tool) is used instead, and this is documented transparently as such rather than presented as an official market reference.
- This layer directly powers the Pricing Validation user journey (PRD Journey 6) — the same reference cases used for internal validation are the ones surfaced to the user in `PricingValidationPanel` (Frontend Specification §5).

**Coverage:** At minimum, one reference case per benchmark tenor point on the standard curve (short, medium, long maturity), to confirm accuracy isn't concentrated at one part of the curve only.

## 5. Integration and Pipeline Testing

Beyond the three core layers, the ingestion and calibration pipeline is tested end-to-end using mocked source responses:

- **Ingestion fallback testing:** simulate an FBIL failure and confirm the pipeline correctly falls through to DBIE, and simulate both failing to confirm the manual-CSV-flag and alert path triggers correctly.
- **Calibration fallback testing:** feed the calibration job deliberately malformed or economically implausible synthetic par data and confirm it correctly falls back to cubic spline, raises an alert, and preserves the prior valid NSS calibration rather than overwriting it.
- **Data validation testing:** confirm the validators reject incomplete or out-of-bounds raw observations before they reach curve fitting.

## 6. CI/CD Pipeline

```
On pull request:
  1. Run Layer 1 unit tests (Python + TypeScript), fail fast on any failure
  2. Run Layer 2 parity tests against shared fixtures, fail fast on tolerance breach
  3. Run integration/pipeline tests against mocked ingestion sources
  4. (Golden reference tests run on a slower cadence — see below — not on every PR, since reference values don't change per-commit)

On merge to main:
  5. Deploy frontend (Vercel) and backend (Render) automatically

On a scheduled cadence (e.g., monthly, or whenever the golden reference set is updated):
  6. Run Layer 3 golden reference validation and report results, since this depends on external reference data rather than code changes
```

## 7. Test Data Management

- Layer 1/2 fixtures (synthetic NSS parameter sets, synthetic portfolios) are versioned in the repository alongside the code they test.
- Layer 3 golden reference values are stored separately with clear provenance (source, date retrieved, retrieval method) so they can be refreshed or audited independently of the codebase's own test fixtures.

## 8. Document Map Reference

This strategy operationalizes Quant Methodology §5 (calibration validation), §10 (parity tolerances), and PRD Journey 6 (pricing validation), and is implemented against the module structure defined in the Backend Specification and Frontend Specification.
