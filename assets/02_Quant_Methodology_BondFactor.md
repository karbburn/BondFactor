# BondFactor — Quantitative Methodology Specification

**Document version:** 1.0
**Depends on:** Product Requirements Document v1.1
**Feeds into:** System Design & Architecture, Database Schema, API Specification, Testing Strategy

---

## 1. Purpose and Scope

This document defines the complete quantitative framework underlying BondFactor: how the yield curve is constructed, how bonds are priced off it, how risk measures are computed, how yield curve scenarios are defined and applied, and how Key Rate Duration is computed independently of the scenario framework.

Every major modeling decision in this document is presented alongside the alternatives that were considered and rejected, and the reasoning is grounded in BondFactor's specific constraints — not in a claim that the chosen approach is universally correct. Section 3 in particular is written as a comparative evaluation, not a justification-after-the-fact.

## 2. Data Foundation

FBIL (Financial Benchmarks India Ltd.) publishes a **daily benchmark par yield curve** for Indian Government Securities — a sparse set of yields at fixed benchmark tenors (e.g., 91-day, 1Y, 2Y, 5Y, 10Y, and other standard points), not a dense continuum and not zero-coupon rates. This single fact — sparse, par-yield, benchmark-tenor input — is the primary constraint that shapes the curve construction methodology chosen in Section 3.

There is no liquid, actively quoted zero-coupon G-Sec market in India (unlike, for example, the US Treasury STRIPS market). Any zero curve used by BondFactor is therefore necessarily *derived*, not directly observed.

## 3. Curve Construction: Comparative Evaluation of Approaches

Five distinct workflows for getting from observed market data to a usable discounting curve were evaluated. Each is assessed on the same criteria: required inputs, mathematical assumptions, advantages, limitations, computational complexity, typical industry use case, and applicability to BondFactor specifically.

### 3.1 Approach 1 — Bootstrap First, Fit Afterward

**Required inputs:** Par yields (or bond prices) at every maturity needed to solve the bootstrap recursively, ideally a dense set of liquid points.

**Mathematical assumptions:** Assumes each successive zero rate can be solved given all shorter zero rates already bootstrapped, which in turn assumes cashflow-paying instruments (or interpolated par yields) exist at each maturity point along the way.

**Advantages:** The initial zero rates obtained are tied directly to actual bootstrap mechanics before any smoothing model is applied, so the raw shape isn't influenced by a parametric assumption at the point of derivation.

**Limitations:** With a sparse tenor grid like FBIL's, bootstrapping from one benchmark point to the next requires *interpolating between quoted par yields* to obtain the intermediate points the recursion needs — meaning an interim curve assumption is required before the "raw" bootstrap can even proceed. This defeats the supposed advantage of avoiding a parametric assumption; it just moves the assumption earlier and makes it implicit rather than explicit. Bootstrap error is also additive — errors at each step propagate into every subsequent step — and the resulting zero curve is typically jagged enough that it still needs smoothing afterward, at which point you've done the work of Approach 2 anyway, with an extra source of error along the way.

**Computational complexity:** Low per step (sequential, closed-form at each point), but requires an interpolation or optimization sub-step wherever the tenor grid has gaps, which adds hidden complexity that isn't reflected in the "simple bootstrap" framing.

**Typical industry use case:** Common in markets with a genuinely dense set of liquid instruments across the curve — e.g., USD interest rate swap/OIS curve construction, where enough liquid tenor points exist that gap-filling interpolation is a minor, well-understood step rather than the dominant source of curve shape.

**Applicability to BondFactor:** Not selected. FBIL's benchmark tenor grid is sparse by design (it publishes at fixed standard points, not a continuum of liquid instruments), so this approach would require an ad hoc interpolation crutch before bootstrapping even begins — worse, not better, than fitting a smooth model to the sparse data directly.

### 3.2 Approach 2 — Fit First, Bootstrap Afterward *(chosen)*

**Required inputs:** Par yields at whatever benchmark tenors are published — works with a sparse point set since NSS has only six free parameters.

**Mathematical assumptions:** Assumes a parametric functional form (Nelson-Siegel-Svensson, see Section 4) is a reasonable descriptor of the true continuous par curve between and beyond the observed benchmark points.

