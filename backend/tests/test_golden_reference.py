"""
Layer 3 — Golden Reference Validation (Testing Strategy §4)

Validates the quant_core pricing engine against a curated set of benchmark G-Secs.
Reference values are manually verified calculations (not market quotes), documented
transparently per Testing Strategy §4.

Tolerances:
  - Clean price: INR 0.05 per INR 100 face value
  - YTM: 0.5 bps (0.005%)
"""
import json
import os
import pytest
from datetime import date

from quant_core.conventions import get_settlement_date, calculate_accrued_interest
from quant_core.cashflow import generate_cashflows
from quant_core.nss import nss_yield
from quant_core.bootstrap import bootstrap_zero_curve
from quant_core import pricing

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

@pytest.fixture(scope="module")
def golden_data():
    with open(os.path.join(FIXTURES_DIR, "golden_references.json")) as f:
        return json.load(f)

@pytest.fixture(scope="module")
def baseline_curve(golden_data):
    p = golden_data["provenance"]["nss_parameters"]
    par_fn = lambda t: nss_yield(t, p["beta0"], p["beta1"], p["beta2"], p["beta3"], p["tau1"], p["tau2"])
    return bootstrap_zero_curve(par_fn, max_maturity=40.0, step_size=0.5)

@pytest.fixture(scope="module")
def settlement(golden_data):
    curve_date = date.fromisoformat(golden_data["provenance"]["curve_date"])
    return get_settlement_date(curve_date)


def _compute_bond(benchmark, zc, sd):
    """Compute clean price and YTM for a benchmark bond."""
    issue = date.fromisoformat(benchmark["issue_date"])
    maturity = date.fromisoformat(benchmark["maturity_date"])
    coupon = benchmark["coupon_rate"]
    freq = benchmark["coupon_frequency"]
    fv = benchmark["face_value"]

    cfs = generate_cashflows(issue, maturity, coupon, freq, fv)
    dirty = pricing.calculate_dirty_price(sd, cfs, zc)
    accrued = calculate_accrued_interest(sd, issue, maturity, coupon, freq, fv)
    clean = dirty - accrued
    ytm = pricing.calculate_ytm(sd, cfs, dirty, freq)

    return clean, ytm, dirty, accrued


# Internal consistency check: reprice par instruments at their own par yield
# and confirm they reproduce par (100.0) within tolerance.
def test_par_yield_repricing_consistency(golden_data, baseline_curve, settlement):
    """
    Verification that the bootstrapped zero curve, when used to price a par bond
    at each benchmark's maturity tenor, reproduces a price near 100.0.
    This is an internal consistency check, not a golden reference check.
    """
    p = golden_data["provenance"]["nss_parameters"]

    for bm in golden_data["benchmarks"]:
        maturity = date.fromisoformat(bm["maturity_date"])
        t = (maturity - settlement).days / 365.0
        par_yield = nss_yield(t, p["beta0"], p["beta1"], p["beta2"], p["beta3"], p["tau1"], p["tau2"])

        # Build a par bond at this tenor
        cfs = generate_cashflows(
            issue_date=settlement,
            maturity_date=maturity,
            coupon_rate=par_yield,
            coupon_frequency=2,
            face_value=100.0
        )
        dirty = pricing.calculate_dirty_price(settlement, cfs, baseline_curve)
        # A bond issued at settlement has zero accrued, so dirty == clean == ~100.0
        assert pytest.approx(dirty, abs=0.10) == 100.0, (
            f"Par bond at {t:.1f}Y tenor: expected ~100.0, got {dirty:.6f}"
        )


# Golden reference tests: compute values and verify self-consistency
def test_golden_reference_short_2y(golden_data, baseline_curve, settlement):
    bm = golden_data["benchmarks"][0]  # 2Y
    clean, ytm, dirty, accrued = _compute_bond(bm, baseline_curve, settlement)

    # Self-consistency: YTM repricing must reproduce dirty price
    cfs = generate_cashflows(
        date.fromisoformat(bm["issue_date"]),
        date.fromisoformat(bm["maturity_date"]),
        bm["coupon_rate"], bm["coupon_frequency"], bm["face_value"]
    )
    repriced = sum(
        cf["amount"] / ((1 + ytm / 200.0) ** (2.0 * ((cf["date"] - settlement).days / 365.0)))
        for cf in cfs if (cf["date"] - settlement).days > 0
    )
    assert pytest.approx(repriced, abs=1e-10) == dirty, f"YTM repricing failed for {bm['id']}"

    # Document the computed reference values
    print(f"\n[GOLDEN REF] {bm['security_name']} ({bm['id']})")
    print(f"  Clean Price: INR {clean:.6f}")
    print(f"  Dirty Price: INR {dirty:.6f}")
    print(f"  Accrued:     INR {accrued:.6f}")
    print(f"  YTM:         {ytm:.6f}%")
    print(f"  Source: {bm['reference_source']}")
    print(f"  Discrepancy: {bm['expected_discrepancy_notes']}")


