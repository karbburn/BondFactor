from datetime import date
from quant_core.bootstrap import ZeroCurve
from quant_core.pricing import calculate_dirty_price

def calculate_macaulay_duration(
    settlement_date: date,
    cashflows: list,
    ytm: float,
    coupon_frequency: int = 2
) -> float:
    """
    Calculates the Macaulay duration of a bond's future cashflows.
    ytm is in percentage (e.g., 7.28).
    """
    future_cfs = [cf for cf in cashflows if (cf["date"] - settlement_date).days > 0]
    if not future_cfs:
        return 0.0
        
    numerator = 0.0
    denominator = 0.0
    
    for cf in future_cfs:
        t = (cf["date"] - settlement_date).days / 365.0
        # Present value of this cashflow discounted at the YTM rate
        df = 1.0 / ((1.0 + ytm / (100.0 * coupon_frequency)) ** (coupon_frequency * t))
        pv = cf["amount"] * df
        numerator += t * pv
        denominator += pv
        
    if denominator == 0:
        return 0.0
    return numerator / denominator

def calculate_modified_duration(
    macaulay_duration: float,
    ytm: float,
    coupon_frequency: int = 2
) -> float:
    """
    Calculates the Modified duration of a bond.
    ytm is in percentage (e.g., 7.28).
    """
    return macaulay_duration / (1.0 + ytm / (100.0 * coupon_frequency))

def calculate_dv01(settlement_date: date, cashflows: list, zc: ZeroCurve) -> float:
    """
    Calculates the DV01 (dollar value of 01) sensitivity of a bond's price.
    Calculated via a 1 basis point (0.01% parallel increase) bump-and-reprice on the zero curve.
    """
    p0 = calculate_dirty_price(settlement_date, cashflows, zc)
    
    # Parallel shift zero curve up by 1bp (0.01 percentage points)
    bumped_rates = zc.zero_rates + 0.01
    zc_bumped = ZeroCurve(zc.maturities, bumped_rates)
    
    p_up = calculate_dirty_price(settlement_date, cashflows, zc_bumped)
    
    # Price drop for yield increase
    return p0 - p_up

def calculate_convexity(settlement_date: date, cashflows: list, zc: ZeroCurve) -> float:
    """
    Calculates the Convexity of a bond.
    Calculated via a symmetric 10 basis point (0.1% parallel shift up and down) bump-and-reprice on the zero curve.
    Formula: (P_up + P_down - 2 * P_0) / (P_0 * h^2) where h = 0.001 (10 bps in decimal).
    """
    p0 = calculate_dirty_price(settlement_date, cashflows, zc)
    if p0 <= 0:
        return 0.0
        
    shift = 0.1   # 10 bps shift in percentage points
    h = 0.001     # 10 bps shift in decimal yield (0.1 / 100)
    
    zc_up = ZeroCurve(zc.maturities, zc.zero_rates + shift)
    p_up = calculate_dirty_price(settlement_date, cashflows, zc_up)
    
    zc_down = ZeroCurve(zc.maturities, zc.zero_rates - shift)
    p_down = calculate_dirty_price(settlement_date, cashflows, zc_down)
    
    return (p_up + p_down - 2.0 * p0) / (p0 * (h ** 2))

