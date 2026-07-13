import os
import shutil
import pytest
from unittest.mock import patch, MagicMock
from datetime import date
from sqlalchemy.orm import Session

from db.session import engine, SessionLocal
from db.models import Base, RawParYieldObservation
from ingestion.fbil_client import RawObservationBatch, FetchFailure
from ingestion import nse_zcyc_client, manual_csv_loader, validators
from jobs.nightly_ingestion_job import run_ingestion, persist_failed_attempt, persist_raw_observations

# Create tables in the in-memory SQLite database before tests run
@pytest.fixture(scope="module", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Clean up database tables between test cases
        db.query(RawParYieldObservation).delete()
        db.commit()

# Sample data for mocking
MOCK_OBSERVATIONS = [
    {"tenor_label": "91D", "tenor_years": 0.25, "par_yield": 6.85},
    {"tenor_label": "10Y", "tenor_years": 10.0, "par_yield": 7.28}
]

# Test 1: NSE ZCYC Success Path
@patch("ingestion.nse_zcyc_client.fetch")
def test_nse_zcyc_success(mock_fetch, db_session: Session):
    mock_fetch.return_value = RawObservationBatch(
        date="2026-07-10",
        source="nse_zcyc",
        observations=MOCK_OBSERVATIONS,
        raw_payload={"mocked": True}
    )
    
    batch = run_ingestion("2026-07-10", db_session)
        
    assert batch.source == "nse_zcyc"
    assert not batch.failed
    assert len(batch.observations) == 2
    
    # Verify DB contains the entries
    db_records = db_session.query(RawParYieldObservation).all()
    assert len(db_records) == 2
    assert db_records[0].source == "nse_zcyc"
    assert db_records[0].fetch_status == "success"
    assert db_records[0].tenor_label == "91D"
    assert float(db_records[0].par_yield) == 6.85

# Test 2: NSE ZCYC Fails, manual_csv succeeds (Fallback Path)
@patch("ingestion.nse_zcyc_client.fetch")
def test_nse_zcyc_fail_manual_csv_success(mock_fetch, db_session: Session):
    mock_fetch.return_value = FetchFailure(
        date="2026-07-10",
        source="nse_zcyc",
        reason="API Timeout"
    )
    
    # Create manual CSV file
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
    os.makedirs(data_dir, exist_ok=True)
    csv_path = os.path.join(data_dir, "manual_yields_2026-07-10.csv")
    
    csv_content = (
        "observation_date,tenor_label,tenor_years,par_yield\n"
        "2026-07-10,91D,0.25,6.85\n"
        "2026-07-10,10Y,10.0,7.28\n"
    )
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write(csv_content)
        
    try:
        batch = run_ingestion("2026-07-10", db_session)
        
        assert batch.source == "manual_csv"
        assert len(batch.observations) == 2
        
        # Verify DB contains:
        # 1. One failed audit record for nse_zcyc
        # 2. Two success records for manual_csv
        failed_record = db_session.query(RawParYieldObservation).filter_by(source="nse_zcyc").one()
        assert failed_record.fetch_status == "failed"
        
        success_records = db_session.query(RawParYieldObservation).filter_by(source="manual_csv", fetch_status="manual_override").all()
        assert len(success_records) == 2
        assert success_records[0].tenor_label == "91D"
        assert float(success_records[0].par_yield) == 6.85
        
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)

# Test 3: NSE ZCYC & manual_csv both fail (Complete failure)
@patch("ingestion.nse_zcyc_client.fetch")
def test_all_sources_fail(mock_fetch, db_session: Session):
    mock_fetch.return_value = FetchFailure(
        date="2026-07-10",
        source="nse_zcyc",
        reason="API Connection Failure"
    )
    
    # Mock manual CSV file to not exist
    csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "manual_yields_2026-07-10.csv"))
    if os.path.exists(csv_path):
        os.remove(csv_path)
        
    with pytest.raises(RuntimeError) as exc_info:
        run_ingestion("2026-07-10", db_session)
            
    assert "All ingestion sources failed" in str(exc_info.value)
    
    # Verify DB contains failed logs for nse_zcyc and manual_csv
    nse_fail = db_session.query(RawParYieldObservation).filter_by(source="nse_zcyc").one()
    manual_fail = db_session.query(RawParYieldObservation).filter_by(source="manual_csv").one()
    
    assert nse_fail.fetch_status == "failed"
    assert manual_fail.fetch_status == "failed"

# Test 5: Validators
def test_validators():
    # Test valid batch
    valid_batch = RawObservationBatch(
        date="2026-07-10",
        source="fbil",
        observations=[
            {"tenor_label": "91D", "tenor_years": 0.25, "par_yield": 6.85},
            {"tenor_label": "10Y", "tenor_years": 10.0, "par_yield": 7.28}
        ]
    )
    assert validators.validate(valid_batch) == valid_batch
    
    # Test empty batch
    empty_batch = RawObservationBatch(date="2026-07-10", source="fbil", observations=[])
    with pytest.raises(validators.ValidationError) as exc:
        validators.validate(empty_batch)
    assert "does not contain any yield points" in str(exc.value)
    
    # Test negative tenor
    bad_tenor_batch = RawObservationBatch(
        date="2026-07-10",
        source="fbil",
        observations=[{"tenor_label": "91D", "tenor_years": -0.25, "par_yield": 6.85}]
    )
    with pytest.raises(validators.ValidationError) as exc:
        validators.validate(bad_tenor_batch)
    assert "Tenor must be positive" in str(exc.value)
    
    # Test out-of-bounds yield
    bad_yield_batch = RawObservationBatch(
        date="2026-07-10",
        source="fbil",
        observations=[{"tenor_label": "91D", "tenor_years": 0.25, "par_yield": 95.0}]
    )
    with pytest.raises(validators.ValidationError) as exc:
        validators.validate(bad_yield_batch)
    assert "outside sane G-Sec parameters" in str(exc.value)
