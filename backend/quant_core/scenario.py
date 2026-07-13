import numpy as np
from quant_core.nss import nss_yield
from quant_core.bootstrap import bootstrap_zero_curve, build_zero_curve_from_zero_rates

def apply_scenario_shocks(
    base_params: dict,
    parallel_shift: float = 0.0,
    slope_shock: float = 0.0,
    curvature1_shock: float = 0.0,
    curvature2_shock: float = 0.0,
    twist_shock: float = 0.0,
    twist_pivot: float = 5.0
) -> dict:
    """
    Applies factor shocks to base Nelson-Siegel-Svensson parameters.
    """
    beta0 = base_params["beta0"]
    beta1 = base_params["beta1"]
    beta2 = base_params["beta2"]
    beta3 = base_params["beta3"]
    tau1 = base_params["tau1"]
    tau2 = base_params["tau2"]
    
    # Calculate twist offset to preserve rate at twist_pivot
    g1_pivot = 0.0
    if twist_pivot > 0:
        g1_pivot = (1.0 - np.exp(-twist_pivot / tau1)) / (twist_pivot / tau1)
    else:
        g1_pivot = 1.0
        
    delta_beta0_twist = -twist_shock * g1_pivot
    
    new_beta0 = beta0 + parallel_shift + delta_beta0_twist
    new_beta1 = beta1 + slope_shock + twist_shock
    new_beta2 = beta2 + curvature1_shock
    new_beta3 = beta3 + curvature2_shock
    
    # Enforce boundaries on beta0 (yield level cannot become negative or implausibly high)
    new_beta0 = max(0.0, min(25.0, new_beta0))
    
    return {
        "beta0": new_beta0,
        "beta1": max(-25.0, min(25.0, new_beta1)),
        "beta2": max(-25.0, min(25.0, new_beta2)),
        "beta3": max(-25.0, min(25.0, new_beta3)),
        "tau1": tau1,
        "tau2": tau2
    }

def get_shocked_zero_curve(
    base_params: dict,
    parallel_shift: float = 0.0,
    slope_shock: float = 0.0,
    curvature1_shock: float = 0.0,
    curvature2_shock: float = 0.0,
    twist_shock: float = 0.0,
    twist_pivot: float = 5.0,
    max_maturity: float = 40.0,
    step_size: float = 0.5,
    yield_type: str = "par"
):
    """
    Returns a new ZeroCurve after applying the NSS factor shocks and bootstrapping.
    """
    shocked_params = apply_scenario_shocks(
        base_params=base_params,
        parallel_shift=parallel_shift,
        slope_shock=slope_shock,
        curvature1_shock=curvature1_shock,
        curvature2_shock=curvature2_shock,
        twist_shock=twist_shock,
        twist_pivot=twist_pivot
    )
    
    def zc_fn(t):
        return nss_yield(
            t,
            shocked_params["beta0"],
            shocked_params["beta1"],
            shocked_params["beta2"],
            shocked_params["beta3"],
            shocked_params["tau1"],
            shocked_params["tau2"]
        )
        
    if yield_type == "par":
        return bootstrap_zero_curve(zc_fn, max_maturity=max_maturity, step_size=step_size)
    return build_zero_curve_from_zero_rates(zc_fn, max_maturity=max_maturity, step_size=step_size)
