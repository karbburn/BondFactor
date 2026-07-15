import os
import hmac
from datetime import datetime, date
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional

from db.session import get_db
from db.models import RawParYieldObservation, CurveCalibration
from jobs.nightly_ingestion_job import run_ingestion

router = APIRouter()

class TriggerRequest(BaseModel):
    date: Optional[str] = Field(None, description="Target date in YYYY-MM-DD format. Defaults to current IST date.")

def get_current_ist_date() -> str:
    return datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")

@router.post("/ingestion/trigger", status_code=status.HTTP_200_OK)
def trigger_ingestion(
    request_data: Optional[TriggerRequest] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Triggers the G-Sec data ingestion job for a given date.
    Requires header: 'Authorization: Bearer <INTERNAL_SERVICE_KEY>'
    """
    service_key = os.getenv("INTERNAL_SERVICE_KEY")
    if not service_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTERNAL_SERVICE_KEY environment variable is not configured on the server."
        )

    # Check Authorization header
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Expected Bearer token."
        )

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Expected Bearer token."
        )
    token = parts[1]
    if not hmac.compare_digest(token, service_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid service key."
        )

    # Extract target date or default to current IST date
    target_date = request_data.date if request_data and request_data.date else get_current_ist_date()

    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format: '{target_date}'. Expected format: YYYY-MM-DD"
        )

    try:
        batch = run_ingestion(target_date, db)
        return {
            "status": "success",
            "message": f"Successfully ingested {len(batch.observations)} points from source '{batch.source}' for date {target_date}.",
            "source": batch.source,
            "observations_count": len(batch.observations)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {str(e)}"
        )

@router.get("/ingestion/status", status_code=status.HTTP_200_OK)
def get_ingestion_status(
    date_val: date,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Returns G-Sec data ingestion and curve calibration status for a given date.
    Requires header: 'Authorization: Bearer <INTERNAL_SERVICE_KEY>'
    """
    service_key = os.getenv("INTERNAL_SERVICE_KEY")
    if not service_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTERNAL_SERVICE_KEY environment variable is not configured on the server."
        )

    # Check Authorization header
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Expected Bearer token."
        )

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Expected Bearer token."
        )
    token = parts[1]
    if not hmac.compare_digest(token, service_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid service key."
        )

    obs = db.query(RawParYieldObservation).filter(RawParYieldObservation.observation_date == date_val).all()
    cal = db.query(CurveCalibration).filter(CurveCalibration.curve_date == date_val, CurveCalibration.is_active == True).first()

    if not obs:
        return {
            "date": str(date_val),
            "ingestion_status": "missing",
            "source_used": None,
            "observations_count": 0,
            "calibration_status": "missing",
            "model_type": None
        }

    success_obs = [o for o in obs if o.fetch_status in ["success", "manual_override"]]
    ingestion_status = "success" if success_obs else "failed"
    source_used = success_obs[0].source if success_obs else None

    return {
        "date": str(date_val),
        "ingestion_status": ingestion_status,
        "source_used": source_used,
        "observations_count": len(success_obs),
        "calibration_status": cal.validation_status if cal else "missing",
        "model_type": cal.model_type if cal else None
    }
