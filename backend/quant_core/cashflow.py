import calendar
from datetime import date
from typing import List, Dict, Any

def subtract_months(dt: date, months: int) -> date:
    """
    Subtracts a number of months from a date, preserving the day of the month 
    (or capping it at the maximum day of the target month).
    """
    month = dt.month - 1 - months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)

def generate_coupon_dates(issue_date: date, maturity_date: date, coupon_frequency: int = 2) -> List[date]:
    """
    Generates theoretical coupon dates by counting backwards from maturity_date.
    Returns [t_0, t_1, ..., t_N] where:
      - t_0 is the preceding theoretical coupon date (on or before issue_date)
      - t_1 is the first coupon payment date
      - t_N is the maturity_date
    """
    dates = []
    months_per_period = 12 // coupon_frequency
    k = 0
    while True:
        # Subtracting from the original maturity_date to avoid cumulative day shifting
        dt = subtract_months(maturity_date, k * months_per_period)
        dates.append(dt)
        if dt <= issue_date:
            break
        k += 1
        
    dates.reverse()
    return dates

def generate_cashflows(
    issue_date: date,
    maturity_date: date,
    coupon_rate: float,
    coupon_frequency: int = 2,
    face_value: float = 100.0
) -> List[Dict[str, Any]]:
    """
    Generates the explicit cashflow schedule for a G-Sec.
    Correctly accounts for odd first coupon periods by prorating the coupon amount.
    """
    dates = generate_coupon_dates(issue_date, maturity_date, coupon_frequency)
    if len(dates) < 2:
        # Fallback for immediate/invalid schedules
        return [{"date": maturity_date, "amount": face_value, "type": "redemption"}]
        
    cashflows = []
    regular_coupon = face_value * (coupon_rate / 100.0) / coupon_frequency
    
    for i in range(1, len(dates)):
        pay_date = dates[i]
        
        if i == 1:
            t_0 = dates[0]
            t_1 = dates[1]
            # Prorate the first coupon if issue_date falls after the preceding theoretical coupon date t_0
            if issue_date > t_0:
                period_days = (t_1 - t_0).days
                accrued_days = (t_1 - issue_date).days
                amount = regular_coupon * (accrued_days / period_days) if period_days > 0 else 0.0
            else:
                amount = regular_coupon
        else:
            amount = regular_coupon
            
        is_last = (i == len(dates) - 1)
        
        if is_last:
            cashflows.append({
                "date": pay_date,
                "amount": amount + face_value,
                "type": "both"
            })
        else:
            cashflows.append({
                "date": pay_date,
                "amount": amount,
                "type": "coupon"
            })
            
    return cashflows
