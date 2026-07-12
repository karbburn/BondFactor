"""Seed reference data into Supabase. Idempotent — safe to run multiple times."""
import os
import sys
from datetime import date, datetime, timezone
from uuid import uuid4

sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ["DATABASE_URL"]

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

    print("Done.")


if __name__ == "__main__":
    seed()
