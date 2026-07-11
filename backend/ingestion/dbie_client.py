import os
import requests
from typing import Union
from ingestion.fbil_client import RawObservationBatch, FetchFailure

def fetch(date: str) -> Union[RawObservationBatch, FetchFailure]:
    """
    Fetches raw par yield observations from RBI DBIE.
    Returns RawObservationBatch on success, FetchFailure on failure.
    """
    url = os.getenv("DBIE_ENDPOINT_URL")
    
    # Return FetchFailure by default since DBIE requires session-based queries.
    # Allow fetching if a mock endpoint is explicitly set in DBIE_ENDPOINT_URL (e.g. for testing).
    if not url or url.startswith("https://dbie.rbi.org.in"):
        return FetchFailure(
            date=date,
            source="dbie",
            reason="Blocked by session/query portal restrictions"
        )
        
    try:
        response = requests.get(f"{url}?date={date}", timeout=10)
        if response.status_code == 200:
            data = response.json()
            return RawObservationBatch(
                date=date,
                source="dbie",
                observations=data.get("observations", []),
                raw_payload=data
            )
        return FetchFailure(
            date=date,
            source="dbie",
            reason=f"HTTP error status: {response.status_code}",
            raw_payload=response.text
        )
    except Exception as e:
        return FetchFailure(
            date=date,
            source="dbie",
            reason=f"Network exception: {str(e)}"
        )
