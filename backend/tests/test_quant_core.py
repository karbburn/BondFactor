from datetime import date
import pytest
from quant_core import conventions, cashflow

# Test 1: T+1 Weekday Settlement Logic
def test_get_settlement_date():
    # Monday -> Tuesday
    assert conventions.get_settlement_date(date(2026, 4, 6)) == date(2026, 4, 7)
    # Thursday -> Friday
    assert conventions.get_settlement_date(date(2026, 4, 9)) == date(2026, 4, 10)
    # Friday -> Monday (T+1 business day)
    assert conventions.get_settlement_date(date(2026, 4, 10)) == date(2026, 4, 13)
    # Saturday -> Monday
    assert conventions.get_settlement_date(date(2026, 4, 11)) == date(2026, 4, 13)
    # Sunday -> Tuesday (markets closed Sunday, trade is effectively Monday with T+1 = Tuesday)
    assert conventions.get_settlement_date(date(2026, 4, 12)) == date(2026, 4, 14)

# Test 2: Standard Coupon Dates Generation
def test_generate_coupon_dates_standard():
    issue = date(2025, 1, 15)
    maturity = date(2035, 1, 15)
    dates = cashflow.generate_coupon_dates(issue, maturity, coupon_frequency=2)
    
    # 10 years * 2 semi-annual = 20 coupon periods.
    # The list contains t_0 (preceding theoretical date) + t_1 to t_20 = 21 dates total.
    assert len(dates) == 21
    assert dates[0] == date(2025, 1, 15)  # t_0 equals issue date
    assert dates[1] == date(2025, 7, 15)  # first coupon
    assert dates[-1] == date(2035, 1, 15) # maturity date

# Test 3: Accrued Interest Case 1 (Standard period, no leap year)
# Hand-computed check: AI = 100 * (0.07 / 2) * (88 / 181) = 1.7016574586
def test_accrued_interest_case1():
    issue_date = date(2025, 1, 15)
    maturity_date = date(2035, 1, 15)
    coupon_rate = 7.0
    
    trade_date = date(2026, 4, 10) # Friday
    settlement_date = conventions.get_settlement_date(trade_date) # Monday 2026-04-13
    assert settlement_date == date(2026, 4, 13)
    
    # Accrued days: 2026-01-15 to 2026-04-13 = 16 (Jan) + 28 (Feb) + 31 (Mar) + 13 (Apr) = 88 days
    # Period days: 2026-01-15 to 2026-07-15 = 16 (Jan) + 28 (Feb) + 31 (Mar) + 30 (Apr) + 31 (May) + 30 (Jun) + 15 (Jul) = 181 days
    ai = conventions.calculate_accrued_interest(
        settlement_date=settlement_date,
        issue_date=issue_date,
        maturity_date=maturity_date,
        coupon_rate=coupon_rate
    )
    
    expected_ai = 100.0 * (0.07 / 2.0) * (88.0 / 181.0)
    assert pytest.approx(ai, abs=1e-9) == expected_ai
    assert pytest.approx(ai, abs=1e-6) == 1.701657

# Test 4: Accrued Interest Case 2 (Leap year in period)
# Hand-computed check: AI = 100 * (0.065 / 2) * (75 / 183) = 1.3319672131
def test_accrued_interest_case2():
    issue_date = date(2023, 12, 15)
    maturity_date = date(2033, 12, 15)
    coupon_rate = 6.5
    
    trade_date = date(2024, 2, 27) # Tuesday
    settlement_date = conventions.get_settlement_date(trade_date) # Wednesday 2024-02-28
    
    # Accrued days: 2023-12-15 to 2024-02-28 = 16 (Dec) + 31 (Jan) + 28 (Feb) = 75 days
    # Period days: 2023-12-15 to 2024-06-15 = 16 (Dec) + 31 (Jan) + 29 (Feb, leap year!) + 31 (Mar) + 30 (Apr) + 31 (May) + 15 (Jun) = 183 days
    ai = conventions.calculate_accrued_interest(
        settlement_date=settlement_date,
        issue_date=issue_date,
        maturity_date=maturity_date,
        coupon_rate=coupon_rate
    )
    
    expected_ai = 100.0 * (0.065 / 2.0) * (75.0 / 183.0)
    assert pytest.approx(ai, abs=1e-9) == expected_ai
    assert pytest.approx(ai, abs=1e-6) == 1.331967

