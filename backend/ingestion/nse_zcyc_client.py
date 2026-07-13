import os
import io
import json
import zipfile
import requests
import xlrd
from datetime import datetime, date
from typing import Union, List, Dict, Any
from ingestion.fbil_client import RawObservationBatch, FetchFailure

def fetch(date_str: str) -> Union[RawObservationBatch, FetchFailure]:
    """
    Fetches raw zero-coupon yield curve observations from NSE.
    The date_str parameter must be in YYYY-MM-DD format (e.g., "2010-01-20").
    Returns RawObservationBatch on success, FetchFailure on failure.
    """
    endpoint_url = os.getenv("NSE_ZCYC_ENDPOINT_URL")
    
    # If a mock endpoint is explicitly set in NSE_ZCYC_ENDPOINT_URL (e.g., for testing)
    # we bypass browser warm-up and directly fetch from that URL.
    is_mock = endpoint_url and not endpoint_url.startswith("https://www.nseindia.com")
    
    # Parse the requested date
    try:
        req_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception as e:
        return FetchFailure(
            date=date_str,
            source="nse_zcyc",
            reason=f"Invalid date format: {str(e)}"
        )
    
    # Convert date to DD-MM-YYYY format required by NSE API
    date_formatted = req_date.strftime("%d-%m-%Y")
    
    url = endpoint_url or "https://www.nseindia.com/api/reports"
    
    session = requests.Session()
    session_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive"
    }
    
    # Step 1: Warm up the session by visiting the home page if not using a mock endpoint
    if not is_mock:
        try:
            session.get("https://www.nseindia.com/", headers=session_headers, timeout=10)
        except Exception as e:
            return FetchFailure(
                date=date_str,
                source="nse_zcyc",
                reason=f"Failed to warm up session: {str(e)}"
            )
            
    # Step 2: Fetch the archive ZIP file
    archives = [{
        "name": "WDM - ZCYC",
        "type": "archives",
        "category": "debt",
        "section": "debt-segment",
        "link": ""
    }]
    
    params = {
        "archives": json.dumps(archives),
        "date": date_formatted,
        "type": "Archives",
        "mode": "single"
    }
    
    api_headers = {
        **session_headers,
        "Referer": "https://www.nseindia.com/all-reports-debt",
        "Accept": "application/json, text/plain, */*",
    }
    
    try:
        response = session.get(url, params=params, headers=api_headers, timeout=15)
        if response.status_code != 200:
            return FetchFailure(
                date=date_str,
                source="nse_zcyc",
                reason=f"HTTP error status: {response.status_code}",
                raw_payload=response.text
            )
            
        # Step 3: Extract ZIP and parse XLS
        zip_data = io.BytesIO(response.content)
        if not zipfile.is_zipfile(zip_data):
            return FetchFailure(
                date=date_str,
                source="nse_zcyc",
                reason="Response content is not a valid ZIP file",
                raw_payload=response.text[:1000]
            )
            
        with zipfile.ZipFile(zip_data) as z:
            file_names = z.namelist()
            if not file_names:
                return FetchFailure(
                    date=date_str,
                    source="nse_zcyc",
                    reason="ZIP file is empty"
                )
                
            # Locate first .xls file
            xls_file = next((f for f in file_names if f.endswith(".xls")), None)
            if not xls_file:
                return FetchFailure(
                    date=date_str,
                    source="nse_zcyc",
                    reason=f"No Excel .xls file found in ZIP. Found files: {file_names}"
                )
                
            xls_content = z.read(xls_file)
            
        # Parse sheet calc
        book = xlrd.open_workbook(file_contents=xls_content)
        if "calc" not in book.sheet_names():
            return FetchFailure(
                date=date_str,
                source="nse_zcyc",
                reason="Sheet 'calc' not found in Excel workbook"
            )
            
        sheet = book.sheet_by_name("calc")
        if sheet.nrows < 2 or sheet.ncols < 2:
            return FetchFailure(
                date=date_str,
                source="nse_zcyc",
                reason="Sheet 'calc' has insufficient rows/columns"
            )
            
        # Find column matching the requested date in Row 0
        col_idx = None
        for c_idx in range(1, sheet.ncols):
            cell_val = sheet.cell_value(0, c_idx)
            try:
                # Convert Excel date float to datetime.date
                y, m, d, _, _, _ = xlrd.xldate_as_tuple(cell_val, book.datemode)
                header_date = date(y, m, d)
                if header_date == req_date:
                    col_idx = c_idx
                    break
            except Exception:
                continue
                
        if col_idx is None:
            return FetchFailure(
                date=date_str,
                source="nse_zcyc",
                reason=f"Requested date {date_str} not found in Excel sheet column headers"
            )
            
        # Define standard G-Sec target tenors
        target_tenors = {
            "91D": 0.25,
            "182D": 0.50,
            "364D": 1.00,
            "2Y": 2.00,
            "3Y": 3.00,
            "5Y": 5.00,
            "7Y": 7.00,
            "10Y": 10.00,
            "15Y": 15.00,
            "20Y": 20.00,
            "30Y": 30.00,
            "40Y": 40.00
        }
        
        # Extrapolate flatly for tenors larger than max tenor in sheet (typically 20Y)
        # We first find the maximum tenor available in the sheet
        max_tenor_in_sheet = 0.0
        max_tenor_row = None
        for r_idx in range(1, sheet.nrows):
            try:
                tenor_val = float(sheet.cell_value(r_idx, 0))
                if tenor_val > max_tenor_in_sheet:
                    max_tenor_in_sheet = tenor_val
                    max_tenor_row = r_idx
            except (ValueError, TypeError):
                continue
                
        observations = []
        for label, target in target_tenors.items():
            if target > max_tenor_in_sheet and max_tenor_row is not None:
                # Flat extrapolation beyond max tenor
                yield_val = float(sheet.cell_value(max_tenor_row, col_idx))
                observations.append({
                    "tenor_label": label,
                    "tenor_years": target,
                    "par_yield": yield_val
                })
            else:
                # Find closest tenor
                closest_row = None
                min_diff = float("inf")
                for r_idx in range(1, sheet.nrows):
                    try:
                        tenor_val = float(sheet.cell_value(r_idx, 0))
                        diff = abs(tenor_val - target)
                        if diff < min_diff:
                            min_diff = diff
                            closest_row = r_idx
                    except (ValueError, TypeError):
                        continue
                        
                if closest_row is not None:
                    yield_val = float(sheet.cell_value(closest_row, col_idx))
                    observations.append({
                        "tenor_label": label,
                        "tenor_years": target,
                        "par_yield": yield_val
                    })
                    
        return RawObservationBatch(
            date=date_str,
            source="nse_zcyc",
            observations=observations,
            raw_payload={"filename": xls_file, "date_formatted": date_formatted}
        )
        
    except Exception as e:
        return FetchFailure(
            date=date_str,
            source="nse_zcyc",
            reason=f"Network or parsing exception: {str(e)}"
        )