**Advantages:** Handles sparse data gracefully — a six-parameter model is well-identified even from a handful of tenor points. Produces a continuous, well-behaved par curve first, so the subsequent bootstrap to a zero curve is a clean, well-defined operation with no ad hoc gap-filling required. Smoothing happens exactly once, upstream of discounting, so the resulting zero curve inherits a single, traceable, defensible shape. Critically for BondFactor specifically: the fitted model's parameters (level, slope, curvature, and a second curvature term) are directly and separately interpretable — which is exactly the structure the scenario engine needs to define parallel shift, steepener, flattener, twist, and butterfly as parameterized factor shocks (Section 6).

**Limitations:** Any calibration error in the initial par fit propagates through bootstrapping into every downstream price and risk number — the fitted par curve is a model construct, not raw market data, so pricing is only ever as good as fit quality. This is mitigated, not eliminated, by the calibration diagnostics and goodness-of-fit checks defined in Section 5.

**Computational complexity:** One moderate nonlinear optimization to fit NSS (small parameter count, converges quickly in practice), followed by one cheap, closed-form bootstrap pass. This is well within the budget of a nightly batch job on free-tier infrastructure.

**Typical industry use case:** Widely used for government bond and central bank yield curve publication specifically because sovereign bond markets are naturally quoted and observed in par-yield terms at a limited set of benchmark maturities, which is structurally the same situation BondFactor faces with FBIL data.

**Applicability to BondFactor — why this was selected:** This is the only approach that matches the actual shape of the available input (sparse par yields, not zero rates, not dense liquid points) without requiring either an unsound approximation or an implicit, undocumented interpolation assumption. It also uniquely serves three other BondFactor-specific requirements simultaneously: (1) the scenario engine's factor-shock design depends on having an interpretable, low-dimensional curve representation; (2) the client-side repricing architecture requires a curve model cheap enough to reimplement faithfully in TypeScript and re-evaluate instantly on every slider interaction; (3) the project's educational and practitioner-facing goals are better served by a transparent, explainable two-stage process (fit, then bootstrap, each independently diagnosable) than by a more opaque or tightly coupled alternative. This is a decision grounded in these specific constraints, not a claim that fit-then-bootstrap is the only valid approach in general.

### 3.3 Approach 3 — Direct Zero-Curve Fitting

**Required inputs:** Genuine zero-coupon rate observations, or par yields pre-converted to approximate zero rates through some transform.

