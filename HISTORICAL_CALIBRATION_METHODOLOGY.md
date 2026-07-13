# Historical Scenario Calibration Methodology

This document evaluates different statistical approaches for translating observed historical Nelson-Siegel-Svensson (NSS) yield curve factor movements into suggested shock magnitudes for scenario composition.

---

## 1. Comparative Evaluation of Approaches

To derive a suggested shock magnitude for our scenario engine parameters ($\beta_0, \beta_1, \beta_2, \beta_3$), we compare three different quantitative methodologies. Each method is evaluated on its stability, outliers sensitivity, mathematical assumptions, and applicability to BondFactor's specific constraints.

### 1.1 Approach 1 — Fixed Lookback Window Percentile

**Description:**
Compute the daily changes in each factor:
$$\Delta \beta_i(t) = \beta_i(t) - \beta_i(t-1)$$
And define the shock magnitude as the $\alpha$-percentile (typically the 95th or 99th percentile) of the absolute moves:
$$\text{Shock Magnitude}_i = \text{Percentile}\left(\{|\Delta \beta_i(t)|\}, \alpha\right)$$

- **Advantages:**
  - Non-parametric: Does not assume any specific probability distribution (such as normality) for daily factor changes.
  - Finely tuned to risk appetite: Directly maps to an intuitive probability statement (e.g. "a 1-in-20 days move" for a 95th percentile).
  - Outlier Mitigation: Ignores extreme data spikes/optimizer calibration failures at the very tail (unlike worst-observed-move).
- **Limitations:**
  - Requires a reasonable number of historical observations to compute high percentiles stably. If the dataset has only 10 points, the 95th percentile reduces to an unstable interpolation near the maximum value.
- **Typical Industry Use:** Common in Value at Risk (VaR) historical simulation frameworks.

### 1.2 Approach 2 — Worst-Observed-Move

**Description:**
The suggested shock is the maximum absolute change observed over a historical window:
$$\text{Shock Magnitude}_i = \max_t |\Delta \beta_i(t)|$$

- **Advantages:**
  - Clear historical precedent: Highly intuitive for stress testing (e.g., "replaying the worst single day of the 2013 taper tantrum").
- **Limitations:**
  - Extremely sensitive to single-point outliers, optimizer failures, or bad data points in the calibration archive.
  - Highly unstable on small datasets, where a single large move dictates the entire calibration output indefinitely.
- **Typical Industry Use:** Regulatory stress testing and historical crisis scenario definition.

### 1.3 Approach 3 — Rolling Volatility-Scaled Shock

**Description:**
Compute the sample standard deviation $\sigma_i$ of the daily factor differences, and set the shock to a multiple $k$ (e.g., $2$ or $3$ standard deviations) of the volatility:
$$\text{Shock Magnitude}_i = k \cdot \sigma_i = k \cdot \sqrt{\frac{1}{M-1} \sum_{t} (\Delta \beta_i(t) - \bar{\Delta \beta_i})^2}$$

- **Advantages:**
  - Utilizes the entire dataset's distribution, making it statistically more stable on medium-sized samples than percentile estimators which rely on tail order statistics.
  - Scales naturally with market regimes: increases during high-volatility periods and decreases during calm periods.
- **Limitations:**
  - Parametric assumption: Implicitly assumes that daily changes follow a normal distribution. Financial factor changes are notoriously leptokurtic (fat-tailed), so a $2\sigma$ or $3\sigma$ shock under-represents the true probability of extreme tails.
  - Volatility drag: A single large spike increases the standard deviation for the entire lookback window, skewing results.
- **Typical Industry Use:** Parametric VaR, risk reporting, and capital allocation models.

---

## 2. Methodology Comparison Summary

| Method | Non-parametric? | Outlier Sensitive? | Stable on Small Data? | Selected? |
|---|---|---|---|---|
| **Fixed Percentile (95%)** | Yes | Low | Moderate | **Yes (with warnings)** |
| Worst-Observed-Move | Yes | High | Low | No |
| Volatility-Scaled ($N \cdot \sigma$) | No (normal assumption) | Moderate | High | No |

---

## 3. Chosen Approach & Historical Data Limitations

### Selection
We select **Approach 1 (Fixed Lookback Window Percentile)** at the **95th percentile** of absolute daily changes as our calibration methodology. It provides a non-parametric, risk-tail aligned suggestion for Level, Slope, and Curvature shocks.

### Coverage & Confidence Limitations 
There is no free, programmatic API access to historical FBIL par yield curves. Our database curve archive starts accumulating from the application's deployment date forward.

Consequently:
- In the initial phases of deployment, the number of archived curves $T$ will be very small (e.g., fewer than 90 days).
- **Statistical confidence in any calibrated parameter is LOW** for small $T$, as tail percentiles cannot be estimated with reasonable standard errors.
- The user interface must prominently display this limitation, indicating the active sample size and warning of low confidence when historical coverage is short.
