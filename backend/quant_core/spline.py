import numpy as np
from scipy.interpolate import CubicSpline

class CubicSplineCurve:
    """
    Wraps Scipy's CubicSpline to provide a continuous par yield curve function.
    Fits a natural cubic spline (bc_type='natural') to the sorted input tenors.
    """
    def __init__(self, tenors: np.ndarray, yields: np.ndarray):
        tenors = np.array(tenors, dtype=float)
        yields = np.array(yields, dtype=float)
        
        # CubicSpline requires strictly increasing x values
        idx = np.argsort(tenors)
        self.tenors = tenors[idx]
        self.yields = yields[idx]
        
        # Fit natural cubic spline
        self.spline = CubicSpline(self.tenors, self.yields, bc_type='natural', extrapolate=True)
        
    def evaluate(self, t):
        """
        Evaluates the spline at a scalar or array of maturities `t`.
        """
        t = np.atleast_1d(t).astype(float)
        res = self.spline(t)
        
        # If input was a scalar, return a scalar
        if res.ndim == 1 and res.size == 1:
            return float(res[0])
        return res
