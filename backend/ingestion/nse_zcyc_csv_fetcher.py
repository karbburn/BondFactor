"""
Fetch G-Sec yields from NSE WDM daily trade data.
Uses curl_cffi to bypass Akamai TLS fingerprinting.

Usage:
    python nse_zcyc_csv_fetcher.py              # fetches previous trading day
    python nse_zcyc_csv_fetcher.py 2026-07-14   # fetches specific date
"""
import os
import csv
import io
import re
import sys
import zipfile
from datetime import date, datetime
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# ponytail: tenor mapping is approximate — NSS calibration smooths it out
TENOR_MAP = {
    "91D": (0.25, "91D"), "182D": (0.50, "182D"), "364D": (1.00, "364D"),
}


def _map_bond_tenor(security: str, trade_year: int) -> tuple[float, str] | None:
    """Map GOI bond security name (e.g. CG2029) to (tenor_years, label)."""
    m = re.match(r"CG(\d{4})", security)
    if not m:
        return None
    mat_year = int(m.group(1))
    tenor = mat_year - trade_year
    if tenor <= 0:
        return None
    label = f"{tenor}Y"
    return (float(tenor), label)


def fetch_wdm_yields(target_date: date) -> list[dict]:
    """Fetch WDM daily trade data, filter GOI bonds + T-bills, return yield observations."""
    from curl_cffi import requests as cffi_requests

    session = cffi_requests.Session(impersonate="chrome")
    warmup = session.get("https://www.nseindia.com/", timeout=15)
    if warmup.status_code != 200:
        raise RuntimeError(f"NSE warm-up failed: {warmup.status_code}")

    headers = {"Referer": "https://www.nseindia.com/all-reports-debt"}

    resp = session.get("https://www.nseindia.com/api/daily-reports?key=WDM", headers=headers, timeout=10)
    if resp.status_code != 200:
        raise RuntimeError(f"WDM reports API returned {resp.status_code}")

    reports = resp.json()

    download_url = None
    target_ddmmyyyy = target_date.strftime("%d%m%Y")
    for day_key in ["CurrentDay", "PreviousDay"]:
        for report in reports.get(day_key, []):
            if report.get("displayName", "").startswith("Daily Report"):
                file_date = report.get("fileActlName", "").replace("dly", "").replace(".zip", "")
                if target_ddmmyyyy in file_date:
                    download_url = report["filePath"] + report["fileActlName"]
                    break
        if download_url:
            break

    if not download_url:
        raise RuntimeError("No WDM daily report found")

    # Download and extract
    zip_resp = session.get(download_url, headers=headers, timeout=20)
    if zip_resp.status_code != 200:
        raise RuntimeError(f"Download failed: {zip_resp.status_code}")

    with zipfile.ZipFile(io.BytesIO(zip_resp.content)) as z:
        csv_name = next((f for f in z.namelist() if f.endswith("_sett.csv")), None)
        if not csv_name:
            raise RuntimeError(f"No settlement CSV in ZIP: {z.namelist()}")
        csv_content = z.read(csv_name).decode("utf-8")

    # Parse CSV
    reader = csv.DictReader(io.StringIO(csv_content))
    security_data = defaultdict(lambda: {"value": 0.0, "weighted_sum": 0.0, "sectype": ""})

    for row in reader:
        sectype = row["Sectype"].strip()
        if sectype not in ("GS", "TB"):
            continue
        try:
            ytm = float(row["Weighted YTM"])
            value = float(row["Traded Value (Rs.Cr.)"])
        except (ValueError, KeyError):
            continue
        security = row["Security"].strip()
        security_data[security]["value"] += value
        security_data[security]["weighted_sum"] += value * ytm
        security_data[security]["sectype"] = sectype

    # Get trade date from first data row
    first_row = next(csv.DictReader(io.StringIO(csv_content)))
    trade_date = datetime.strptime(first_row["Trade date"].strip(), "%d-%b-%Y").date()
    trade_year = trade_date.year

    # Map to tenors
    observations = []
    for security, data in security_data.items():
        if data["value"] == 0:
            continue
        avg_ytm = data["weighted_sum"] / data["value"]

        if data["sectype"] == "TB":
            tenor_part = security.split(",")[0].strip()
            if tenor_part in TENOR_MAP:
                tenor_years, label = TENOR_MAP[tenor_part]
                observations.append({"tenor_label": label, "tenor_years": tenor_years, "yield_value": avg_ytm})
        elif data["sectype"] == "GS":
            result = _map_bond_tenor(security, trade_year)
            if result:
                tenor_years, label = result
                observations.append({"tenor_label": label, "tenor_years": tenor_years, "yield_value": avg_ytm})

    return observations, trade_date


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

    print(f"Fetching WDM yields for {target}...")
    try:
        observations, trade_date = fetch_wdm_yields(target)
        path = save_csv(trade_date, observations)
        print(f"Saved {len(observations)} observations to {path}")
    except Exception as e:
        print(f"Failed: {e}", file=sys.stderr)
        sys.exit(1)