# Test 5: Accrued Interest Case 3 (Short odd first period)
# Hand-computed first coupon: C_first = 100 * (0.07 / 2) * (66 / 182) = 1.2692307692
def test_prorated_odd_first_coupon():
    issue_date = date(2025, 4, 10)
    maturity_date = date(2035, 6, 15)
    coupon_rate = 7.0
    
    # Coupon dates counted backwards:
    # t_0: 2024-12-15 (preceding theoretical coupon date)
    # t_1: 2025-06-15 (first actual coupon date)
    # Issue Date is between t_0 and t_1 (odd first coupon)
    
    # Full period: 2024-12-15 to 2025-06-15 = 16 (Dec) + 31 (Jan) + 28 (Feb) + 31 (Mar) + 30 (Apr) + 31 (May) + 15 (Jun) = 182 days
    # Days from issue to first coupon: 2025-04-10 to 2025-06-15 = 20 (Apr) + 31 (May) + 15 (Jun) = 66 days
    cashflows = cashflow.generate_cashflows(
        issue_date=issue_date,
        maturity_date=maturity_date,
        coupon_rate=coupon_rate
    )
    
    first_cf = cashflows[0]
    assert first_cf["date"] == date(2025, 6, 15)
    assert first_cf["type"] == "coupon"
    
    expected_first_coupon = 100.0 * (0.07 / 2.0) * (66.0 / 182.0)
    assert pytest.approx(first_cf["amount"], abs=1e-9) == expected_first_coupon
    assert pytest.approx(first_cf["amount"], abs=1e-6) == 1.269231

# Test 6: Cashflow Schedule Generation (regular and last principal payment)
def test_generate_cashflows_structure():
    issue = date(2025, 1, 15)
    maturity = date(2026, 1, 15) # 1 year, 2 semi-annual coupons
    cashflows = cashflow.generate_cashflows(issue, maturity, coupon_rate=6.0, face_value=100.0)
    
    assert len(cashflows) == 2
    
    # First coupon payment
    assert cashflows[0]["date"] == date(2025, 7, 15)
    assert cashflows[0]["amount"] == 3.0 # 100 * 6% / 2
    assert cashflows[0]["type"] == "coupon"
    
    # Final coupon + principal redemption payment
    assert cashflows[1]["date"] == date(2026, 1, 15)
    assert cashflows[1]["amount"] == 103.0 # 3.0 coupon + 100 principal
    assert cashflows[1]["type"] == "both"

# Curve Fitting Tests

import numpy as np
from quant_core.nss import nss_yield, calibrate_nss
from quant_core.spline import CubicSplineCurve
from quant_core.bootstrap import bootstrap_zero_curve
from quant_core.calibration_validation import calibrate_yield_curve

# Test 7: NSS evaluation against known parameters and boundary at t=0
def test_nss_evaluation():
    beta0, beta1, beta2, beta3, tau1, tau2 = 7.0, -2.0, 3.0, -1.0, 2.0, 5.0
    
    # Boundary at t=0 -> beta0 + beta1 = 5.0
    assert float(nss_yield(0.0, beta0, beta1, beta2, beta3, tau1, tau2)) == 5.0
    
    # Check evaluation at t=2.0
    # term1(2.0, tau=2) = (1 - e^-1)/1 = 0.6321205588
    # term2(2.0, tau=2) = term1 - e^-1 = 0.2642411176
    # term3(2.0, tau=5) = (1 - e^-0.4)/0.4 - e^-0.4 = 0.824199885 - 0.670320046 = 0.153879839
    # yield = 7.0 - 2*0.6321205588 + 3*0.2642411176 - 1*0.153879839 = 6.374602396
    y = nss_yield(2.0, beta0, beta1, beta2, beta3, tau1, tau2)
    assert pytest.approx(y, abs=1e-8) == 6.374602396

