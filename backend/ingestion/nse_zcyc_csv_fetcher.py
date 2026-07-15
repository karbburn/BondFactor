"""
Fetch NSE ZCYC data using curl_cffi (bypasses Akamai TLS fingerprinting).
Designed to run locally or from a non-datacenter IP.

Usage:
    python nse_zcyc_csv_fetcher.py              # fetches today's data
    python nse_zcyc_csv_fetcher.py 2026-07-14   # fetches specific date
"""
import os
import io
import json
import zipfile
import sys
from datetime import datetime, date

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def fetch_nse_zcyc(target_date: date) -> list[dict]:
    """Fetch NSE ZCYC Excel for target_date, return list of observation dicts."""
    from curl_cffi import requests as cffi_requests
    import xlrd

    date_formatted = target_date.strftime("%d-%m-%Y")

    session = cffi_requests.Session(impersonate="chrome")

    # Warm up
    warmup = session.get("https://www.nseindia.com/", timeout=15)
    if warmup.status_code != 200:
        raise RuntimeError(f"NSE warm-up failed: {warmup.status_code}")

    # Fetch the archive ZIP — try multiple archive name variants
    name_variants = [
        "WDM - ZCYC",
        "WDM-ZCYC",
        "ZCYC",
    ]

    last_error = None
    for name in name_variants:
        archives = [{"name": name, "type": "archives", "category": "debt", "section": "debt-segment", "link": ""}]
        params = {"archives": json.dumps(archives), "date": date_formatted, "type": "Archives", "mode": "single"}

        resp = session.get(
            "https://www.nseindia.com/api/reports",
            params=params,
            headers={
                "Referer": "https://www.nseindia.com/all-reports-debt",
                "Accept": "application/json, text/plain, */*",
            },
            timeout=20,
        )

        if resp.status_code != 200:
            last_error = f"HTTP {resp.status_code}"
            continue

        ct = resp.headers.get("content-type", "")
        if "json" in ct:
            # JSON error response — file not found
            try:
                err = resp.json()
                last_error = err.get("error", str(err))
            except Exception:
                last_error = resp.text[:100]
            continue

        # Got binary content — assume it's the ZIP
        zip_data = io.BytesIO(resp.content)
        if not zipfile.is_zipfile(zip_data):
            last_error = "Response is not a valid ZIP file"
            continue

        with zipfile.ZipFile(zip_data) as z:
            xls_file = next((f for f in z.namelist() if f.endswith(".xls")), None)
            if not xls_file:
                last_error = f"No .xls in ZIP: {z.namelist()}"
                continue
            xls_content = z.read(xls_file)

        # Parse the Excel
        return _parse_xls(xls_content, target_date, xls_file, date_formatted)

    raise RuntimeError(f"All NSE archive name variants failed. Last error: {last_error}")


def _parse_xls(xls_content: bytes, target_date: date, xls_file: str, date_formatted: str) -> list[dict]:
    """Parse NSE ZCYC Excel and extract observations."""
    import xlrd

    book = xlrd.open_workbook(file_contents=xls_content)
    if "calc" not in book.sheet_names():
        raise RuntimeError("Sheet 'calc' not found in Excel workbook")

    sheet = book.sheet_by_name("calc")
    if sheet.nrows < 2 or sheet.ncols < 2:
        raise RuntimeError("Sheet 'calc' has insufficient rows/columns")

    # Find column for target_date
    col_idx = None
    for c in range(1, sheet.ncols):
        try:
            y, m, d, _, _, _ = xlrd.xldate_as_tuple(sheet.cell_value(0, c), book.datemode)
            if date(y, m, d) == target_date:
                col_idx = c
                break
        except Exception:
            continue
    if col_idx is None:
        raise RuntimeError(f"Date {target_date} not found in Excel column headers")

    target_tenors = {
        "91D": 0.25, "182D": 0.50, "364D": 1.00, "2Y": 2.00, "3Y": 3.00,
        "5Y": 5.00, "7Y": 7.00, "10Y": 10.00, "15Y": 15.00, "20Y": 20.00,
        "30Y": 30.00, "40Y": 40.00,
    }

    max_tenor, max_row = 0.0, None
    for r in range(1, sheet.nrows):
        try:
            tv = float(sheet.cell_value(r, 0))
            if tv > max_tenor:
                max_tenor, max_row = tv, r
        except (ValueError, TypeError):
            continue

    observations = []
    for label, target in target_tenors.items():
        if target > max_tenor and max_row is not None:
            yld = float(sheet.cell_value(max_row, col_idx))
        else:
            closest, best = None, float("inf")
            for r in range(1, sheet.nrows):
                try:
                    tv = float(sheet.cell_value(r, 0))
                    diff = abs(tv - target)
                    if diff < best:
                        best, closest = diff, r
                except (ValueError, TypeError):
                    continue
            if closest is None:
                continue
            yld = float(sheet.cell_value(closest, col_idx))
        observations.append({"tenor_label": label, "tenor_years": target, "yield_value": yld})

    return observations


def save_csv(target_date: date, observations: list[dict]) -> str:
    """Save observations to CSV, return file path."""
    os.makedirs(DATA_DIR, exist_ok=True)
    filepath = os.path.join(DATA_DIR, f"manual_yields_{target_date.isoformat()}.csv")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("observation_date,tenor_label,tenor_years,yield_value\n")
        for obs in observations:
            f.write(f"{target_date.isoformat()},{obs['tenor_label']},{obs['tenor_years']},{obs['yield_value']}\n")

    return filepath


if __name__ == "__main__":
    target = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()

    print(f"Fetching NSE ZCYC for {target}...")
    try:
        obs = fetch_nse_zcyc(target)
        path = save_csv(target, obs)
        print(f"Saved {len(obs)} observations to {path}")
    except Exception as e:
        print(f"Failed: {e}", file=sys.stderr)
        sys.exit(1)