**Mathematical assumptions:** Either assumes a liquid zero-coupon instrument market exists (it doesn't for Indian G-Secs), or assumes an approximation such as treating short-maturity par yields as approximately equal to zero rates — which is only reasonable at very short maturities and becomes progressively less sound as maturity and coupon reinvestment effects increase.

**Advantages:** If genuine zero-coupon data existed, this would be the most direct route, with no bootstrap-induced propagation of fitting error into discounting.

**Limitations:** No such market exists in India. Forcing this approach onto par-yield data would require a mathematically unsound shortcut precisely at the maturities where it matters most.

**Computational complexity:** Comparable to NSS fitting otherwise, but the required pre-processing step to fabricate zero-rate inputs is itself a source of unquantified error.

**Typical industry use case:** Markets with a genuinely traded zero-coupon instrument set (e.g., US Treasury STRIPS) or effectively zero-rate-based curves by construction (certain OIS-discounted swap curves).

**Applicability to BondFactor:** Not selected. There is no sound, data-grounded way to obtain zero-rate inputs directly from what FBIL publishes; adopting this approach would violate the project's stated principle of correctness over convenience.

### 3.4 Approach 4 — Joint Estimation

**Required inputs:** Par yields, fit using a single unified optimization that parametrizes the discount/zero curve directly and derives implied par yields from that same parametrization within the objective function (collapsing "fit" and "bootstrap" into one simultaneous step).

**Mathematical assumptions:** Assumes the discount function is fully and consistently determined by one parametric family throughout, and that implied par yields can be computed from the model parameters at each optimization iteration (itself a nested present-value calculation for coupon-paying instruments).

**Advantages:** Avoids the two-stage error propagation of fit-then-bootstrap, since there is no separate downstream bootstrap step to introduce additional error. Theoretically elegant as a single, internally consistent estimation.

**Limitations:** Substantially more computationally expensive — each optimizer iteration requires an inner present-value calculation across all instruments rather than a closed-form fit, since the objective is now a function of the model's own implied bond prices. Harder to diagnose: because fitting and discounting are coupled in a single step, a bad output doesn't clearly indicate whether the fit or the discounting logic is at fault. This directly works against BondFactor's non-functional requirement for auditability and modularity (Section 8 of the PRD) — being able to inspect and validate curve-fit quality independently from bootstrap/discounting quality.

**Computational complexity:** Highest of the five approaches — nested optimization, not well suited to a lightweight nightly batch job on free-tier infrastructure (Render).

**Typical industry use case:** Seen in more sophisticated institutional term-structure estimation procedures (e.g., some central bank or BIS-style approaches to jointly estimating discount curves directly from coupon bond prices), typically where dedicated computational infrastructure and a research team's time budget are less constrained.

**Applicability to BondFactor:** Not selected. The marginal accuracy gain over fit-then-bootstrap is not established to be meaningful for benchmark G-Sec par data specifically, while the cost — in computational budget, debuggability, and architectural modularity — is real and directly conflicts with stated project requirements.

### 3.5 Approach 5 — Discount-Factor-Space Fitting (e.g., Smith-Wilson)

**Required inputs:** Par or zero yields at liquid points, plus an externally chosen **Ultimate Forward Rate (UFR)** that the curve is constrained to converge toward beyond the last liquid point.

**Mathematical assumptions:** Fits directly in discount-factor space rather than yield space, and assumes the long end of the curve should smoothly converge to a supervisory or theoretically motivated long-run rate (the UFR) rather than being purely market-data-driven beyond the last liquid observation.

**Advantages:** Produces excellent, well-behaved long-end extrapolation by construction — the curve is guaranteed to converge smoothly to the chosen UFR, avoiding the occasional long-end instability that NSS-family models can exhibit when long-maturity data is sparse or noisy. Mathematically guarantees smooth discount factors and forward rates.

**Limitations:** The UFR is an externally assumed, regulatory or supervisory input — not something derived from the market data itself — which sits uneasily with BondFactor's principle of grounding every curve entirely in what FBIL actually publishes. The resulting parameters are not interpretable in the level/slope/curvature sense that NSS provides, which weakens their usefulness for BondFactor's factor-shock scenario engine specifically — Smith-Wilson would require a separate, additional mechanism to define parallel/steepener/flattener/twist/butterfly shocks, since the model's own parameters don't map onto those concepts the way NSS's do.

**Computational complexity:** Moderate — once a UFR is fixed, fitting reduces to a linear system, which can be less computationally demanding than NSS's nonlinear optimization. This is a genuine advantage of the approach, on its own terms.

**Typical industry use case:** The dominant approach in European insurance regulatory curve construction (Solvency II), where the explicit goal is a stable, market-manipulation-resistant discounting curve for long-dated liability valuation under a supervisory framework — not a general-purpose market risk or trading curve.

**Applicability to BondFactor:** Not selected. BondFactor's purpose is descriptive and analytical — showing how the actual observed market curve behaves and how that behavior propagates into portfolio risk — not regulatory liability discounting. Introducing an externally assumed UFR would be inconsistent with that purpose, and losing direct level/slope/curvature interpretability would weaken the platform's most differentiated capability, the scenario engine. This is a strong, well-regarded approach in its native context; it is simply not a fit for what BondFactor is trying to do.

### 3.6 Summary Comparison

| Approach | Input requirement | Key strength | Key weakness for BondFactor | Selected? |
|---|---|---|---|---|
| Bootstrap → Fit | Dense liquid points | Ties raw curve to actual instruments | Sparse FBIL grid forces hidden interpolation before bootstrap even starts | No |
| **Fit → Bootstrap** | **Sparse par yields (matches FBIL)** | **Interpretable factors; matches sparse par-yield input; cheap enough for client-side reimplementation** | **Fit error propagates downstream (mitigated by diagnostics)** | **Yes** |
| Direct zero-curve fitting | Genuine zero-rate data | Most direct, if data existed | No liquid zero-coupon G-Sec market exists in India | No |
| Joint estimation | Par yields, nested optimization | No separate bootstrap error stage | High computational cost; hard to diagnose; conflicts with modularity requirement | No |
| Discount-factor-space (Smith-Wilson) | Liquid points + assumed UFR | Excellent, stable long-end extrapolation | UFR is externally assumed, not market-derived; parameters aren't factor-shock-friendly | No |

**Conclusion:** Fit-first-then-bootstrap was chosen because it is the approach that best matches FBIL's actual data shape (sparse par yields), best serves BondFactor's scenario engine (interpretable factors), best fits the client-side interactive architecture (cheap, closed-form, portable to TypeScript), and best serves the project's transparency goals (two independently diagnosable stages). It is not presented as the universally correct choice — Approaches 1 and 5 in particular are the right choice in their own native contexts (dense liquid swap markets, and regulatory liability discounting, respectively).

## 4. Curve Fitting Models

### 4.1 Nelson-Siegel-Svensson (primary model)

NSS models the instantaneous forward rate curve as a sum of a level term, a slope (exponential decay) term, and two curvature (hump-shaped) terms, integrated to produce a yield curve with six free parameters: β₀ (level), β₁ (slope), β₂ and β₃ (two curvature components), and τ₁, τ₂ (decay-rate parameters governing where each curvature hump is centered).

NSS is fit to the observed FBIL par yields by nonlinear least squares, minimizing the sum of squared differences between model-implied par yields and observed par yields across the benchmark tenor grid.

### 4.2 Cubic Spline (secondary model / fallback)

A piecewise cubic polynomial interpolation fit exactly through the observed benchmark par yield points. Used for two purposes: (a) as a comparison curve alongside NSS so a user can see where the parametric model diverges from a pure interpolant, and (b) as the automatic fallback curve when NSS calibration fails validation (Section 5).

Cubic spline is not used as the primary model because it passes exactly through noisy data points (no smoothing), has no interpretable parameters for the scenario engine, and can produce unstable extrapolation beyond the longest observed tenor — all of which make it a poorer fit for BondFactor's needs than NSS, despite being simpler to compute.

### 4.3 Why NSS Over Plain Nelson-Siegel or Monotone-Convex Interpolation

Two further alternatives deserve a brief note, beyond the five curve-construction *workflows* compared in Section 3 — these are alternative *fitting models* within the "fit-then-bootstrap" workflow:

- **Plain Nelson-Siegel (4-factor)** — the predecessor to NSS, with a single curvature term instead of two. It is more parsimonious (fewer parameters, less overfitting risk on very sparse data) but less flexible at capturing curves with two humps or a more complex mid-curve shape, which the Indian G-Sec curve has exhibited at various points. NSS was chosen over plain NS for the additional flexibility, accepting the small added estimation risk that comes with two more free parameters — mitigated by the calibration diagnostics in Section 5.
- **Monotone Convex / monotone-preserving splines** — designed to guarantee no spurious oscillation in forward rates, a genuine weakness of plain cubic splines. These were not adopted as the primary model because, like cubic spline, they don't produce the interpretable level/slope/curvature parameters the scenario engine depends on. They remain a reasonable candidate for a future, more robust fallback model if cubic spline proves insufficiently stable in practice (Section 9).

## 5. Calibration Validation, Diagnostics, and Fallback

Every NSS calibration is validated before being accepted into the pipeline. Validation checks include:

- **Optimization convergence** — the solver reached a valid local minimum rather than exiting on iteration/timeout limits.
- **Parameter plausibility** — β and τ values fall within economically sane bounds (e.g., τ values that would place curvature humps at implausible maturities are rejected).
- **Goodness-of-fit** — the residual error between the fitted par curve and each observed benchmark yield is computed and reported; a fit exceeding a defined residual tolerance is flagged even if the optimizer nominally converged.
- **Day-over-day parameter stability** — a large, discontinuous jump in fitted parameters relative to the previous trading day's calibration is flagged for review, since genuine market moves are rarely instantaneous discontinuities in curve shape.
- **Smoothness and absence of numerical instability** — checks for implausible forward-rate oscillation or non-monotonic behavior inconsistent with observed market conditions.

**On failure:** the pipeline logs the failure, raises an operational alert, falls back to cubic spline for that trading day's curve, and preserves the last successful NSS calibration for historical continuity rather than overwriting it with a rejected fit. This logic is detailed further in the System Design document; it is stated here because it is a quantitative correctness requirement, not just an operational one.

All calibration diagnostics (residual error, parameter stability delta, convergence status) are stored alongside the fitted curve and are surfaced in the UI, not hidden — consistent with the PRD's auditability requirement.

## 6. Bootstrapping the Zero Curve

Given a validated, continuous fitted par curve (NSS or its cubic-spline fallback), the zero-coupon discount curve is derived by standard bootstrapping: solving iteratively, from the shortest maturity outward, for the discount factor at each maturity that correctly prices a par bond of that maturity given the discount factors already solved at shorter maturities. Because the par curve is now continuous (a direct benefit of Section 3's chosen workflow), this bootstrap requires no ad hoc interpolation — par yields are available at any maturity the bootstrap needs, taken directly from the fitted curve.

The resulting zero curve is the sole discounting curve used for all bond pricing (Section 7) and Key Rate Duration (Section 9). It is cached server-side after the nightly fitting/bootstrapping job and shipped to the client for interactive use.

## 7. Bond Pricing and Market Conventions

### 7.1 Cashflow Schedule Generation

Every priced position has an explicit, inspectable cashflow schedule generated from its coupon rate, coupon frequency, issue date, and maturity date — a list of coupon payment dates and amounts plus the final redemption amount. This schedule is the direct input to pricing; nothing is priced from a shortcut formula that bypasses explicit cashflows.

### 7.2 Conventions

Centralized in a single pricing-conventions module (per the PRD's maintainability requirement):

- **Coupon frequency:** Semi-annual, standard for Indian Government Securities.
- **Day-count convention:** Actual/Actual, the standard convention for accrued interest calculation on Indian G-Secs.
- **Settlement:** T+1, reflecting the prevailing Indian G-Sec secondary market settlement cycle.
- **Credit assumption:** All securities are treated as default-free sovereign obligations. No credit spread, liquidity premium, or bond-specific richness/cheapness adjustment relative to the fitted curve is modeled (see PRD Sections 9 and 11). This means BondFactor's calculated price may differ from a bond's actual observed traded price for reasons — liquidity, on-the-run/off-the-run status, demand-supply technicals — that the platform does not attempt to capture. This is a stated model limitation, not an error, and is precisely what the Pricing Validation user journey (PRD Journey 6) is designed to make visible rather than hide.

### 7.3 Pricing and Risk Formulas

- **Clean price:** Present value of all future cashflows, discounted off the bootstrapped zero curve, excluding accrued interest.
- **Dirty price:** Clean price plus accrued interest since the last coupon date (Actual/Actual).
- **Yield to Maturity (YTM):** The single discount rate that equates the discounted cashflows to the dirty price; solved numerically.
- **Macaulay Duration:** The cashflow-weighted average time to receipt of a bond's cashflows.
- **Modified Duration:** Macaulay duration adjusted for the bond's yield and compounding frequency; approximates percentage price sensitivity to a 1% yield change.
- **DV01:** The absolute price change for a 1 basis point parallel shift, computed via bump-and-reprice against the zero curve (bump the entire zero curve by 1bp, reprice, take the difference) rather than a duration-derived approximation, so it remains accurate for larger convexity effects.
- **Convexity:** The second derivative of price with respect to yield, computed numerically via a symmetric bump-and-reprice (up and down) around the base zero curve.

## 8. Scenario Engine: Factor-Based Curve Deformation

Scenarios are defined as parameterized shocks to the **fitted NSS factors**, not as arbitrary changes at individual tenor points. This is a deliberate design choice consistent with Section 3's conclusion: since the curve is represented by interpretable level/slope/curvature parameters, scenario deformation should operate in that same parameter space.

- **Parallel Shift:** Uniform shock to the level parameter (β₀).
- **Steepener / Flattener:** Shock to the slope parameter (β₁) in the direction that increases or decreases the long-short yield differential.
- **Twist:** A combined shock that changes slope while approximately preserving the curve's level at a defined pivot maturity.
- **Butterfly:** Shock to the curvature parameters (β₂, β₃), changing the belly of the curve relative to the wings without materially changing the overall level or slope.
- **Custom:** Any combination of the above factor shocks, independently and simultaneously adjustable by magnitude.

After a scenario's factor shocks are applied to the base NSS parameters, the resulting curve is a new, complete NSS par curve — which is bootstrapped to a new zero curve (client-side, using the same bootstrap logic as Section 6) and used to reprice the portfolio and derive scenario P&L and risk-contribution-by-position.

## 9. Key Rate Duration: An Independent Methodology

KRD is deliberately **not** derived from the NSS factor-shock framework used for scenario P&L. The scenario engine answers "how does my portfolio respond to an economically meaningful curve movement." KRD answers a different question — "where on the curve does my portfolio's risk actually sit" — and conflating the two would produce a metric that looks like KRD but doesn't match its market-standard definition.

**Methodology:**
1. Define a fixed set of key-rate tenors, sourced dynamically from the same benchmark tenor grid FBIL publishes (rather than a hardcoded academic grid), so the KRD buckets always match the market's own observable structure.
2. For each key-rate tenor, apply a local 1bp bump to the **zero curve directly** (not to NSS parameters) at that tenor, tapering linearly to zero at the neighboring key-rate tenors, leaving all other key rates unchanged.
3. Reprice every bond in the portfolio off this locally perturbed zero curve.
4. Compute the numerical sensitivity (price change per bond and aggregated per portfolio) attributable to that single key rate.

This produces a vector of tenor-bucketed sensitivities that sum, approximately, to the portfolio's total parallel DV01 — a useful internal consistency check between the two independent risk measures.

The client-side pricing engine therefore implements **two distinct, independent perturbation mechanisms**: NSS factor-space shocks for the scenario engine, and local zero-curve tenor bumps for KRD. This is more implementation work than deriving one from the other, and is retained anyway because it is the methodologically correct separation.

## 10. Python ↔ TypeScript Parity

Python is the quantitative reference implementation for every function described in this document — curve fitting, bootstrapping, pricing, all risk measures, both scenario and KRD perturbation mechanisms. The production client-side engine is a native TypeScript reimplementation, validated against the Python reference through automated parity tests with the following tolerances, enforced as a CI gate:

- Yield differences: within 0.1 basis points
- Price differences: within ₹0.01 per ₹100 face value
- Duration, DV01, Convexity, and KRD: tolerance appropriate to floating-point numerical methods, defined precisely in the Testing Strategy document

Any deviation beyond these thresholds fails CI. No production risk number is trusted until its TypeScript implementation has passed parity against the Python reference for the corresponding function.

## 11. Model Assumptions and Limitations

Stated explicitly, consistent with the project's principle of documenting limitations rather than implying universal correctness:

- **NSS was chosen over Smith-Wilson, monotone-convex splines, and joint/direct-fitting approaches** for the specific reasons detailed in Sections 3 and 4 — primarily interpretability for the scenario engine and fit to FBIL's sparse par-yield data shape. In a different context (e.g., regulatory liability discounting, or a market with dense liquid zero-coupon instruments), a different approach would be preferable, and Section 3 says so explicitly.
- **All pricing assumes default-free sovereign securities.** No credit, liquidity, or bond-specific basis is modeled. Actual traded prices may differ from BondFactor's calculated prices for reasons outside this scope.
- **NSS can exhibit long-end instability** on sparse or noisy data — mitigated, not eliminated, by the calibration diagnostics and cubic-spline fallback in Section 5.
- **The zero curve is a derived, model-dependent construct**, not a directly observed market curve, because no liquid zero-coupon G-Sec market exists in India. Every price and risk number in the platform is therefore only as accurate as the upstream curve fit.
- **Scenario shocks are constrained to the NSS factor space by design.** This preserves interpretability and mathematical consistency but means BondFactor cannot represent an arbitrary, non-factor-shaped curve movement as a "scenario" — only as a historical replay (if the actual observed curve for that day is available) or as a KRD-style local bump (which is a different analytical tool, not a scenario P&L).
- **KRD tenor buckets follow the published benchmark grid**, which means KRD granularity is only as fine as FBIL's own published tenor structure — BondFactor does not fabricate additional key-rate points beyond what the market itself quotes.

## 12. Document Map Reference

This specification is the mathematical foundation for the System Design & Architecture document (which defines where each computation in this document executes — server or client — and how curves are cached and transmitted) and the Testing Strategy document (which defines the specific test cases, tolerances, and golden reference values used to validate everything described here).
