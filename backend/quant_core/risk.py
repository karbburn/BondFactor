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
