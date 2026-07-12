"""Seed reference data into Supabase. Idempotent — safe to run multiple times."""
import os
import sys
from datetime import date, datetime, timezone
from uuid import uuid4
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import create_engine, text
from quant_core.nss import nss_yield

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    # Load from .env
    from pathlib import Path
    for line in Path(__file__).parent.joinpath(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            DATABASE_URL = line.split("=", 1)[1]
            break
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not set and not found in .env")

engine = create_engine(DATABASE_URL, connect_args={"options": "-c client_encoding=utf8"})

KEY_TENORS = [
    ("91 Days", 0.25, "FBIL"),
    ("6 Months", 0.5, "FBIL"),
    ("1 Year", 1.0, "FBIL"),
    ("2 Years", 2.0, "FBIL"),
    ("3 Years", 3.0, "FBIL"),
    ("5 Years", 5.0, "FBIL"),
    ("7 Years", 7.0, "FBIL"),
    ("10 Years", 10.0, "FBIL"),
    ("15 Years", 15.0, "FBIL"),
    ("20 Years", 20.0, "FBIL"),
    ("30 Years", 30.0, "FBIL"),
    ("40 Years", 40.0, "FBIL"),
]

SECURITIES = [
    ("IN0020250101", "6.90% GS 2028", "2026-01-15", "2028-01-15", 6.90, 2, 100.0, "2Y", True),
    ("IN0020250201", "7.10% GS 2031", "2026-01-15", "2031-01-15", 7.10, 2, 100.0, "5Y", True),
    ("IN0020250301", "7.18% GS 2033", "2026-01-15", "2033-01-15", 7.18, 2, 100.0, "7Y", True),
    ("IN0020250401", "7.26% GS 2036", "2026-01-15", "2036-01-15", 7.26, 2, 100.0, "10Y", True),
    ("IN0020250501", "7.40% GS 2056", "2026-01-15", "2056-01-15", 7.40, 2, 100.0, "30Y", True),
]

# Baseline NSS parameters from golden reference
NSS_PARAMS = {"beta0": 7.2, "beta1": -1.5, "beta2": 2.0, "beta3": -0.8, "tau1": 1.5, "tau2": 6.0}


def seed():
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        # Key rate tenor grid
        existing = conn.execute(text("SELECT COUNT(*) FROM key_rate_tenor_grid")).scalar()
        if existing == 0:
            for label, years, source in KEY_TENORS:
                conn.execute(
                    text("INSERT INTO key_rate_tenor_grid (id, effective_date, tenor_label, tenor_years, source) VALUES (:id, :date, :label, :years, :source)"),
                    {"id": str(uuid4()), "date": date(2026, 7, 10), "label": label, "years": years, "source": source},
                )
            print(f"Seeded {len(KEY_TENORS)} key rate tenors.")
        else:
            print(f"key_rate_tenor_grid already has {existing} rows, skipping.")

        # Securities
        existing = conn.execute(text("SELECT COUNT(*) FROM securities")).scalar()
        if existing == 0:
            for isin, name, issue, mat, coupon, freq, face, bench, active in SECURITIES:
                conn.execute(
                    text("INSERT INTO securities (id, isin, security_name, issue_date, maturity_date, coupon_rate, coupon_frequency, face_value, benchmark_tenor_classification, is_active) VALUES (:id, :isin, :name, :issue, :mat, :coupon, :freq, :face, :bench, :active)"),
                    {"id": str(uuid4()), "isin": isin, "name": name, "issue": date.fromisoformat(issue), "mat": date.fromisoformat(mat), "coupon": coupon, "freq": freq, "face": face, "bench": bench, "active": active},
                )
            print(f"Seeded {len(SECURITIES)} securities.")
        else:
            print(f"securities already has {existing} rows, skipping.")

        # Curve calibration + zero curve
        existing_cal = conn.execute(text("SELECT COUNT(*) FROM curve_calibrations")).scalar()
        if existing_cal == 0:
            cal_id = str(uuid4())
            curve_date = date(2026, 7, 10)

            conn.execute(
                text("""INSERT INTO curve_calibrations
                    (id, curve_date, model_type, is_active, beta0, beta1, beta2, beta3, tau1, tau2,
                     optimizer_converged, fit_residual_error, validation_status, created_at)
                    VALUES (:id, :date, 'nss', true, :b0, :b1, :b2, :b3, :t1, :t2,
                     true, 0.0001, 'passed', :now)"""),
                {"id": cal_id, "date": curve_date, "b0": NSS_PARAMS["beta0"], "b1": NSS_PARAMS["beta1"],
                 "b2": NSS_PARAMS["beta2"], "b3": NSS_PARAMS["beta3"], "t1": NSS_PARAMS["tau1"],
                 "t2": NSS_PARAMS["tau2"], "now": now},
            )
            print("Seeded curve calibration.")

            tenors = np.array([k[1] for k in KEY_TENORS])
            zero_rates = nss_yield(tenors, **NSS_PARAMS) / 100.0
            discount_factors = np.exp(-zero_rates * tenors)

            for t, zr, df in zip(tenors, zero_rates, discount_factors):
                conn.execute(
                    text("""INSERT INTO reference_zero_curves
                        (id, curve_date, calibration_id, tenor_years, discount_factor, zero_rate)
                        VALUES (:id, :date, :cal_id, :tenor, :df, :zr)"""),
                    {"id": str(uuid4()), "date": curve_date, "cal_id": cal_id,
                     "tenor": float(t), "df": float(df), "zr": float(zr)},
                )
            print(f"Seeded {len(tenors)} zero curve points.")
        else:
            print(f"curve_calibrations already has {existing_cal} rows, skipping.")

    print("Done.")


if __name__ == "__main__":
    seed()
