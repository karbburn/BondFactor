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
        from datetime import timedelta
        stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        stale = db.query(ReportGeneration).filter(
            ReportGeneration.status == "processing",
            ReportGeneration.created_at < stale_cutoff,
        ).all()
        for s in stale:
            s.status = "failed"
            s.error_message = "Timed out"
        if stale:
            db.commit()

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
        try:
            if 'rec' in locals() and rec is not None:
                rec.status = "failed"
                rec.error_message = str(e)
                db.commit()
        except Exception:
            logger.error(f"Failed to update report status for {report_id}")
    finally:
        db.close()


def _render_pdf(path, portfolio_name, curve_date, scenario_results, base_zc_data):
    from fpdf import FPDF

    C_BG = (10, 10, 15)
    C_SURFACE = (17, 17, 25)
    C_ELEVATED = (26, 27, 34)
    C_ACCENT = (242, 169, 0)
    C_TEXT = (232, 230, 225)
    C_DIM = (136, 136, 136)
    C_BORDER = (51, 51, 64)
    C_POS = (45, 155, 117)
    C_NEG = (196, 85, 58)
    SITE_URL = "https://bondfactor.vercel.app"
    LINKEDIN_URL = "https://linkedin.com/in/sourabh-pradhan07/"

    class StyledPDF(FPDF):
        def header(self):
            if self.page_no() == 1:
                return
            self.set_font("Helvetica", "B", 9)
            self.set_text_color(*C_ACCENT)
            self.cell(0, 8, "BondFactor", new_x="LMARGIN", new_y="NEXT", link=SITE_URL)
            self.set_draw_color(*C_ACCENT)
            self.set_line_width(0.5)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(4)

        def footer(self):
            self.set_y(-15)
            self.set_draw_color(*C_BORDER)
            self.set_line_width(0.25)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(3)
            half = (self.w - self.l_margin - self.r_margin) / 2
            self.set_font("Helvetica", "", 6.5)
            self.set_text_color(*C_DIM)
            self.cell(half, 5, "Made by Sourabh", link=LINKEDIN_URL)
            self.cell(half, 5, f"Page {self.page_no()}/{{nb}}", align="R", new_x="LMARGIN", new_y="NEXT")
            self.cell(half, 5, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
            self.cell(half, 5, "bondfactor.vercel.app", align="R", link=SITE_URL, new_x="LMARGIN", new_y="NEXT")

    pdf = StyledPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(left=15, top=20, right=15)
    W = pdf.w - pdf.l_margin - pdf.r_margin  # content width

    # ── helpers ──────────────────────────────────────────────────────────
    def _color(val):
        return C_POS if val > 0 else C_NEG if val < 0 else C_TEXT

    def _section(title):
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(*C_ACCENT)
        pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*C_BORDER)
        pdf.set_line_width(0.5)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + 80, pdf.get_y())
        pdf.ln(4)

    def _table_header(headers, widths):
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(*C_ACCENT)
        pdf.set_fill_color(*C_SURFACE)
        for h, w in zip(headers, widths):
            pdf.cell(w, 7, h, fill=True)
        pdf.ln()

    def _table_row(values, widths, aligns, row_idx, fmts=None):
        pdf.set_font("Helvetica", "", 7.5)
        stripe = row_idx % 2 == 1
        if stripe:
            pdf.set_fill_color(*C_ELEVATED)
        for i, (v, w, a) in enumerate(zip(values, widths, aligns)):
            txt = fmts[i](v) if fmts else str(v)
            if i == len(values) - 1 and isinstance(v, (int, float)):
                pdf.set_text_color(*_color(v))
            else:
                pdf.set_text_color(*C_TEXT)
            pdf.cell(w, 6, txt, align=a, fill=stripe)
        pdf.ln()

    # ── title page ───────────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_fill_color(*C_BG)
    pdf.rect(0, 0, pdf.w, pdf.h, "F")
    pdf.ln(50)
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(*C_ACCENT)
    pdf.cell(0, 14, "BondFactor", align="C", new_x="LMARGIN", new_y="NEXT", link=SITE_URL)
    pdf.set_draw_color(*C_ACCENT)
    pdf.set_line_width(1)
    pdf.line(pdf.w / 2 - 30, pdf.get_y(), pdf.w / 2 + 30, pdf.get_y())
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*C_TEXT)
    pdf.cell(0, 10, "RISK REPORT", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(18)

    # info card
    cx = pdf.l_margin + (W - 120) / 2
    pdf.set_fill_color(*C_SURFACE)
    pdf.set_draw_color(*C_BORDER)
    pdf.set_line_width(0.5)
    pdf.rect(cx, pdf.get_y(), 120, 32, "DF")
    pdf.ln(5)
    gen_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    for label, val in [("Portfolio", portfolio_name), ("Curve Date", str(curve_date)),
                       ("Scenarios", str(len(scenario_results))), ("Generated", gen_time)]:
        pdf.set_x(cx + 5)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*C_DIM)
        pdf.cell(40, 7, label)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*C_TEXT)
        pdf.cell(70, 7, val, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(12)

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*C_DIM)
    pdf.cell(0, 5, "This report is generated by the BondFactor fixed-income risk engine.", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*C_ACCENT)
    pdf.cell(0, 5, "bondfactor.vercel.app", align="C", link=SITE_URL, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_text_color(*C_DIM)
    pdf.cell(0, 5, "Made by Sourabh", align="C", link=LINKEDIN_URL, new_x="LMARGIN", new_y="NEXT")

    # ── scenario pages ───────────────────────────────────────────────────
    for sc in scenario_results:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(*C_ACCENT)
        pdf.cell(0, 8, f"SCENARIO: {sc['name']}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        # scenario params bar
        s = sc["shocks"]
        pdf.set_fill_color(*C_SURFACE)
        pdf.set_draw_color(*C_BORDER)
        pdf.set_line_width(0.5)
        pdf.rect(pdf.l_margin, pdf.get_y(), W, 8, "DF")
        pdf.ln(1)
        params = [
            (f"Parallel: {s['parallel_shift']:+.2f}%", 30),
            (f"Slope: {s['slope_shock']:+.2f}%", 26),
            (f"Curv1: {s['curvature1_shock']:+.2f}%", 26),
            (f"Curv2: {s['curvature2_shock']:+.2f}%", 26),
            (f"Twist: {s['twist_shock']:+.2f}%", 26),
            (f"Pivot: {s['twist_pivot']:.1f}Y", 20),
        ]
        for txt, _ in params:
            pdf.set_font("Helvetica", "", 7)
            pdf.set_text_color(*C_DIM)
            pdf.cell(26, 6, txt)
        pdf.ln(10)

        # risk summary cards
        agg = sc["summary"]
        _section("PORTFOLIO RISK SUMMARY")
        metrics = [
            ("TOTAL BASE DIRTY", f"Rs. {agg['total_base_dirty']:,.2f}"),
            ("CLEAN VALUE", f"Rs. {agg['total_base_clean']:,.2f}"),
            ("SHOCKED VALUE", f"Rs. {agg['total_shocked_dirty']:,.2f}"),
            ("SCENARIO P&L", f"Rs. {agg['total_pnl']:+,.2f}"),
            ("MOD. DURATION", f"{agg['port_mod_dur']:.4f} Y"),
            ("TOTAL DV01", f"Rs. {agg['total_dv01']:,.2f}"),
            ("CONVEXITY", f"{agg['port_convexity']:.4f}"),
        ]
        card_w = (W - 3) / 4  # 4 cards per row, 1mm gaps
        card_h = 18
        y0 = pdf.get_y()
        for i, (label, val) in enumerate(metrics):
            col = i % 4
            row = i // 4
            cx = pdf.l_margin + col * (card_w + 1)
            cy = y0 + row * (card_h + 1)
            # card bg
            pdf.set_fill_color(*C_SURFACE)
            pdf.set_draw_color(*C_BORDER)
            pdf.set_line_width(0.3)
            pdf.rect(cx, cy, card_w, card_h, "DF")
            # accent stripe on first card
            if i == 0:
                pdf.set_fill_color(*C_ACCENT)
                pdf.rect(cx, cy, 2, card_h, "F")
            # label
            pdf.set_xy(cx + 3, cy + 2)
            pdf.set_font("Helvetica", "", 6.5)
            pdf.set_text_color(*C_DIM)
            pdf.cell(card_w - 4, 4, label)
            # value
            pdf.set_xy(cx + 3, cy + 8)
            pdf.set_font("Helvetica", "B", 10)
            if "P&L" in label:
                pdf.set_text_color(*_color(agg["total_pnl"]))
            else:
                pdf.set_text_color(*C_TEXT)
            pdf.cell(card_w - 4, 6, val)
        pdf.set_y(y0 + 2 * (card_h + 1) + 5)

        # zero curve table
        _section("ZERO CURVE (BASE)")
        zc_headers = ["Tenor", "Zero Rate (%)", "Discount Factor"]
        zc_widths = [30, 30, 30]
        _table_header(zc_headers, zc_widths)
        for i, pt in enumerate(base_zc_data):
            _table_row(
                [pt["tenor"], pt["rate"], pt["df"]], zc_widths,
                ["L", "R", "R"], i,
                [lambda v: f"{v:.1f}Y", lambda v: f"{v:.4f}", lambda v: f"{v:.6f}"],
            )
        pdf.ln(4)

        # positions table
        _section("PORTFOLIO POSITIONS")
        pos_headers = ["ISIN", "Face Value", "Clean", "Dirty", "YTM%", "ModDur", "DV01", "P&L"]
        pos_widths = [30, 22, 20, 20, 15, 15, 20, 22]
        pos_aligns = ["L", "R", "R", "R", "R", "R", "R", "R"]
        _table_header(pos_headers, pos_widths)
        for i, p in enumerate(sc["positions"]):
            _table_row(
                [p["isin"], p["face_value"], p["base_clean"], p["base_dirty"],
                 p["ytm"], p["mod_dur"], p["dv01"], p["pnl"]],
                pos_widths, pos_aligns, i,
                [lambda v: str(v)[:15], lambda v: f"{v:,.0f}", lambda v: f"{v:.4f}",
                 lambda v: f"{v:.4f}", lambda v: f"{v:.3f}", lambda v: f"{v:.3f}",
                 lambda v: f"{v:,.0f}", lambda v: f"{v:+,.2f}"],
            )
        pdf.ln(4)

        # KRD table
        _section("KEY RATE DURATIONS")
        tenor_labels = [f"{t}Y" if t >= 1 else f"{int(t * 12)}M" for t in DEFAULT_KEY_TENORS]
        krd_w = W / len(tenor_labels)
        _table_header(tenor_labels, [krd_w] * len(tenor_labels))
        _table_row(
            agg["port_krd"], [krd_w] * len(tenor_labels),
            ["R"] * len(tenor_labels), 0,
            [lambda v: f"{v:.3f}"] * len(tenor_labels),
        )

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