# Test 8: NSS parameter recovery from clean synthetic data
def test_nss_parameter_recovery():
    # Set known parameters
    beta0, beta1, beta2, beta3, tau1, tau2 = 7.2, -1.5, 2.0, -0.8, 1.5, 6.0
    tenors = np.array([0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0, 40.0])
    yields = nss_yield(tenors, beta0, beta1, beta2, beta3, tau1, tau2)
    
    # Calibrate nss
    calib = calibrate_nss(tenors, yields)
    assert calib["success"]
    
    # Verify recovered values match within small tolerance
    assert pytest.approx(calib["beta0"], abs=1e-2) == beta0
    assert pytest.approx(calib["beta1"], abs=1e-2) == beta1
    assert pytest.approx(calib["beta2"], abs=1e-2) == beta2
    assert pytest.approx(calib["beta3"], abs=1e-2) == beta3
    assert pytest.approx(calib["tau1"], abs=1e-1) == tau1
    assert pytest.approx(calib["tau2"], abs=1e-1) == tau2

# Test 9: Cubic Spline Curve Fit and exact recovery at node points
def test_cubic_spline_fit():
    tenors = np.array([1.0, 2.0, 5.0, 10.0])
    yields = np.array([6.5, 7.0, 7.2, 7.8])
    
    curve = CubicSplineCurve(tenors, yields)
    
    # Natural cubic spline must pass EXACTLY through the node points
    for t, y in zip(tenors, yields):
        assert pytest.approx(curve.evaluate(t), abs=1e-12) == y
        
    # Extrapolation or intermediate evaluation
    assert curve.evaluate(1.5) > 6.5
    assert curve.evaluate(1.5) < 7.0

# Test 10: Bootstrap Correctness (reprice par instruments)
def test_bootstrap_reprices_par():
    # Setup a flat par yield curve at 7.0%
    def flat_par_curve(t):
        return 7.0
        
    # Bootstrap zero curve up to 10Y (semi-annual steps)
    zc = bootstrap_zero_curve(flat_par_curve, max_maturity=10.0, step_size=0.5)
    
    # Verify that a 7% coupon bond at any semi-annual tenor prices to exactly 100
    for T in zc.maturities:
        # Cashflows for bond of maturity T:
        # Semi-annual payments: 3.5 coupon per step, and 100 principal at maturity
        c = 7.0 / 2.0
        steps = int(T / 0.5)
        price = 0.0
        for step in range(1, steps + 1):
            t_cf = step * 0.5
            cf_amount = c
            if step == steps:
                cf_amount += 100.0
            price += cf_amount * zc.get_discount_factor(t_cf)
            
        # Repriced bond must cost exactly 100.0 (par yield reproduced)
        assert pytest.approx(price, abs=1e-11) == 100.0

# Test 11: Calibration Validation & Fallback triggers on bad input
def test_calibration_validation_and_fallback():
    tenors = np.array([0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0, 40.0])
    
    # 1. Clean data should pass and fit NSS
    clean_yields = nss_yield(tenors, 7.2, -1.5, 2.0, -0.8, 1.5, 6.0)
    res_clean = calibrate_yield_curve(tenors, clean_yields)
    
    assert res_clean.passed
    assert not res_clean.fallback_used
    assert "beta0" in res_clean.parameters
    assert res_clean.rmse < 0.01 # extremely tight clean fit
    
    # 2. Heavily corrupted data should fail NSS and fallback to Cubic Spline
    # We introduce a massive outlier (e.g. 95% yield) which will violate smoothness or goodness-of-fit
    bad_yields = clean_yields.copy()
    bad_yields[4] = 95.0 # extreme spike at index 4 (3.0Y)
    
    res_bad = calibrate_yield_curve(tenors, bad_yields)
    
    assert not res_bad.passed
    assert res_bad.fallback_used
    assert len(res_bad.reasons) > 0
    # Must have used Spline fallback, which evaluates to a function
    assert res_bad.curve_fn is not None
    
    # Natural Cubic Spline will pass exactly through the node points (even the 95.0 outlier)
    assert pytest.approx(res_bad.curve_fn(3.0), abs=1e-11) == 95.0


# Pricing and Risk Core Tests

from quant_core import pricing, risk

