import numpy as np

class ZeroCurve:
    """
    Represents a bootstrapped zero-coupon yield curve.
    Uses linear interpolation of zero rates and flat extrapolation at boundaries.
    """
    def __init__(self, maturities: np.ndarray, zero_rates: np.ndarray):
        self.maturities = np.array(maturities, dtype=float)
        self.zero_rates = np.array(zero_rates, dtype=float)
        
    def get_zero_rate(self, t: float) -> float:
        """
        Returns the continuously compounded zero rate (in %) for maturity `t` in years.
        """
        if t <= 0:
            return float(self.zero_rates[0])
            
        if t <= self.maturities[0]:
            return float(self.zero_rates[0])
        if t >= self.maturities[-1]:
            return float(self.zero_rates[-1])
            
        return float(np.interp(t, self.maturities, self.zero_rates))
        
    def get_discount_factor(self, t: float) -> float:
        """
        Returns the discount factor D(t) for maturity `t` in years.
        D(t) = exp(-z(t)/100 * t)
        """
        if t <= 0:
            return 1.0
        z = self.get_zero_rate(t)
        return float(np.exp(-(z / 100.0) * t))

def bootstrap_zero_curve(par_curve_fn, max_maturity: float = 40.0, step_size: float = 0.5) -> ZeroCurve:
    """
    Bootstraps a zero-coupon discount curve from a continuous par curve.
    Assumes par_curve_fn is a callable (like NSS or spline evaluate) returning par yields in %.
    step_size defaults to 0.5 (semi-annual coupon payments standard for Indian G-Secs).
    """
    steps = int(max_maturity / step_size)
    maturities = np.array([step_size * (i + 1) for i in range(steps)], dtype=float)
    
    discount_factors = []
    running_sum_df = 0.0
    
    for t in maturities:
        par_y = par_curve_fn(t)
        # coupon rate in decimal: par_y / 100.0
        # semi-annual coupon amount per 100 par: 100.0 * (par_y / 100.0) / 2.0 = par_y / 2.0
        c = par_y / 2.0
        
        # D(T) = (100 - c * sum(D_prev)) / (100 + c)
        df = (100.0 - c * running_sum_df) / (100.0 + c)
        discount_factors.append(df)
        running_sum_df += df
        
    discount_factors = np.array(discount_factors, dtype=float)
    # Zero rate in % continuously compounded: z(T) = -ln(D(T)) / T * 100.0
    zero_rates = -np.log(discount_factors) / maturities * 100.0
    
    return ZeroCurve(maturities, zero_rates)
