import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ingestion import fbil_client, dbie_client, manual_csv_loader, validators
from ingestion.fbil_client import RawObservationBatch, FetchFailure
from db.models import RawParYieldObservation

logger = logging.getLogger("nightly_ingestion")

def persist_raw_observations(db: Session, batch: RawObservationBatch, status: str):
    """Persists successful yield observations to raw_par_yield_observations."""
    for point in batch.observations:
        obs = RawParYieldObservation(
            observation_date=datetime.strptime(batch.date, "%Y-%m-%d").date(),
            source=batch.source,
            tenor_label=point["tenor_label"],
            tenor_years=point["tenor_years"],
            par_yield=point["par_yield"],
            fetch_status=status,
            fetched_at=datetime.now(timezone.utc),
            raw_payload=batch.raw_payload if isinstance(batch.raw_payload, (dict, list)) else {"payload": str(batch.raw_payload)}
        )
        db.add(obs)
    db.commit()

def persist_failed_attempt(db: Session, failure: FetchFailure):
    """Persists failed fetch attempts to raw_par_yield_observations for auditability."""
    obs = RawParYieldObservation(
        observation_date=datetime.strptime(failure.date, "%Y-%m-%d").date(),
        source=failure.source,
        tenor_label=None,
        tenor_years=None,
        par_yield=None,
        fetch_status="failed",
        fetched_at=datetime.now(timezone.utc),
        raw_payload={"reason": failure.reason, "raw_payload": str(failure.raw_payload)}
    )
    db.add(obs)
    db.commit()

def run_ingestion(date: str, db: Session) -> RawObservationBatch:
    """
    Orchestrates the ingestion pipeline:
      fbil -> dbie -> manual_csv -> raise operational alert
    Validates observations before database persistence.
    """
    logger.info(f"Starting ingestion process for date: {date}")
    
    # 1. Attempt FBIL
    result = fbil_client.fetch(date)
    
    # 2. Fall back to DBIE if FBIL fails
    if result.failed:
        logger.warning(f"FBIL fetch failed for date {date}: {result.reason}. Attempting DBIE fallback...")
        persist_failed_attempt(db, result)
        result = dbie_client.fetch(date)
        
    # 3. Fall back to manual CSV if DBIE also fails
    if result.failed:
        logger.warning(f"DBIE fetch failed for date {date}: {result.reason}. Attempting manual CSV fallback...")
        persist_failed_attempt(db, result)
        result = manual_csv_loader.fetch(date)
        
    # 4. If all sources fail, flag manual import failure, raise alert, and raise exception
    if result.failed:
        persist_failed_attempt(db, result)
        logger.error(f"OPERATIONAL ALERT: All ingestion sources failed for date {date}. Final reason: {result.reason}")
        raise RuntimeError(f"All ingestion sources failed for date {date}: {result.reason}")
        
    # 5. Validate the successful batch
    try:
        validators.validate(result)
    except Exception as e:
        logger.error(f"OPERATIONAL ALERT: Validation failed for date {date} from source {result.source}: {str(e)}")
        # Persist validation failure as a failed record for auditability
        failure = FetchFailure(
            date=date,
            source=result.source,
            reason=f"Validation failed: {str(e)}",
            raw_payload=result.raw_payload
        )
        persist_failed_attempt(db, failure)
        raise ValueError(f"Validation failed for ingested data: {str(e)}")
        
    # 6. Persist validated observations
    status = "manual_override" if result.source == "manual_csv" else "success"
    persist_raw_observations(db, result, status)
    logger.info(f"Successfully completed ingestion and persistence of {len(result.observations)} points from source '{result.source}' for date {date}")
    
    return result