# Test 12: Zero-coupon bond Macaulay duration sanity check
# A zero coupon bond with a single cashflow at maturity T must have Macaulay duration exactly equal to T.
def test_zcb_duration_sanity():
    settlement_date = date(2025, 1, 15)
    maturity_date = date(2030, 1, 15) # Exactly 5.0 years
    
    # 5-year zero coupon bond
    cashflows = [
        {"date": maturity_date, "amount": 100.0, "type": "redemption"}
    ]
    
    # Check duration at any YTM (e.g. 7.0%)
    mac_dur = risk.calculate_macaulay_duration(
        settlement_date=settlement_date,
        cashflows=cashflows,
        ytm=7.0,
        coupon_frequency=2
    )
    
    # Exactly 5.0 years in days / 365.0
    expected_t = (maturity_date - settlement_date).days / 365.0
    assert pytest.approx(mac_dur, abs=1e-12) == expected_t

# Test 13: G-Sec pricing, YTM, Macaulay, Modified duration, DV01, and Convexity
def test_gsec_pricing_and_risk():
    settlement_date = date(2025, 1, 15)
    issue_date = date(2025, 1, 15)
    maturity_date = date(2030, 1, 15) # 5.0 years
    coupon_rate = 6.0
    
    # Generate coupon cashflows (5.0 years, 10 semi-annual periods)
    cashflows = cashflow.generate_cashflows(
        issue_date=issue_date,
        maturity_date=maturity_date,
        coupon_rate=coupon_rate,
        coupon_frequency=2,
        face_value=100.0
    )
    
    # Setup flat par curve at 6.0% and bootstrap zero curve
    def flat_curve(t):
        return 6.0
    zc = bootstrap_zero_curve(flat_curve, max_maturity=10.0, step_size=0.5)
    
    # 1. Price Verification
    # Since coupon_rate (6%) = zero rate (6%) and flat curve, dirty price is approx 100.0 (deviates slightly due to day-count variance)
    dirty_price = pricing.calculate_dirty_price(settlement_date, cashflows, zc)
    clean_price = pricing.calculate_clean_price(
        settlement_date=settlement_date,
        issue_date=issue_date,
        maturity_date=maturity_date,
        coupon_rate=coupon_rate,
        cashflows=cashflows,
        zc=zc
    )
    
    assert pytest.approx(dirty_price, abs=1e-1) == 100.0
    assert pytest.approx(clean_price, abs=1e-1) == 100.0
    
    # 2. YTM Solver Verification
    # YTM should be close to 6.0%
    ytm = pricing.calculate_ytm(settlement_date, cashflows, dirty_price, coupon_frequency=2)
    assert pytest.approx(ytm, abs=1e-2) == 6.0
    
    # Repricing off the YTM must reproduce the dirty price exactly
    repriced_dirty = sum(
        cf["amount"] / ((1.0 + ytm / 200.0) ** (2.0 * ((cf["date"] - settlement_date).days / 365.0)))
        for cf in cashflows if (cf["date"] - settlement_date).days > 0
    )
    assert pytest.approx(repriced_dirty, abs=1e-11) == dirty_price
    
    # 3. Duration Verification
    # Macaulay duration must be less than 5.0 (due to coupon cashflows)
    mac_dur = risk.calculate_macaulay_duration(settlement_date, cashflows, ytm, coupon_frequency=2)
    assert 4.0 < mac_dur < 4.6
    
    # Modified duration = MacD / (1 + ytm/200) = MacD / 1.03 (approx)
    mod_dur = risk.calculate_modified_duration(mac_dur, ytm, coupon_frequency=2)
    assert pytest.approx(mod_dur, abs=1e-12) == mac_dur / (1.0 + ytm / 200.0)
    
    # 4. DV01 Verification (bump-and-reprice zero curve)
    # Approx: Price * ModDur * 0.0001 = 100 * 4.2 * 0.0001 = 0.042
    dv01 = risk.calculate_dv01(settlement_date, cashflows, zc)
    assert 0.040 < dv01 < 0.045
    
    # 5. Convexity Verification (symmetric bump-and-reprice zero curve)
    # 5-year bond convexity is positive and typically in the range [15, 30]
    conv = risk.calculate_convexity(settlement_date, cashflows, zc)
    assert 15.0 < conv < 30.0


# Scenario and KRD Engines Tests

from quant_core.scenario import apply_scenario_shocks, get_shocked_zero_curve
from quant_core.krd import calculate_key_rate_durations

