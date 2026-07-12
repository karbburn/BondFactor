import os
import csv
import io
from typing import Union
from ingestion.fbil_client import RawObservationBatch, FetchFailure

def fetch(date: str) -> Union[RawObservationBatch, FetchFailure]:
    """
    Loads raw par yield observations from a manual CSV file.
    Looks for file in backend/data/manual_yields_YYYY-MM-DD.csv.
    Returns RawObservationBatch on success, FetchFailure on failure.
    """
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
    os.makedirs(data_dir, exist_ok=True)
    
    filename = f"manual_yields_{date}.csv"
    filepath = os.path.join(data_dir, filename)
    
    if not os.path.exists(filepath):
        return FetchFailure(
            date=date,
            source="manual_csv",
            reason=f"Manual file not found at {filepath}"
        )
        
    try:
        observations = []
        with open(filepath, mode="r", encoding="utf-8") as f:
            content = f.read()

        reader = csv.DictReader(io.StringIO(content))
        headers = set(reader.fieldnames or [])
        required_headers = {"observation_date", "tenor_label", "tenor_years", "par_yield"}
        
        if not required_headers.issubset(headers):
            return FetchFailure(
                date=date,
                source="manual_csv",
                reason=f"CSV missing required headers. Found: {headers}, Expected at least: {required_headers}"
            )
            
        for row in reader:
            if row.get("observation_date") == date:
                try:
                    observations.append({
                        "tenor_label": row["tenor_label"],
                        "tenor_years": float(row["tenor_years"]),
                        "par_yield": float(row["par_yield"])
                    })
                except (ValueError, TypeError) as e:
                    return FetchFailure(
                        date=date,
                        source="manual_csv",
                        reason=f"Data formatting error in CSV row: {row}. Error: {str(e)}"
                    )
                    
        if not observations:
            return FetchFailure(
                date=date,
                source="manual_csv",
                reason=f"No matching observations found for date {date} in {filename}"
            )
            
        return RawObservationBatch(
            date=date,
            source="manual_csv",
            observations=observations,
            raw_payload=content
        )
    except Exception as e:
        return FetchFailure(
            date=date,
            source="manual_csv",
            reason=f"Exception reading CSV file: {str(e)}"
        )
