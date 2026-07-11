# AGENTS.md

Behavioral guidelines for any coding agent (Claude Code, or any other AGENTS.md-compatible tool) working on BondFactor. Merge with any tool-specific instructions as needed; this file is intentionally tool-agnostic so it works whether or not Claude Code specifically is in use.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. Project-Specific Guidelines (BondFactor)

These extend, and take precedence over conflicts with, the general guidelines above — BondFactor is a project where an "overcomplicated" flag from Section 2 can be a false positive if what looks like unnecessary structure is actually a correctness requirement from the Quant Methodology or Testing Strategy documents. When in doubt, check the relevant doc (listed in each rule below) before simplifying.

### 5.1 Financial correctness overrides "simplicity first"
Section 2's "minimum code that solves the problem" does not license skipping calibration validation, cashflow-schedule-based pricing, or explicit convention handling, even if a shortcut would produce a numerically close answer for a specific test case. If a simpler implementation would bypass a check defined in the Quant Methodology document (e.g., calibration diagnostics, Actual/Actual day count, T+1 settlement), that is not a valid simplification — flag it and implement the documented approach, or ask if you believe the documented approach is genuinely wrong.

### 5.2 One reference implementation, always
Every pricing/risk function has exactly one source of truth: the Python `quant_core` package (Backend Specification §2). Never implement new pricing or risk logic directly in TypeScript first, or in isolation, without a corresponding Python reference existing already or being added in the same change. If asked to add a new calculation, implement it in `quant_core` first, write its Layer 1 unit test, then port to `/lib/pricing-engine` with a Layer 2 parity test — in that order, not in parallel and not TS-first.

### 5.3 Never derive KRD from scenario shocks, or vice versa
`scenario.py` / `scenario.ts` (NSS factor shocks) and `krd.py` / `krd.ts` (local zero-curve tenor bumps) are intentionally independent, per Quant Methodology §9. Do not refactor one to call the other, share a perturbation function, or "simplify" by unifying them, even if the code looks duplicative. This duplication is deliberate and documented, not an oversight — see Section 3's rule against refactoring things that aren't broken.

### 5.4 Conventions live in one place
Day-count, settlement, and coupon-frequency logic belongs only in `conventions.py` (backend) and `conventions.ts` (frontend) — Backend Specification §1, Frontend Specification §3. If you find yourself writing a date-math or settlement calculation anywhere else, stop and route it through the conventions module instead, even for a one-off script.

### 5.5 Calibration and ingestion failures are never silent
Any change touching `ingestion/` or the calibration job must preserve the fail-loudly behavior in System Design §6 and Backend Specification §4: log the failure, raise an alert, fall back (cubic spline / prior valid calibration), never let a bad or low-confidence curve pass through to pricing without a visible flag. Do not add a `try/except: pass` or equivalent swallow anywhere in this path.

### 5.6 Don't build ahead of the current phase
Per the Development Roadmap's hard gate: do not implement Phase 2 features (auth, persistence, multi-portfolio, reporting, historical replay) while Phase 1 exit criteria are unmet, even if a task nominally touches a Phase 2 file. If a request seems to require jumping ahead, say so explicitly and ask whether the phase gate should be crossed, rather than quietly doing it.

### 5.7 No browser storage for portfolio or pricing state
Per Frontend Specification §4/§6: portfolio state, scenario configuration, and computed results live in React context (in-memory) only. Never introduce `localStorage` or `sessionStorage` for this data, even as a "quick" persistence fix before Phase 2 auth exists.

### 5.8 Historical/versioned data is append-only
Tables like `curve_calibrations` and `raw_par_yield_observations` (Database Schema §2) are never overwritten or deleted by application code — a new calibration is a new row, not an update to a prior date's row. If a task seems to require modifying historical data, stop and ask; this is very likely a sign of a misunderstanding, not a legitimate need.

### 5.9 New dependencies need a reason tied to free-tier constraints
Given the project's free-tier infrastructure commitment (Deployment Guide §1), avoid adding a new library, service, or paid API without first checking whether `quant_core` / `/lib/pricing-engine` / existing stack (FastAPI, Next.js, Supabase, GitHub Actions) already covers the need. Flag any addition that would push a component off its free tier.

### 5.10 When a doc and the code disagree, the doc wins — but say so
If implementation reveals that a documented approach (in the PRD, Quant Methodology, or any spec) doesn't actually work as written, do not silently deviate. Implement what's documented, or stop and flag the discrepancy explicitly so the relevant document can be updated deliberately — undocumented drift between the specs and the codebase is exactly what this project's auditability principle is designed to prevent.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, financial calculations never bypass `quant_core`/parity testing, phase boundaries are respected without being asked each time, and clarifying questions come before implementation rather than after mistakes.
