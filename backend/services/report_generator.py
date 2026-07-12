import os
import logging
import numpy as np
from datetime import datetime, timezone
from db.session import SessionLocal

from db.models import (
    Portfolio, PortfolioPosition, Security, CurveCalibration, ReportGeneration,
)
from quant_core.conventions import get_settlement_date, calculate_accrued_interest
from quant_core.cashflow import generate_cashflows
from quant_core.bootstrap import bootstrap_zero_curve
from quant_core.pricing import calculate_dirty_price, calculate_clean_price, calculate_ytm
from quant_core.risk import (
    calculate_macaulay_duration, calculate_modified_duration, calculate_dv01, calculate_convexity,
)
from quant_core.scenario import apply_scenario_shocks
from quant_core.krd import calculate_key_rate_durations, DEFAULT_KEY_TENORS
from quant_core.nss import nss_yield

logger = logging.getLogger("report_generator")

REPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")


def _build_zero_curve(params: dict):
    fn = lambda t: nss_yield(t, params["beta0"], params["beta1"], params["beta2"],
                             params["beta3"], params["tau1"], params["tau2"])
    return bootstrap_zero_curve(fn, 40.0, 0.5)


def _compute_position(sec, face_value, base_zc, shocked_zc, sd):
    issue_date = sec.issue_date
    maturity_date = sec.maturity_date
    coupon_rate = float(sec.coupon_rate)
    freq = int(sec.coupon_frequency or 2)

    cfs = generate_cashflows(issue_date, maturity_date, coupon_rate, freq, 100.0)

    base_accrued = calculate_accrued_interest(sd, issue_date, maturity_date, coupon_rate, freq, 100.0)
    base_dirty = calculate_dirty_price(sd, cfs, base_zc)
    base_clean = calculate_clean_price(sd, issue_date, maturity_date, coupon_rate, cfs, base_zc, freq, 100.0)
    ytm = calculate_ytm(sd, cfs, base_dirty, freq)
    mac_dur = calculate_macaulay_duration(sd, cfs, ytm, freq)
    mod_dur = calculate_modified_duration(mac_dur, ytm, freq)
    dv01 = calculate_dv01(sd, cfs, base_zc)
    conv = calculate_convexity(sd, cfs, base_zc)
    krd = calculate_key_rate_durations(sd, cfs, base_zc, DEFAULT_KEY_TENORS)

    shocked_dirty = calculate_dirty_price(sd, cfs, shocked_zc)
    shocked_clean = calculate_clean_price(sd, issue_date, maturity_date, coupon_rate, cfs, shocked_zc, freq, 100.0)
    pnl = (shocked_dirty - base_dirty) * (face_value / 100.0)

    return {
        "isin": sec.isin,
        "name": sec.security_name,
        "face_value": face_value,
        "base_clean": base_clean,
        "base_dirty": base_dirty,
        "accrued": base_accrued,
        "ytm": ytm,
        "mac_dur": mac_dur,
        "mod_dur": mod_dur,
        "dv01": dv01 * (face_value / 100.0),
        "convexity": conv,
        "krd": krd,
        "shocked_dirty": shocked_dirty,
        "shocked_clean": shocked_clean,
        "pnl": pnl,
    }


def _aggregate(positions):
    total_base_dirty = sum(p["base_dirty"] * (p["face_value"] / 100.0) for p in positions)
    total_base_clean = sum(p["base_clean"] * (p["face_value"] / 100.0) for p in positions)
    total_shocked_dirty = sum(p["shocked_dirty"] * (p["face_value"] / 100.0) for p in positions)
    total_pnl = sum(p["pnl"] for p in positions)
    total_dv01 = sum(p["dv01"] for p in positions)

    if total_base_dirty > 0:
        port_mac = sum(p["mac_dur"] * p["base_dirty"] * (p["face_value"] / 100.0) for p in positions) / total_base_dirty
        port_mod = sum(p["mod_dur"] * p["base_dirty"] * (p["face_value"] / 100.0) for p in positions) / total_base_dirty
        port_conv = sum(p["convexity"] * p["base_dirty"] * (p["face_value"] / 100.0) for p in positions) / total_base_dirty
    else:
        port_mac = port_mod = port_conv = 0.0

    port_krd = [0.0] * len(DEFAULT_KEY_TENORS)
    for p in positions:
        for k in range(len(DEFAULT_KEY_TENORS)):
            port_krd[k] += p["krd"][k] * (p["face_value"] / 100.0)

    return {
        "total_base_dirty": total_base_dirty,
        "total_base_clean": total_base_clean,
        "total_shocked_dirty": total_shocked_dirty,
        "total_pnl": total_pnl,
        "total_dv01": total_dv01,
        "port_mac_dur": port_mac,
        "port_mod_dur": port_mod,
        "port_convexity": port_conv,
        "port_krd": port_krd,
    }


