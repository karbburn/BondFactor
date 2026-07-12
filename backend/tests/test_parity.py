import os
import json
from datetime import datetime, date
import numpy as np
import pytest

from quant_core.conventions import get_settlement_date, calculate_accrued_interest
from quant_core.cashflow import generate_cashflows
from quant_core.nss import nss_yield
from quant_core.bootstrap import bootstrap_zero_curve
from quant_core.pricing import calculate_dirty_price, calculate_clean_price, calculate_ytm
from quant_core.risk import calculate_macaulay_duration, calculate_modified_duration, calculate_dv01, calculate_convexity, calculate_position_factor_pnl_decomposition
from quant_core.krd import calculate_key_rate_durations
from quant_core.scenario import apply_scenario_shocks, get_shocked_zero_curve

def test_generate_parity_outputs():
    # Load inputs
    fixtures_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures", "parity_fixtures.json"))
    with open(fixtures_path, "r", encoding="utf-8") as f:
        fixtures = json.load(f)
        
    outputs = {}
    
    baseline_nss = fixtures["baseline_nss"]
    params = [
        baseline_nss["beta0"], 
        baseline_nss["beta1"], 
        baseline_nss["beta2"], 
        baseline_nss["beta3"], 
        baseline_nss["tau1"], 
        baseline_nss["tau2"]
    ]
    
    def base_par_curve(t):
        return nss_yield(t, *params)
        
    # Baseline Zero Curve
    zc = bootstrap_zero_curve(base_par_curve, max_maturity=40.0, step_size=0.5)
    
    # Save baseline zero rates and discount factors on a grid
    grid = fixtures["key_tenors"]
    baseline_zc_rates = [zc.get_zero_rate(t) for t in grid]
    baseline_zc_dfs = [zc.get_discount_factor(t) for t in grid]
    
    outputs["baseline_curve"] = {
        "grid": grid,
        "zero_rates": baseline_zc_rates,
        "discount_factors": baseline_zc_dfs
    }
    
    outputs["trade_dates"] = {}
    
    for td_str in fixtures["trade_dates"]:
        td = datetime.strptime(td_str, "%Y-%m-%d").date()
        sd = get_settlement_date(td)
        sd_str = sd.strftime("%Y-%m-%d")
        
        td_data = {
            "settlement_date": sd_str,
            "bonds": {}
        }
        
        for bond in fixtures["portfolio"]:
            bond_id = bond["id"]
            issue_date = datetime.strptime(bond["issue_date"], "%Y-%m-%d").date()
            maturity_date = datetime.strptime(bond["maturity_date"], "%Y-%m-%d").date()
            coupon_rate = bond["coupon_rate"]
            face_value = bond["face_value"]
            
            cfs = generate_cashflows(issue_date, maturity_date, coupon_rate, coupon_frequency=2, face_value=face_value)
            cfs_serialized = [
                {"date": cf["date"].strftime("%Y-%m-%d"), "amount": cf["amount"], "type": cf["type"]} 
                for cf in cfs
            ]
            
            accrued = calculate_accrued_interest(
                sd, issue_date, maturity_date, coupon_rate, coupon_frequency=2, face_value=face_value
            )
            dirty_price = calculate_dirty_price(sd, cfs, zc)
            clean_price = calculate_clean_price(
                sd, issue_date, maturity_date, coupon_rate, cfs, zc, coupon_frequency=2, face_value=face_value
            )
            ytm = calculate_ytm(sd, cfs, dirty_price, coupon_frequency=2)
            mac_dur = calculate_macaulay_duration(sd, cfs, ytm, coupon_frequency=2)
            mod_dur = calculate_modified_duration(mac_dur, ytm, coupon_frequency=2)
            dv01 = calculate_dv01(sd, cfs, zc)
            conv = calculate_convexity(sd, cfs, zc)
            krd = calculate_key_rate_durations(sd, cfs, zc, fixtures["key_tenors"])
            
            td_data["bonds"][bond_id] = {
                "accrued_interest": accrued,
                "cashflows": cfs_serialized,
                "dirty_price": dirty_price,
                "clean_price": clean_price,
                "ytm": ytm,
                "macaulay_duration": mac_dur,
                "modified_duration": mod_dur,
                "dv01": dv01,
                "convexity": conv,
                "krd": krd
            }
            
        td_data["scenarios"] = {}
        for scen in fixtures["scenarios"]:
            scen_name = scen["name"]
            shocks = scen["shocks"]
            
            # Shocked curve
            zc_scen = get_shocked_zero_curve(baseline_nss, **shocks, max_maturity=40.0, step_size=0.5)
            scen_zc_rates = [zc_scen.get_zero_rate(t) for t in grid]
            scen_zc_dfs = [zc_scen.get_discount_factor(t) for t in grid]
            
            scen_data = {
                "zero_rates": scen_zc_rates,
                "discount_factors": scen_zc_dfs,
                "bonds": {}
            }
            
            for bond in fixtures["portfolio"]:
                bond_id = bond["id"]
                issue_date = datetime.strptime(bond["issue_date"], "%Y-%m-%d").date()
                maturity_date = datetime.strptime(bond["maturity_date"], "%Y-%m-%d").date()
                coupon_rate = bond["coupon_rate"]
                face_value = bond["face_value"]
                
                cfs = generate_cashflows(issue_date, maturity_date, coupon_rate, coupon_frequency=2, face_value=face_value)
                
                dirty_price = calculate_dirty_price(sd, cfs, zc_scen)
                clean_price = calculate_clean_price(
                    sd, issue_date, maturity_date, coupon_rate, cfs, zc_scen, coupon_frequency=2, face_value=face_value
                )
                ytm = calculate_ytm(sd, cfs, dirty_price, coupon_frequency=2)
                mac_dur = calculate_macaulay_duration(sd, cfs, ytm, coupon_frequency=2)
                mod_dur = calculate_modified_duration(mac_dur, ytm, coupon_frequency=2)
                dv01 = calculate_dv01(sd, cfs, zc_scen)
                conv = calculate_convexity(sd, cfs, zc_scen)
                krd = calculate_key_rate_durations(sd, cfs, zc_scen, fixtures["key_tenors"])
                factor_pnl = calculate_position_factor_pnl_decomposition(
                    settlement_date=sd,
                    cashflows=cfs,
                    base_params=baseline_nss,
                    parallel_shift=shocks.get("parallel_shift", 0.0),
                    slope_shock=shocks.get("slope_shock", 0.0),
                    curvature1_shock=shocks.get("curvature1_shock", 0.0),
                    curvature2_shock=shocks.get("curvature2_shock", 0.0),
                    twist_shock=shocks.get("twist_shock", 0.0),
                    twist_pivot=shocks.get("twist_pivot", 5.0),
                    face_value=face_value
                )
                
                scen_data["bonds"][bond_id] = {
                    "dirty_price": dirty_price,
                    "clean_price": clean_price,
                    "ytm": ytm,
                    "macaulay_duration": mac_dur,
                    "modified_duration": mod_dur,
                    "dv01": dv01,
                    "convexity": conv,
                    "krd": krd,
                    "factor_pnl": factor_pnl
                }
            td_data["scenarios"][scen_name] = scen_data
            
        outputs["trade_dates"][td_str] = td_data
        
    # Write output fixtures
    outputs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures", "parity_outputs.json"))
    with open(outputs_path, "w", encoding="utf-8") as f:
        json.dump(outputs, f, indent=2)

    for td_str, td_data in outputs["trade_dates"].items():
        for bond_id, bond in td_data["bonds"].items():
            for metric in ["dirty_price", "clean_price", "ytm", "macaulay_duration",
                           "modified_duration", "dv01", "convexity", "accrued_interest"]:
                assert np.isfinite(bond[metric]), f"{td_str}/{bond_id}/{metric} not finite"
            for i, k in enumerate(bond["krd"]):
                assert np.isfinite(k), f"{td_str}/{bond_id}/krd[{i}] not finite"
