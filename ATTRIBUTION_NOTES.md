## Advanced Risk Attribution Notes

This document describes the mathematical formulation of the factor-level P&L decomposition and the key-rate tenor-bucket risk attribution.

## 1. Nelson-Siegel-Svensson Factor-Level P&L Decomposition

### Formulation
Given the base Nelson-Siegel-Svensson (NSS) parameters $\boldsymbol{\beta}_{\text{base}} = (\beta_0, \beta_1, \beta_2, \beta_3, \tau_1, \tau_2)$, the user applies a set of shocks resulting in shocked parameters $\boldsymbol{\beta}_{\text{shocked}} = (\beta_{0, \text{shocked}}, \beta_{1, \text{shocked}}, \beta_{2, \text{shocked}}, \beta_{3, \text{shocked}}, \tau_1, \tau_2)$.

The parameter updates are defined as:
- $\Delta \beta_0 = \beta_{0, \text{shocked}} - \beta_0 = \text{parallel\_shift} + \Delta\beta_0^{\text{twist}}$
- $\Delta \beta_1 = \beta_{1, \text{shocked}} - \beta_1 = \text{slope\_shock} + \text{twist\_shock}$
- $\Delta \beta_2 = \beta_{2, \text{shocked}} - \beta_2 = \text{curvature1\_shock}$
- $\Delta \beta_3 = \beta_{3, \text{shocked}} - \beta_3 = \text{curvature2\_shock}$

We define a first-order / linear P&L attribution for each parameter $\beta_i$ ($i \in \{0, 1, 2, 3\}$).
We compute the sensitivity of the bond price $P$ to each parameter $\beta_i$ using a symmetric central finite difference at the base curve:
$$\frac{\partial P}{\partial \beta_i} \approx \frac{P(\boldsymbol{\beta}_{\text{base}} + h \mathbf{e}_i) - P(\boldsymbol{\beta}_{\text{base}} - h \mathbf{e}_i)}{2h}$$
where $h = 0.01$ (a 1 basis point shock in the parameter space, since parameters are scaled in percent, e.g. 7.0 for 7%), and $\mathbf{e}_i$ is the unit vector for the $i$-th parameter.

The P&L contribution of factor $i$ for a position with face value $F$ is then:
$$\text{P\&L Contribution}_i = \frac{\partial P}{\partial \beta_i} \Delta \beta_i \times \frac{F}{100}$$

### Exact vs. Approximate
The factor-level P&L decomposition is **approximate** when shocks are applied jointly or when individual shocks are large. This is because:
1. **Discounting Non-linearity:** The bond price $P(\boldsymbol{\beta}) = \sum_j CF_j e^{-z(t_j) t_j}$ is non-linear with respect to zero rates $z(t)$.
2. **Bootstrapping Non-linearity:** The zero curve $z(t)$ is bootstrapped from the NSS par yield curve, which introduces non-linear interactions.
3. **Cross-term Interactions:** When multiple factors are shocked jointly, interaction terms (cross-derivatives $\frac{\partial^2 P}{\partial \beta_i \partial \beta_j}$) arise and are ignored by first-order linear attribution.

To ensure exact reconciliation to the total joint P&L, we calculate and display a **Residual (Interaction/Convexity)** term:
$$\text{Residual} = \Delta P_{\text{joint}} - \sum_{i=0}^3 \text{P\&L Contribution}_i$$
This ensures the components sum exactly to the total scenario P&L while highlighting the degree of approximation.

---

## 2. Key-Rate Tenor-Bucket Risk Contribution

### Formulation
Using the independent key rate duration (KRD) engine, each bond position has key rate durations $KRD_k$ at the benchmark tenors $t_k \in \{0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0, 40.0\}$.

The local rate sensitivity (KRS) of a position in currency terms for a 1bp (0.01%) rate decrease (so that a positive duration yields a positive risk contribution) is:
$$\text{KRS}_k = KRD_k \times P_{\text{base}} \times 0.0001 \times \frac{F}{100}$$
where $P_{\text{base}}$ is the dirty price of the bond per 100 face value.

### Reconciliation
By definition:
$$\sum_k KRD_k \approx \text{Modified Duration}$$
Hence, the sum of the key rate sensitivities (KRS) over all tenor buckets $k$ reconciles with the total position-level parallel DV01:
$$\sum_k \text{KRS}_k \approx \text{DV01} \times \frac{F}{100}$$
At the portfolio level, the sum of portfolio key rate sensitivities (the sum over all positions of their respective $\text{KRS}_k$) reconciles with the total portfolio parallel DV01.
This provides a complete breakdown of parallel yield risk across the tenor grid.
