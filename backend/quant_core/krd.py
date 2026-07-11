from datetime import date
from typing import List
import numpy as np
from quant_core.bootstrap import ZeroCurve
from quant_core.pricing import calculate_dirty_price

DEFAULT_KEY_TENORS = [0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0, 40.0]

class KRD_PerturbedZeroCurve:
    """
    Decorator class that center-bumps zero rates by 1bp (0.01%) at a given key tenor,
    tapering linearly to zero at neighboring key tenors.
    
    # Tapered zero curve perturbation decorator. Exposes continuously bumped rates
    # without discretizing or altering the underlying ZeroCurve grid.
    """
    def __init__(self, base_zc: ZeroCurve, key_tenors: List[float], key_idx: int):
        self.base_zc = base_zc
        self.key_tenors = key_tenors
        self.key_idx = key_idx
        
    def get_zero_rate(self, t: float) -> float:
        r = self.base_zc.get_zero_rate(t)
        
        n = len(self.key_tenors)
        t_k = self.key_tenors[self.key_idx]
        
        # Calculate local 1bp (0.01) bump using linear tapering
        bump = 0.0
        if n == 1:
            bump = 0.01
        elif self.key_idx == 0:  # First key rate: flat left, taper right
            t_next = self.key_tenors[1]
            if t <= t_k:
                bump = 0.01
            elif t < t_next:
                bump = 0.01 * (t_next - t) / (t_next - t_k)
        elif self.key_idx == n - 1:  # Last key rate: taper left, flat right
            t_prev = self.key_tenors[n - 2]
            if t >= t_k:
                bump = 0.01
            elif t > t_prev:
                bump = 0.01 * (t - t_prev) / (t_k - t_prev)
        else:  # Intermediate key rate: taper left and right
            t_prev = self.key_tenors[self.key_idx - 1]
            t_next = self.key_tenors[self.key_idx + 1]
            if t_prev < t <= t_k:
                bump = 0.01 * (t - t_prev) / (t_k - t_prev)
            elif t_k < t < t_next:
                bump = 0.01 * (t_next - t) / (t_next - t_k)
                
        return r + bump

    def get_discount_factor(self, t: float) -> float:
        if t <= 0:
            return 1.0
        z = self.get_zero_rate(t)
        return float(np.exp(-(z / 100.0) * t))

def calculate_key_rate_durations(
    settlement_date: date,
    cashflows: list,
    zc: ZeroCurve,
    key_tenors: List[float] = None
) -> List[float]:
    """
    Calculates Key Rate Durations (KRD) for a bond's future cashflows at each key tenor.
    """
    if key_tenors is None:
        key_tenors = DEFAULT_KEY_TENORS
        
    p0 = calculate_dirty_price(settlement_date, cashflows, zc)
    if p0 <= 0:
        return [0.0] * len(key_tenors)
        
    krds = []
    for k in range(len(key_tenors)):
        # Create a locally perturbed zero curve for this bucket
        zc_perturbed = KRD_PerturbedZeroCurve(zc, key_tenors, k)
        
        # Price the bond off the perturbed curve
        p_perturbed = calculate_dirty_price(settlement_date, cashflows, zc_perturbed)
        
        # Duration: % price change per 1% change in rate.
        # Local bump is 1bp = 0.01% = 0.0001 in decimal.
        # KRD = (P0 - P_perturbed) / (P0 * 0.0001)
        krd = (p0 - p_perturbed) / (p0 * 0.0001)
        krds.append(float(krd))
        
    return krds