def calculate_position_factor_pnl_decomposition(
    settlement_date: date,
    cashflows: list,
    base_params: dict,
    parallel_shift: float = 0.0,
    slope_shock: float = 0.0,
    curvature1_shock: float = 0.0,
    curvature2_shock: float = 0.0,
    twist_shock: float = 0.0,
    twist_pivot: float = 5.0,
    face_value: float = 100.0,
) -> dict:
    """
    Decomposes the position P&L into contributions from Level, Slope, Curvature-1, and Curvature-2.
    Also returns the joint P&L and the interaction residual. Uses first-order linear attribution
    via central finite differences (h = 1bp).
    """
    import numpy as np
    from quant_core.nss import nss_yield
    from quant_core.bootstrap import bootstrap_zero_curve
    from quant_core.scenario import apply_scenario_shocks

    tau1 = base_params["tau1"]
    if twist_pivot > 0:
        g1_pivot = (1.0 - np.exp(-twist_pivot / tau1)) / (twist_pivot / tau1)
    else:
        g1_pivot = 1.0

    delta_beta0_twist = -twist_shock * g1_pivot
    delta_beta0 = parallel_shift + delta_beta0_twist
    delta_beta1 = slope_shock + twist_shock
    delta_beta2 = curvature1_shock
    delta_beta3 = curvature2_shock

    def get_price_for_params(b0, b1, b2, b3):
        def par_curve_fn(t):
            return nss_yield(t, b0, b1, b2, b3, base_params["tau1"], base_params["tau2"])
        zc = bootstrap_zero_curve(par_curve_fn, max_maturity=40.0, step_size=0.5)
        return calculate_dirty_price(settlement_date, cashflows, zc)

    p_base = get_price_for_params(
        base_params["beta0"],
        base_params["beta1"],
        base_params["beta2"],
        base_params["beta3"]
    )

    shocked_params = apply_scenario_shocks(
        base_params=base_params,
        parallel_shift=parallel_shift,
        slope_shock=slope_shock,
        curvature1_shock=curvature1_shock,
        curvature2_shock=curvature2_shock,
        twist_shock=twist_shock,
        twist_pivot=twist_pivot
    )
    p_shocked = get_price_for_params(
        shocked_params["beta0"],
        shocked_params["beta1"],
        shocked_params["beta2"],
        shocked_params["beta3"]
    )
    total_pnl = (p_shocked - p_base) * (face_value / 100.0)

    # Central difference bump h = 1bp (0.01 percentage point)
    h = 0.01

    p_b0_up = get_price_for_params(base_params["beta0"] + h, base_params["beta1"], base_params["beta2"], base_params["beta3"])
    p_b0_down = get_price_for_params(base_params["beta0"] - h, base_params["beta1"], base_params["beta2"], base_params["beta3"])
    d_b0 = (p_b0_up - p_b0_down) / (2.0 * h)

    p_b1_up = get_price_for_params(base_params["beta0"], base_params["beta1"] + h, base_params["beta2"], base_params["beta3"])
    p_b1_down = get_price_for_params(base_params["beta0"], base_params["beta1"] - h, base_params["beta2"], base_params["beta3"])
    d_b1 = (p_b1_up - p_b1_down) / (2.0 * h)

    p_b2_up = get_price_for_params(base_params["beta0"], base_params["beta1"], base_params["beta2"] + h, base_params["beta3"])
    p_b2_down = get_price_for_params(base_params["beta0"], base_params["beta1"], base_params["beta2"] - h, base_params["beta3"])
    d_b2 = (p_b2_up - p_b2_down) / (2.0 * h)

    p_b3_up = get_price_for_params(base_params["beta0"], base_params["beta1"], base_params["beta2"], base_params["beta3"] + h)
    p_b3_down = get_price_for_params(base_params["beta0"], base_params["beta1"], base_params["beta2"], base_params["beta3"] - h)
    d_b3 = (p_b3_up - p_b3_down) / (2.0 * h)

    contrib_level = d_b0 * delta_beta0 * (face_value / 100.0)
    contrib_slope = d_b1 * delta_beta1 * (face_value / 100.0)
    contrib_curv1 = d_b2 * delta_beta2 * (face_value / 100.0)
    contrib_curv2 = d_b3 * delta_beta3 * (face_value / 100.0)

    residual = total_pnl - (contrib_level + contrib_slope + contrib_curv1 + contrib_curv2)

    return {
        "level": float(contrib_level),
        "slope": float(contrib_slope),
        "curvature1": float(contrib_curv1),
        "curvature2": float(contrib_curv2),
        "residual": float(residual),
        "total": float(total_pnl)
    }

