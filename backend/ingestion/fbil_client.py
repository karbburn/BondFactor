import os
import requests
from typing import Union, List, Dict, Any

class RawObservationBatch:
    def __init__(self, date: str, source: str, observations: List[Dict[str, Any]], raw_payload: Any = None):
        self.date = date
        self.source = source
        self.observations = observations
        self.raw_payload = raw_payload
        self.failed = False

class FetchFailure:
    def __init__(self, date: str, source: str, reason: str, raw_payload: Any = None):
        self.date = date
        self.source = source
        self.reason = reason
        self.raw_payload = raw_payload
        self.failed = True

def fetch(date: str) -> Union[RawObservationBatch, FetchFailure]:
    """
    Fetches raw par yield observations from FBIL.
    Returns RawObservationBatch on success, FetchFailure on failure.
    """
    url = os.getenv("FBIL_ENDPOINT_URL")
    
    # Return FetchFailure by default since FBIL has active reCAPTCHA and SPA blocks.
    # Allow fetching if a mock endpoint is explicitly set in FBIL_ENDPOINT_URL (e.g. for testing).
    if not url or url.startswith("https://fbil.org.in"):
        return FetchFailure(
            date=date,
            source="fbil",
            reason="Blocked by reCAPTCHA/SPA cloud protection"
        )
        
    try:
        response = requests.get(f"{url}?date={date}", timeout=10)
        if response.status_code == 200:
            data = response.json()
            return RawObservationBatch(
                date=date,
                source="fbil",
                observations=data.get("observations", []),
                raw_payload=data
            )
        return FetchFailure(
            date=date,
            source="fbil",
            reason=f"HTTP error status: {response.status_code}",
            raw_payload=response.text
        )
    except Exception as e:
        return FetchFailure(
            date=date,
            source="fbil",
            reason=f"Network exception: {str(e)}"
        )