def generate_report(report_id: str):
    """Background task: re-derives portfolio/scenario results server-side and renders document."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    db = SessionLocal()

    try:
        rec = db.query(ReportGeneration).filter(ReportGeneration.id == report_id).first()
        if not rec:
            logger.error(f"Report record {report_id} not found")
            return

        # Load portfolio
        portfolio = db.query(Portfolio).filter(Portfolio.id == rec.portfolio_id).first()
        if not portfolio:
            raise ValueError(f"Portfolio {rec.portfolio_id} not found")

        positions_db = (
            db.query(PortfolioPosition, Security)
            .join(Security, PortfolioPosition.security_id == Security.id)
            .filter(PortfolioPosition.portfolio_id == rec.portfolio_id)
            .all()
        )
        if not positions_db:
            raise ValueError("Portfolio has no positions")

        # Load latest curve calibration
        cal = (
            db.query(CurveCalibration)
            .filter(CurveCalibration.is_active == True)
            .order_by(CurveCalibration.curve_date.desc())
            .first()
        )
        if not cal:
            raise ValueError("No active curve calibration found")

        base_params = {
            "beta0": float(cal.beta0), "beta1": float(cal.beta1),
            "beta2": float(cal.beta2), "beta3": float(cal.beta3),
            "tau1": float(cal.tau1), "tau2": float(cal.tau2),
        }
        base_zc = _build_zero_curve(base_params)
        curve_date = cal.curve_date
        sd = get_settlement_date(curve_date)

        scenarios = rec.scenario_config if isinstance(rec.scenario_config, list) else [rec.scenario_config]
        scenario_results = []

        for sc in scenarios:
            shocks = {
                "parallel_shift": sc.get("parallel_shift", 0.0),
                "slope_shock": sc.get("slope_shock", 0.0),
                "curvature1_shock": sc.get("curvature1_shock", 0.0),
                "curvature2_shock": sc.get("curvature2_shock", 0.0),
                "twist_shock": sc.get("twist_shock", 0.0),
                "twist_pivot": sc.get("twist_pivot", 5.0),
            }
            shocked_params = apply_scenario_shocks(base_params, **shocks)
            shocked_zc = _build_zero_curve(shocked_params)

            pos_results = []
            for pp, sec in positions_db:
                pos_results.append(_compute_position(sec, float(pp.face_value_held), base_zc, shocked_zc, sd))

            agg = _aggregate(pos_results)
            scenario_results.append({
                "name": sc.get("name", "Scenario"),
                "shocks": shocks,
                "positions": pos_results,
                "summary": agg,
                "shocked_params": shocked_params,
            })

        # Build zero curve data for report
        base_zc_data = []
        for t in np.arange(0.5, 30.5, 0.5):
            base_zc_data.append({"tenor": t, "rate": base_zc.get_zero_rate(t), "df": base_zc.get_discount_factor(t)})

        ext = "pdf" if rec.format == "pdf" else "xlsx"
        file_path = os.path.join(REPORTS_DIR, f"{report_id}.{ext}")

        if rec.format == "pdf":
            _render_pdf(file_path, portfolio.portfolio_name, curve_date, scenario_results, base_zc_data)
        else:
            _render_xlsx(file_path, portfolio.portfolio_name, curve_date, scenario_results, base_zc_data)

        rec.status = "completed"
        rec.storage_path = file_path
        rec.generated_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Report {report_id} generated: {file_path}")

    except Exception as e:
        logger.error(f"Report {report_id} failed: {e}")
        rec.status = "failed"
        rec.error_message = str(e)
        db.commit()
    finally:
        db.close()


def _render_pdf(path, portfolio_name, curve_date, scenario_results, base_zc_data):
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Title page
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, "BondFactor Risk Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, f"Portfolio: {portfolio_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Curve Date: {curve_date}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Scenarios: {len(scenario_results)}", new_x="LMARGIN", new_y="NEXT")

    for sc_idx, sc in enumerate(scenario_results):
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 13)
        pdf.cell(0, 10, f"Scenario: {sc['name']}", new_x="LMARGIN", new_y="NEXT")

        # Scenario parameters
        pdf.set_font("Helvetica", "", 9)
        s = sc["shocks"]
        pdf.cell(0, 6, f"Parallel: {s['parallel_shift']:+.2f}%  Slope: {s['slope_shock']:+.2f}%  "
                        f"Curvature1: {s['curvature1_shock']:+.2f}%  Curvature2: {s['curvature2_shock']:+.2f}%  "
                        f"Twist: {s['twist_shock']:+.2f}%  Pivot: {s['twist_pivot']:.1f}Y",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        # Risk summary
        agg = sc["summary"]
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 7, "Portfolio Risk Summary", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        for label, val, fmt in [
            ("Total Base Dirty Value", agg["total_base_dirty"], "₹{:,.2f}"),
            ("Total Base Clean Value", agg["total_base_clean"], "₹{:,.2f}"),
            ("Total Shocked Dirty Value", agg["total_shocked_dirty"], "₹{:,.2f}"),
            ("Scenario P&L", agg["total_pnl"], "₹{:+,.2f}"),
            ("Modified Duration", agg["port_mod_dur"], "{:.4f} Y"),
            ("Total DV01", agg["total_dv01"], "₹{:,.2f}"),
            ("Convexity", agg["port_convexity"], "{:.4f}"),
        ]:
            pdf.cell(80, 6, label + ":")
            pdf.cell(0, 6, fmt.format(val), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        # Zero curve table
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 7, "Zero Curve (Base)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(30, 5, "Tenor")
        pdf.cell(30, 5, "Zero Rate (%)")
        pdf.cell(30, 5, "Discount Factor")
        pdf.ln()
        pdf.set_font("Helvetica", "", 8)
        for pt in base_zc_data:
            pdf.cell(30, 5, f"{pt['tenor']:.1f}Y")
            pdf.cell(30, 5, f"{pt['rate']:.4f}")
            pdf.cell(30, 5, f"{pt['df']:.6f}")
            pdf.ln()
        pdf.ln(3)

        # Positions table
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 7, "Portfolio Positions", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 7)
        headers = ["ISIN", "Face Value", "Clean", "Dirty", "YTM%", "ModDur", "DV01", "P&L"]
        widths = [30, 22, 20, 20, 15, 15, 20, 22]
        for h, w in zip(headers, widths):
            pdf.cell(w, 5, h)
        pdf.ln()
        pdf.set_font("Helvetica", "", 7)
        for p in sc["positions"]:
            pdf.cell(widths[0], 5, str(p["isin"])[:15])
            pdf.cell(widths[1], 5, f"{p['face_value']:,.0f}")
            pdf.cell(widths[2], 5, f"{p['base_clean']:.4f}")
            pdf.cell(widths[3], 5, f"{p['base_dirty']:.4f}")
            pdf.cell(widths[4], 5, f"{p['ytm']:.3f}")
            pdf.cell(widths[5], 5, f"{p['mod_dur']:.3f}")
            pdf.cell(widths[6], 5, f"{p['dv01']:,.0f}")
            pdf.cell(widths[7], 5, f"{p['pnl']:+,.2f}")
            pdf.ln()

        # KRD table
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 7, "Key Rate Durations", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 8)
        tenor_labels = [f"{t}Y" if t >= 1 else f"{int(t*12)}M" for t in DEFAULT_KEY_TENORS]
        for lbl in tenor_labels:
            pdf.cell(15, 5, lbl)
        pdf.ln()
        pdf.set_font("Helvetica", "", 8)
        for krd_val in agg["port_krd"]:
            pdf.cell(15, 5, f"{krd_val:.3f}")
        pdf.ln()

    pdf.output(path)


def _render_xlsx(path, portfolio_name, curve_date, scenario_results, base_zc_data):
    from openpyxl import Workbook
    from openpyxl.chart import LineChart, Reference, BarChart

    wb = Workbook()

    # Summary sheet
    ws = wb.active
    ws.title = "Summary"
    ws.append(["BondFactor Risk Report"])
    ws.append([f"Portfolio: {portfolio_name}"])
    ws.append([f"Curve Date: {curve_date}"])
    ws.append([f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"])
    ws.append([])

    for sc in scenario_results:
        ws.append([f"Scenario: {sc['name']}"])
        agg = sc["summary"]
        for label, val in [
            ("Total Base Dirty Value", agg["total_base_dirty"]),
            ("Total Base Clean Value", agg["total_base_clean"]),
            ("Total Shocked Dirty Value", agg["total_shocked_dirty"]),
            ("Scenario P&L", agg["total_pnl"]),
            ("Modified Duration", agg["port_mod_dur"]),
            ("Total DV01", agg["total_dv01"]),
            ("Convexity", agg["port_convexity"]),
        ]:
            ws.append([label, val])
        ws.append([])

    # Zero curve sheet
    ws_zc = wb.create_sheet("Zero Curve")
    ws_zc.append(["Tenor (Y)", "Zero Rate (%)", "Discount Factor"])
    for pt in base_zc_data:
        ws_zc.append([pt["tenor"], pt["rate"], pt["df"]])

    chart = LineChart()
    chart.title = "Base Zero Curve"
    chart.y_axis.title = "Zero Rate (%)"
    chart.x_axis.title = "Maturity (Years)"
    chart.width = 20
    chart.height = 12
    data_ref = Reference(ws_zc, min_col=2, min_row=1, max_row=len(base_zc_data) + 1)
    cats = Reference(ws_zc, min_col=1, min_row=2, max_row=len(base_zc_data) + 1)
    chart.add_data(data_ref, titles_from_data=True)
    chart.set_categories(cats)
    ws_zc.add_chart(chart, "E2")

    # Per-scenario sheets
    for sc_idx, sc in enumerate(scenario_results):
        ws_sc = wb.create_sheet(f"Scenario {sc_idx + 1}")
        ws_sc.append([f"Scenario: {sc['name']}"])
        ws_sc.append([])

        # Positions
        ws_sc.append(["ISIN", "Security", "Face Value", "Base Clean", "Base Dirty", "Accrued",
                       "YTM%", "Mod Dur", "DV01", "Convexity", "Shocked Dirty", "P&L"])
        for p in sc["positions"]:
            ws_sc.append([p["isin"], p["name"], p["face_value"], p["base_clean"], p["base_dirty"],
                          p["accrued"], p["ytm"], p["mod_dur"], p["dv01"], p["convexity"],
                          p["shocked_dirty"], p["pnl"]])

        # KRD sheet
        ws_krd = wb.create_sheet(f"KRD {sc_idx + 1}")
        tenor_labels = [f"{t}Y" if t >= 1 else f"{int(t*12)}M" for t in DEFAULT_KEY_TENORS]
        ws_krd.append(["Tenor"] + tenor_labels)
        ws_krd.append(["Portfolio KRD"] + sc["summary"]["port_krd"])

        krd_chart = BarChart()
        krd_chart.title = f"KRD Profile — {sc['name']}"
        krd_chart.y_axis.title = "Duration"
        krd_chart.width = 20
        krd_chart.height = 12
        krd_data = Reference(ws_krd, min_col=2, max_col=len(tenor_labels) + 1, min_row=2)
        krd_cats = Reference(ws_krd, min_col=2, max_col=len(tenor_labels) + 1, min_row=1)
        krd_chart.add_data(krd_data, from_rows=True, titles_from_data=False)
        krd_chart.set_categories(krd_cats)
        ws_krd.add_chart(krd_chart, "A4")

    wb.save(path)