# Test 14: Scenario factor shocks and twist rate preservation
def test_scenario_shocks():
    base_params = {
        "beta0": 7.0,
        "beta1": -2.0,
        "beta2": 3.0,
        "beta3": -1.0,
        "tau1": 2.0,
        "tau2": 5.0
    }
    
    # 1. Parallel shift (beta0 + 0.5)
    params_p = apply_scenario_shocks(base_params, parallel_shift=0.5)
    assert params_p["beta0"] == 7.5
    assert params_p["beta1"] == -2.0
    
    # 2. Slope shock (beta1 + 0.2)
    params_s = apply_scenario_shocks(base_params, slope_shock=0.2)
    assert params_s["beta0"] == 7.0
    assert params_s["beta1"] == -1.8
    
    # 3. Twist shock (rate at pivot must be preserved)
    pivot = 5.0
    params_t = apply_scenario_shocks(base_params, twist_shock=0.4, twist_pivot=pivot)
    
    # Evaluate rate at pivot 5.0 under base and twisted params
    rate_base = nss_yield(
        pivot, 
        base_params["beta0"], 
        base_params["beta1"], 
        base_params["beta2"], 
        base_params["beta3"], 
        base_params["tau1"], 
        base_params["tau2"]
    )
    rate_twisted = nss_yield(
        pivot, 
        params_t["beta0"], 
        params_t["beta1"], 
        params_t["beta2"], 
        params_t["beta3"], 
        params_t["tau1"], 
        params_t["tau2"]
    )
    
    # Rate at pivot must be exactly preserved!
    assert pytest.approx(float(rate_base), abs=1e-12) == float(rate_twisted)

# Test 15: KRD consistency and parallel DV01 / Modified Duration reconciliation
def test_krd_reconciliation():
    settlement_date = date(2025, 1, 15)
    issue_date = date(2025, 1, 15)
    maturity_date = date(2035, 1, 15) # 10-year G-Sec
    coupon_rate = 7.0
    
    cashflows = cashflow.generate_cashflows(
        issue_date=issue_date,
        maturity_date=maturity_date,
        coupon_rate=coupon_rate,
        coupon_frequency=2,
        face_value=100.0
    )
    
    # Setup flat 7% curve and bootstrap zero curve
    def flat_curve(t):
        return 7.0
    zc = bootstrap_zero_curve(flat_curve, max_maturity=15.0, step_size=0.5)
    
    p0 = pricing.calculate_dirty_price(settlement_date, cashflows, zc)
    assert pytest.approx(p0, abs=1e-1) == 100.0
    
    # Calculate overall parallel risk metrics
    ytm = pricing.calculate_ytm(settlement_date, cashflows, p0, coupon_frequency=2)
    mac_dur = risk.calculate_macaulay_duration(settlement_date, cashflows, ytm, coupon_frequency=2)
    mod_dur = risk.calculate_modified_duration(mac_dur, ytm, coupon_frequency=2)
    parallel_dv01 = risk.calculate_dv01(settlement_date, cashflows, zc)
    
    # Calculate Key Rate Durations
    krds = calculate_key_rate_durations(settlement_date, cashflows, zc)
    sum_krd = sum(krds)
    
    # 1. Reconciliation against Macaulay Duration
    # The sum of local key rate durations must approximately equal Macaulay Duration
    assert pytest.approx(sum_krd, rel=1e-3) == mac_dur
    
    # 2. Reconciliation against parallel DV01
    # Sum of KRD bucket sensitivities must equal parallel DV01
    # KRS_k = KRD_k * P0 * 0.0001
    sum_krs = sum_krd * p0 * 0.0001
    assert pytest.approx(sum_krs, rel=1e-3) == parallel_dv01


