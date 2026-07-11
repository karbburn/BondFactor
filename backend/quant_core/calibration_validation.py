import numpy as np
from typing import List, Dict, Any, Callable
from quant_core.nss import calibrate_nss, nss_yield
from quant_core.spline import CubicSplineCurve

class CalibrationValidationResult:
    """
    Structured validation result for curve calibration.
    """
    def __init__(
        self, 
        passed: bool, 
        fallback_used: bool, 
        reasons: List[str], 
        rmse: float, 
        parameters: Dict[str, float], 
        curve_fn: Callable[[Any], Any] = None
    ):
        self.passed = passed
        self.fallback_used = fallback_used
        self.reasons = reasons
        self.rmse = rmse
        self.parameters = parameters
        self.curve_fn = curve_fn

def validate_calibration(
    opt_result: dict, 
    params: list, 
    tenors: np.ndarray, 
    yields: np.ndarray, 
    prev_params: list = None
) -> CalibrationValidationResult:
    """
    Runs 5 validation checks on the fitted Nelson-Siegel-Svensson parameters:
      1. Convergence (optimizer successfully completed)
      2. Parameter plausibility (beta and tau coefficients in sane ranges)
      3. Goodness-of-fit (RMSE error < 15 basis points / 0.15%)
      4. Day-over-day stability (changes relative to previous parameters < 5.0)
      5. Numerical smoothness (no extreme oscillations or out-of-bound yields)
    """
    reasons = []
    
    # 1. Convergence Check
    if not opt_result.get("success", False):
        reasons.append(f"Optimizer did not converge: {opt_result.get('message', 'Unknown error')}")
        
    beta0, beta1, beta2, beta3, tau1, tau2 = params
    
    # 2. Parameter Plausibility Check
    if not (0.0 <= beta0 <= 25.0):
        reasons.append(f"Plausibility failed: beta0 ({beta0:.4f}) outside bounds [0, 25]")
    for val, name in [(beta1, "beta1"), (beta2, "beta2"), (beta3, "beta3")]:
        if not (-25.0 <= val <= 25.0):
            reasons.append(f"Plausibility failed: {name} ({val:.4f}) outside bounds [-25, 25]")
    for val, name in [(tau1, "tau1"), (tau2, "tau2")]:
        if not (0.1 <= val <= 30.0):
            reasons.append(f"Plausibility failed: {name} ({val:.4f}) outside bounds [0.1, 30]")
            
    # 3. Goodness-of-fit Check
    implied = nss_yield(tenors, beta0, beta1, beta2, beta3, tau1, tau2)
    rmse = float(np.sqrt(np.mean((implied - yields) ** 2)))
    if rmse > 0.15:  # 15 basis points
        reasons.append(f"Goodness-of-fit failed: RMSE ({rmse * 100:.2f} bps) exceeds limit of 15 bps")
        
    # 4. Day-over-day Stability Check
    if prev_params and len(prev_params) == 6:
        for idx, (curr, prev) in enumerate(zip(params, prev_params)):
            if abs(curr - prev) > 5.0:
                reasons.append(f"Stability failed: parameter index {idx} jumped by {abs(curr - prev):.4f} (limit: 5.0)")
                
    # 5. Smoothness Check
    # Evaluate curve at a dense set of maturities to check for spikes/spurious oscillations
    dense_tenors = np.linspace(0.1, 30.0, 300)
    dense_yields = nss_yield(dense_tenors, beta0, beta1, beta2, beta3, tau1, tau2)
    
    if np.any(dense_yields < 0.0) or np.any(dense_yields > 25.0):
        reasons.append("Smoothness failed: fitted yields out of bounds [0%, 25%]")
        
    # Check max adjacent yield change (slope)
    adjacent_diffs = np.abs(np.diff(dense_yields))
    if np.any(adjacent_diffs > 1.0):
        reasons.append("Smoothness failed: excessive adjacent yield changes (oscillation check)")
        
    passed = len(reasons) == 0
    
    parameters_dict = {
        "beta0": beta0, "beta1": beta1, "beta2": beta2,
        "beta3": beta3, "tau1": tau1, "tau2": tau2
    } if passed else {}
    
    return CalibrationValidationResult(
        passed=passed,
        fallback_used=not passed,
        reasons=reasons,
        rmse=rmse,
        parameters=parameters_dict
    )

def calibrate_yield_curve(
    tenors: np.ndarray, 
    yields: np.ndarray, 
    prev_params: list = None
) -> CalibrationValidationResult:
    """
    Fits Nelson-Siegel-Svensson. Runs validation checks.
    If NSS passes, returns NSS curve function.
    If NSS fails, falls back to Natural Cubic Spline.
    """
    try:
        opt_res = calibrate_nss(tenors, yields, prev_params)
        params = [opt_res["beta0"], opt_res["beta1"], opt_res["beta2"], opt_res["beta3"], opt_res["tau1"], opt_res["tau2"]]
        
        result = validate_calibration(opt_res, params, tenors, yields, prev_params)
        
        if result.passed:
            # Bind the parameters to the curve function
            result.curve_fn = lambda t: nss_yield(t, *params)
            return result
            
    except Exception as e:
        result = CalibrationValidationResult(
            passed=False,
            fallback_used=True,
            reasons=[f"Calibration exception: {str(e)}"],
            rmse=999.0,
            parameters={}
        )
        
    # Fallback to Cubic Spline
    spline_curve = CubicSplineCurve(tenors, yields)
    spline_implied = spline_curve.evaluate(tenors)
    spline_rmse = float(np.sqrt(np.mean((spline_implied - yields) ** 2)))
    
    result.fallback_used = True
    result.rmse = spline_rmse
    result.curve_fn = spline_curve.evaluate
    
    return result
