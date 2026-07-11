from datetime import date
from scipy.optimize import brentq
from quant_core.conventions import calculate_accrued_interest

def calculate_dirty_price(settlement_date: date, cashflows: list, zc) -> float:
    """
    Calculates the dirty price (present value) of a bond's future cashflows
    discounted off the bootstrapped zero curve.
    """
    dirty_price = 0.0
    for cf in cashflows:
        t = (cf["date"] - settlement_date).days / 365.0
        if t > 0:
            dirty_price += cf["amount"] * zc.get_discount_factor(t)
    return dirty_price

def calculate_clean_price(
    settlement_date: date,
    issue_date: date,
    maturity_date: date,
    coupon_rate: float,
    cashflows: list,
    zc,
    coupon_frequency: int = 2,
    face_value: float = 100.0
) -> float:
    """
    Calculates the clean price of a G-Sec by subtracting accrued interest from the dirty price.
    """
    dirty_price = calculate_dirty_price(settlement_date, cashflows, zc)
    accrued = calculate_accrued_interest(
        settlement_date=settlement_date,
        issue_date=issue_date,
        maturity_date=maturity_date,
        coupon_rate=coupon_rate,
        coupon_frequency=coupon_frequency,
        face_value=face_value
    )
    return dirty_price - accrued

def calculate_ytm(
    settlement_date: date,
    cashflows: list,
    dirty_price: float,
    coupon_frequency: int = 2
) -> float:
    """
    Solves for the Yield to Maturity (YTM) compounded coupon_frequency times a year (semi-annually).
    Solves numerically using Brent's method.
    """
    if dirty_price <= 0:
        return 0.0
        
    future_cfs = [cf for cf in cashflows if (cf["date"] - settlement_date).days > 0]
    if not future_cfs:
        return 0.0

    def objective(y_val):
        # y_val is YTM in percent (e.g. 7.28% yield corresponds to y_val = 7.28)
        pv = 0.0
        for cf in future_cfs:
            t = (cf["date"] - settlement_date).days / 365.0
            pv += cf["amount"] / ((1.0 + y_val / (100.0 * coupon_frequency)) ** (coupon_frequency * t))
        return pv - dirty_price

    try:
        # standard gov bond range is [-5%, 100%]
        return float(brentq(objective, -5.0, 100.0, xtol=1e-12))
    except ValueError:
        # Fallback to wider search if yield is extreme
        try:
            return float(brentq(objective, -20.0, 500.0, xtol=1e-12))
        except ValueError:
            return 0.0