# Test 16: Factor-level P&L decomposition and Tenor-bucket risk contribution reconciliation
def test_factor_pnl_decomposition():
    settlement_date = date(2025, 1, 15)
    issue_date = date(2025, 1, 15)
    maturity_date = date(2030, 1, 15) # 5-year G-Sec
    coupon_rate = 6.0
    face_value = 1000000.0 # ₹10L

    cashflows = cashflow.generate_cashflows(
        issue_date=issue_date,
        maturity_date=maturity_date,
        coupon_rate=coupon_rate,
        coupon_frequency=2,
        face_value=100.0
    )

    # Base NSS parameters (typical curve shape)
    base_params = {
        "beta0": 7.0,
        "beta1": -1.0,
        "beta2": 2.0,
        "beta3": -1.0,
        "tau1": 2.0,
        "tau2": 8.0
    }

    # 1. Single factor shock case (Level shift only)
    decomp_level = risk.calculate_position_factor_pnl_decomposition(
        settlement_date=settlement_date,
        cashflows=cashflows,
        base_params=base_params,
        parallel_shift=0.10, # 10bps shift
        face_value=face_value
    )

    # Sum of parts must exactly equal total (reconciliation)
    sum_parts_level = (
        decomp_level["level"] +
        decomp_level["slope"] +
        decomp_level["curvature1"] +
        decomp_level["curvature2"] +
        decomp_level["residual"]
    )
    assert pytest.approx(sum_parts_level, abs=1e-10) == decomp_level["total"]
    # With only level shift, level contribution must dominate and others must be zero
    assert decomp_level["level"] != 0.0
    assert decomp_level["slope"] == 0.0
    assert decomp_level["curvature1"] == 0.0
    assert decomp_level["curvature2"] == 0.0

    # 2. Joint factor shock case (Parallel shift + Slope shock + Curvature shocks + Twist)
    decomp_joint = risk.calculate_position_factor_pnl_decomposition(
        settlement_date=settlement_date,
        cashflows=cashflows,
        base_params=base_params,
        parallel_shift=0.15,
        slope_shock=-0.05,
        curvature1_shock=0.08,
        curvature2_shock=-0.04,
        twist_shock=0.02,
        twist_pivot=5.0,
        face_value=face_value
    )

    sum_parts_joint = (
        decomp_joint["level"] +
        decomp_joint["slope"] +
        decomp_joint["curvature1"] +
        decomp_joint["curvature2"] +
        decomp_joint["residual"]
    )
    assert pytest.approx(sum_parts_joint, abs=1e-10) == decomp_joint["total"]
    assert decomp_joint["level"] != 0.0
    assert decomp_joint["slope"] != 0.0
    assert decomp_joint["curvature1"] != 0.0
    assert decomp_joint["curvature2"] != 0.0

    # 3. Tenor-bucket risk contribution check
    # Get base ZeroCurve and price
    def base_curve_fn(t):
        return nss_yield(t, **base_params)
    zc = bootstrap_zero_curve(base_curve_fn, max_maturity=10.0, step_size=0.5)

    p0 = pricing.calculate_dirty_price(settlement_date, cashflows, zc)
    pos_dv01 = risk.calculate_dv01(settlement_date, cashflows, zc) * (face_value / 100.0)

    # Tenor bucket sensitivities
    krds = calculate_key_rate_durations(settlement_date, cashflows, zc)
    krs_buckets = [krd * p0 * 0.0001 * (face_value / 100.0) for krd in krds]

    # Reconciliation: sum of bucket sensitivities must equal total position parallel DV01
    sum_krs = sum(krs_buckets)
    assert pytest.approx(sum_krs, rel=1e-3) == pos_dv01


# Test 17: Historical scenario calibration
def test_historical_calibration():
    from quant_core.historical_calibration import calibrate_factor_shocks_from_history
    import datetime

    # 1. Insufficient data
    res_insufficient = calibrate_factor_shocks_from_history([])
    assert res_insufficient["confidence_level"] == "insufficient_data"
    assert res_insufficient["parallel_shift"] == 0.0

    # 2. Known distribution (constant changes)
    calibrations = []
    base_date = datetime.date(2025, 1, 1)

    for i in range(101):
        calibrations.append({
            "curve_date": base_date + datetime.timedelta(days=i),
            "beta0": 7.0 + 0.1 * i,
            "beta1": -1.0 + 0.2 * i,
            "beta2": 2.0 + 0.3 * i,
            "beta3": -1.0 + 0.4 * i
        })

    res = calibrate_factor_shocks_from_history(calibrations)
    assert res["data_points"] == 101
    assert res["confidence_level"] == "medium"
    assert pytest.approx(res["parallel_shift"]) == 0.1
    assert pytest.approx(res["slope_shock"]) == 0.2
    assert pytest.approx(res["curvature1_shock"]) == 0.3
    assert pytest.approx(res["curvature2_shock"]) == 0.4
    assert res["earliest_date"] == "2025-01-01"
    assert res["latest_date"] == "2025-04-11"