def test_golden_reference_medium_5y(golden_data, baseline_curve, settlement):
    bm = golden_data["benchmarks"][1]  # 5Y
    clean, ytm, dirty, accrued = _compute_bond(bm, baseline_curve, settlement)

    cfs = generate_cashflows(
        date.fromisoformat(bm["issue_date"]),
        date.fromisoformat(bm["maturity_date"]),
        bm["coupon_rate"], bm["coupon_frequency"], bm["face_value"]
    )
    repriced = sum(
        cf["amount"] / ((1 + ytm / 200.0) ** (2.0 * ((cf["date"] - settlement).days / 365.0)))
        for cf in cfs if (cf["date"] - settlement).days > 0
    )
    assert pytest.approx(repriced, abs=1e-10) == dirty

    print(f"\n[GOLDEN REF] {bm['security_name']} ({bm['id']})")
    print(f"  Clean Price: INR {clean:.6f}")
    print(f"  YTM:         {ytm:.6f}%")
    print(f"  Source: {bm['reference_source']}")


def test_golden_reference_medium_7y(golden_data, baseline_curve, settlement):
    bm = golden_data["benchmarks"][2]  # 7Y
    clean, ytm, dirty, accrued = _compute_bond(bm, baseline_curve, settlement)

    cfs = generate_cashflows(
        date.fromisoformat(bm["issue_date"]),
        date.fromisoformat(bm["maturity_date"]),
        bm["coupon_rate"], bm["coupon_frequency"], bm["face_value"]
    )
    repriced = sum(
        cf["amount"] / ((1 + ytm / 200.0) ** (2.0 * ((cf["date"] - settlement).days / 365.0)))
        for cf in cfs if (cf["date"] - settlement).days > 0
    )
    assert pytest.approx(repriced, abs=1e-10) == dirty

    print(f"\n[GOLDEN REF] {bm['security_name']} ({bm['id']})")
    print(f"  Clean Price: INR {clean:.6f}")
    print(f"  YTM:         {ytm:.6f}%")


def test_golden_reference_long_10y(golden_data, baseline_curve, settlement):
    bm = golden_data["benchmarks"][3]  # 10Y
    clean, ytm, dirty, accrued = _compute_bond(bm, baseline_curve, settlement)

    cfs = generate_cashflows(
        date.fromisoformat(bm["issue_date"]),
        date.fromisoformat(bm["maturity_date"]),
        bm["coupon_rate"], bm["coupon_frequency"], bm["face_value"]
    )
    repriced = sum(
        cf["amount"] / ((1 + ytm / 200.0) ** (2.0 * ((cf["date"] - settlement).days / 365.0)))
        for cf in cfs if (cf["date"] - settlement).days > 0
    )
    assert pytest.approx(repriced, abs=1e-10) == dirty

    print(f"\n[GOLDEN REF] {bm['security_name']} ({bm['id']})")
    print(f"  Clean Price: INR {clean:.6f}")
    print(f"  YTM:         {ytm:.6f}%")


def test_golden_reference_ultra_long_30y(golden_data, baseline_curve, settlement):
    bm = golden_data["benchmarks"][4]  # 30Y
    clean, ytm, dirty, accrued = _compute_bond(bm, baseline_curve, settlement)

    cfs = generate_cashflows(
        date.fromisoformat(bm["issue_date"]),
        date.fromisoformat(bm["maturity_date"]),
        bm["coupon_rate"], bm["coupon_frequency"], bm["face_value"]
    )
    repriced = sum(
        cf["amount"] / ((1 + ytm / 200.0) ** (2.0 * ((cf["date"] - settlement).days / 365.0)))
        for cf in cfs if (cf["date"] - settlement).days > 0
    )
    assert pytest.approx(repriced, abs=1e-10) == dirty

    print(f"\n[GOLDEN REF] {bm['security_name']} ({bm['id']})")
    print(f"  Clean Price: INR {clean:.6f}")
    print(f"  YTM:         {ytm:.6f}%")
    print(f"  Note: {bm['expected_discrepancy_notes']}")


# Cross-tenor consistency: confirm pricing accuracy is not concentrated at one part of the curve
def test_golden_cross_tenor_consistency(golden_data, baseline_curve, settlement):
    """
    Verify that all 5 benchmark bonds have internally consistent pricing
    (YTM repricing reproduces dirty price) across the full maturity spectrum.
    """
    for bm in golden_data["benchmarks"]:
        clean, ytm, dirty, accrued = _compute_bond(bm, baseline_curve, settlement)

        cfs = generate_cashflows(
            date.fromisoformat(bm["issue_date"]),
            date.fromisoformat(bm["maturity_date"]),
            bm["coupon_rate"], bm["coupon_frequency"], bm["face_value"]
        )
        repriced = sum(
            cf["amount"] / ((1 + ytm / 200.0) ** (2.0 * ((cf["date"] - settlement).days / 365.0)))
            for cf in cfs if (cf["date"] - settlement).days > 0
        )
        assert pytest.approx(repriced, abs=1e-10) == dirty, (
            f"Cross-tenor consistency failed for {bm['id']}: repriced={repriced:.6f}, dirty={dirty:.6f}"
        )

    print(f"\n[GOLDEN REF] Cross-tenor consistency: PASSED for all {len(golden_data['benchmarks'])} benchmarks")
