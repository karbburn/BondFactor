import numpy as np
from scipy.optimize import minimize

def nss_yield(t, beta0, beta1, beta2, beta3, tau1, tau2):
    """
    Nelson-Siegel-Svensson yield curve model evaluation function.
    t can be a scalar or a NumPy array.
    """
    t = np.atleast_1d(t).astype(float)
    res = np.zeros_like(t)
    
    # Avoid division by zero at t=0
    zero_mask = (t == 0)
    res[zero_mask] = beta0 + beta1
    
    t_nz = t[~zero_mask]
    term1 = (1 - np.exp(-t_nz / tau1)) / (t_nz / tau1)
    term2 = term1 - np.exp(-t_nz / tau1)
    term3 = (1 - np.exp(-t_nz / tau2)) / (t_nz / tau2) - np.exp(-t_nz / tau2)
    res[~zero_mask] = beta0 + beta1 * term1 + beta2 * term2 + beta3 * term3
    
    if res.ndim == 1 and res.size == 1:
        return float(res[0])
    return res

def calibrate_nss(tenors: np.ndarray, yields: np.ndarray, prev_params: list = None) -> dict:
    """
    Calibrates Nelson-Siegel-Svensson parameters from observed tenors and yields.
    Returns a dictionary of parameters and the optimizer result.
    """
    tenors = np.array(tenors, dtype=float)
    yields = np.array(yields, dtype=float)
    
    def loss(params):
        beta0, beta1, beta2, beta3, tau1, tau2 = params
        implied = nss_yield(tenors, beta0, beta1, beta2, beta3, tau1, tau2)
        return np.sum((implied - yields) ** 2)
        
    # Bounds for L-BFGS-B optimization
    bounds = [
        (0.0, 25.0),     # beta0: Level must be positive, reasonable ceiling at 25%
        (-25.0, 25.0),   # beta1: Slope
        (-25.0, 25.0),   # beta2: Curvature 1
        (-25.0, 25.0),   # beta3: Curvature 2
        (0.1, 15.0),     # tau1: First decay factor
        (0.1, 30.0)      # tau2: Second decay factor
    ]
    
    # Initial guess
    if prev_params and len(prev_params) == 6:
        initial_guess = prev_params
    else:
        # Default starting values
        beta0 = yields[-1] if len(yields) > 0 else 7.0
        beta1 = yields[0] - yields[-1] if len(yields) > 1 else -0.5
        beta2 = 0.0
        beta3 = 0.0
        tau1 = 2.0
        tau2 = 8.0
        initial_guess = [beta0, beta1, beta2, beta3, tau1, tau2]
        
    opt_res = minimize(loss, initial_guess, bounds=bounds, method="L-BFGS-B")
    
    params = opt_res.x.tolist()
    return {
        "beta0": params[0],
        "beta1": params[1],
        "beta2": params[2],
        "beta3": params[3],
        "tau1": params[4],
        "tau2": params[5],
        "success": opt_res.success,
        "message": opt_res.message,
        "fun": opt_res.fun,
        "nfev": opt_res.nfev
    }
