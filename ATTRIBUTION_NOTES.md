## Advanced Risk Attribution Notes

This document describes the mathematical formulation of the factor-level P&L decomposition and the key-rate tenor-bucket risk attribution.

## 1. Nelson-Siegel-Svensson Factor-Level P&L Decomposition

### Formulation

Given the base Nelson-Siegel-Svensson (NSS) parameters:

```
β_base = (β₀, β₁, β₂, β₃, τ₁, τ₂)
```

The user applies a set of shocks resulting in shocked parameters:

```
β_shocked = (β₀,shocked, β₁,shocked, β₂,shocked, β₃,shocked, τ₁, τ₂)
```

The parameter updates are defined as:

```
Δβ₀ = β₀,shocked − β₀ = parallel_shift + Δβ₀^twist
Δβ₁ = β₁,shocked − β₁ = slope_shock + twist_shock
Δβ₂ = β₂,shocked − β₂ = curvature1_shock
Δβ₃ = β₃,shocked − β₃ = curvature2_shock
```

We define a first-order / linear P&L attribution for each parameter βᵢ (i ∈ {0, 1, 2, 3}). We compute the sensitivity of the bond price P to each parameter βᵢ using a symmetric central finite difference at the base curve:

```
∂P/∂βᵢ ≈ [P(β_base + h·eᵢ) − P(β_base − h·eᵢ)] / 2h
```

where h = 0.01 (a 1 basis point shock in the parameter space, since parameters are scaled in percent, e.g. 7.0 for 7%), and eᵢ is the unit vector for the i-th parameter.

The P&L contribution of factor i for a position with face value F is then:

```
P&L Contribution_i = (∂P/∂βᵢ) × Δβᵢ × F/100
```

### Exact vs. Approximate

The factor-level P&L decomposition is **approximate** when shocks are applied jointly or when individual shocks are large. This is because:

1. **Discounting Non-linearity:** The bond price P(β) = Σⱼ CFⱼ · e^{−z(tⱼ)·tⱼ} is non-linear with respect to zero rates z(t).
2. **Bootstrapping Non-linearity:** The zero curve z(t) is bootstrapped from the NSS par yield curve, which introduces non-linear interactions.
3. **Cross-term Interactions:** When multiple factors are shocked jointly, interaction terms (cross-derivatives ∂²P/∂βᵢ∂βⱼ) arise and are ignored by first-order linear attribution.

To ensure exact reconciliation to the total joint P&L, we calculate and display a **Residual (Interaction/Convexity)** term:

```
Residual = ΔP_joint − Σᵢ₌₀³ P&L Contribution_i
```

This ensures the components sum exactly to the total scenario P&L while highlighting the degree of approximation.

---

## 2. Key-Rate Tenor-Bucket Risk Contribution

### Formulation

Using the independent key rate duration (KRD) engine, each bond position has key rate durations KRDₖ at the benchmark tenors:

```
tₖ ∈ {0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0, 40.0}
```

The local rate sensitivity (KRS) of a position in currency terms for a 1bp (0.01%) rate decrease (so that a positive duration yields a positive risk contribution) is:

```
KRSₖ = KRDₖ × P_base × 0.0001 × F/100
```

where P_base is the dirty price of the bond per 100 face value.

### Reconciliation

By definition:

```
Σₖ KRDₖ ≈ Modified Duration
```

Hence, the sum of the key rate sensitivities (KRS) over all tenor buckets k reconciles with the total position-level parallel DV01:

```
Σₖ KRSₖ ≈ DV01 × F/100
```

At the portfolio level, the sum of portfolio key rate sensitivities (the sum over all positions of their respective KRSₖ) reconciles with the total portfolio parallel DV01. This provides a complete breakdown of parallel yield risk across the tenor grid.
