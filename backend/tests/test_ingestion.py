import os
import shutil
import pytest
from unittest.mock import patch, MagicMock
from datetime import date
from sqlalchemy.orm import Session

from db.session import engine, SessionLocal
from db.models import Base, RawParYieldObservation
from ingestion.fbil_client import RawObservationBatch, FetchFailure
from ingestion import fbil_client, dbie_client, manual_csv_loader, validators
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

class MockResponse:
    def __init__(self, json_data, status_code):
        self.json_data = json_data
        self.status_code = status_code
        self.text = "Mock Text Response"

    def json(self):
        return self.json_data

# Test 1: FBIL Success Path
@patch("requests.get")
def test_fbil_success(mock_get, db_session: Session):
    mock_get.return_value = MockResponse({"observations": MOCK_OBSERVATIONS}, 200)
    
    # We must set a mock endpoint URL so client actually makes the HTTP call instead of short-circuiting
    with patch.dict(os.environ, {"FBIL_ENDPOINT_URL": "http://mock-fbil-endpoint"}):
        batch = run_ingestion("2026-07-10", db_session)
        
    assert batch.source == "fbil"
    assert not batch.failed
    assert len(batch.observations) == 2
    
    # Verify DB contains the entries
    db_records = db_session.query(RawParYieldObservation).all()
    assert len(db_records) == 2
    assert db_records[0].source == "fbil"
    assert db_records[0].fetch_status == "success"
    assert db_records[0].tenor_label == "91D"
    assert float(db_records[0].par_yield) == 6.85

# Test 2: FBIL Fails, DBIE Succeeds (Fallback Path)
@patch("requests.get")
def test_fbil_fail_dbie_success(mock_get, db_session: Session):
    # Mock FBIL to throw exception, DBIE to succeed
    def side_effect(url, *args, **kwargs):
        if "mock-fbil" in url:
            raise Exception("Connection timed out")
        elif "mock-dbie" in url:
            return MockResponse({"observations": MOCK_OBSERVATIONS}, 200)
        return MockResponse({}, 404)
        
    mock_get.side_effect = side_effect
    
    with patch.dict(os.environ, {
        "FBIL_ENDPOINT_URL": "http://mock-fbil",
        "DBIE_ENDPOINT_URL": "http://mock-dbie"
    }):
        batch = run_ingestion("2026-07-10", db_session)
        
    assert batch.source == "dbie"
    assert len(batch.observations) == 2
    
    # Verify DB contains:
    # 1. One failed audit record for FBIL
    # 2. Two success records for DBIE
    failed_record = db_session.query(RawParYieldObservation).filter_by(source="fbil").one()
    assert failed_record.fetch_status == "failed"
    
    success_records = db_session.query(RawParYieldObservation).filter_by(source="dbie").all()
    assert len(success_records) == 2
    assert success_records[0].fetch_status == "success"

# Test 3: Both FBIL & DBIE Fail, falls back to Manual CSV which fails (Complete failure)
@patch("requests.get")
def test_all_sources_fail(mock_get, db_session: Session):
    mock_get.side_effect = Exception("General network error")
    
    with patch.dict(os.environ, {
        "FBIL_ENDPOINT_URL": "http://mock-fbil",
        "DBIE_ENDPOINT_URL": "http://mock-dbie"
    }):
        # Mock manual CSV file to not exist
        if os.path.exists("backend/data/manual_yields_2026-07-10.csv"):
            os.remove("backend/data/manual_yields_2026-07-10.csv")
            
        with pytest.raises(RuntimeError) as exc_info:
            run_ingestion("2026-07-10", db_session)
            
    assert "All ingestion sources failed" in str(exc_info.value)
    
    # Verify DB contains failed logs for fbil, dbie, and manual_csv
    fbil_fail = db_session.query(RawParYieldObservation).filter_by(source="fbil").one()
    dbie_fail = db_session.query(RawParYieldObservation).filter_by(source="dbie").one()
    manual_fail = db_session.query(RawParYieldObservation).filter_by(source="manual_csv").one()
    
    assert fbil_fail.fetch_status == "failed"
    assert dbie_fail.fetch_status == "failed"
    assert manual_fail.fetch_status == "failed"

# Test 4: Both Fail, Manual CSV Succeeds
@patch("requests.get")
def test_manual_csv_fallback_success(mock_get, db_session: Session):
    mock_get.side_effect = Exception("Network offline")
    
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
        with patch.dict(os.environ, {
            "FBIL_ENDPOINT_URL": "http://mock-fbil",
            "DBIE_ENDPOINT_URL": "http://mock-dbie"
        }):
            batch = run_ingestion("2026-07-10", db_session)
            
        assert batch.source == "manual_csv"
        assert len(batch.observations) == 2
        
        # Verify DB records
        success_records = db_session.query(RawParYieldObservation).filter_by(source="manual_csv", fetch_status="manual_override").all()
        assert len(success_records) == 2
        assert success_records[0].tenor_label == "91D"
        assert float(success_records[0].par_yield) == 6.85
        
    finally:
        # Cleanup
        if os.path.exists(csv_path):
            os.remove(csv_path)

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
