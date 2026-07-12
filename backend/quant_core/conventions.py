from datetime import date, timedelta
from typing import List

# Centralized G-Sec market conventions per Quant Methodology §7.2
COUPON_FREQUENCY = 2   # Semi-annual
DAY_COUNT = "ACT/ACT"  # Actual/Actual (ICMA)
SETTLEMENT_DAYS = 1    # T+1

def get_settlement_date(trade_date: date) -> date:
    """
    Returns the settlement date (T+1 business days) for a given trade date.
    Excludes weekends (Saturdays and Sundays).
    
    # Weekend-aware settlement. Ignored Indian national holidays since no calendar is loaded.
    # Upgrade path: Integrate a holiday library or load holiday dates from DB when scaling.
    """
    weekday = trade_date.weekday()  # 0 = Monday, 6 = Sunday
    if weekday == 4:    # Friday -> Monday
        return trade_date + timedelta(days=3)
    elif weekday == 5 or weekday == 6:  # Saturday/Sunday -> Tuesday
        return trade_date + timedelta(days=2)
    else:               # Monday-Thursday -> Next Day
        return trade_date + timedelta(days=1)

def calculate_accrued_interest(
    settlement_date: date,
    issue_date: date,
    maturity_date: date,
    coupon_rate: float,
    coupon_frequency: int = 2,
    face_value: float = 100.0
) -> float:
    """
    Calculates the accrued interest for a bond.
    Uses the Actual/Actual (ICMA) day count convention.
    """
    if settlement_date <= issue_date:
        return 0.0
        
    if settlement_date >= maturity_date:
        return 0.0

    # Import schedule builder here to avoid circular imports
    from quant_core.cashflow import generate_coupon_dates
    
    dates = generate_coupon_dates(issue_date, maturity_date, coupon_frequency)
    
    # Find the active coupon period containing settlement_date
    # dates is [t_0, t_1, t_2, ..., t_N]
    active_idx = -1
    for i in range(len(dates) - 1):
        period_start = issue_date if i == 0 else dates[i]
        period_end = dates[i+1]
        
        if period_start <= settlement_date < period_end:
            active_idx = i
            break
            
    if active_idx == -1:
        return 0.0

    t_start = dates[active_idx]      # Theoretical or actual preceding coupon date (t_i)
    t_end = dates[active_idx + 1]    # Next coupon date (t_{i+1})
    
    period_days = (t_end - t_start).days
    if period_days == 0:
        return 0.0
        
    # Accrued days starts from actual start of interest accumulation
    accrual_start = issue_date if active_idx == 0 else t_start
    accrued_days = (settlement_date - accrual_start).days
    
    coupon_payment = face_value * (coupon_rate / 100.0) / coupon_frequency
    accrued_interest = coupon_payment * (accrued_days / period_days)
    
    return accrued_interest
