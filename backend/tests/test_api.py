import os
import json
import pytest
from datetime import date, datetime
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from main import app
from db.session import engine, SessionLocal
from db.models import Base, CurveCalibration, KeyRateTenorGrid, Security, RawParYieldObservation

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
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
        # Clean up tables between tests
        db.query(CurveCalibration).delete()
        db.query(KeyRateTenorGrid).delete()
        db.query(Security).delete()
        db.query(RawParYieldObservation).delete()
        db.commit()

# Test 1: GET /curves/latest
def test_get_latest_curve(db_session: Session):
    # Empty DB case -> 404 with error envelope
    res = client.get("/api/v1/curves/latest")
    assert res.status_code == 404
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "No active curve calibrations" in data["error"]["message"]
    
    # Insert a calibration
    cal = CurveCalibration(
        curve_date=date(2026, 7, 10),
        model_type="nss",
        is_active=True,
        beta0=6.82, beta1=-1.14, beta2=0.63, beta3=-0.28,
        tau1=1.35, tau2=6.10,
        optimizer_converged=True,
        fit_residual_error=0.0021,
        parameter_stability_delta=0.014,
        validation_status="passed",
        created_at=datetime.utcnow()
    )
    db_session.add(cal)
    db_session.commit()
    
    res = client.get("/api/v1/curves/latest")
    assert res.status_code == 200
    data = res.json()
    assert data["curve_date"] == "2026-07-10"
    assert data["model_type"] == "nss"
    assert data["parameters"]["beta0"] == 6.82
    assert data["diagnostics"]["validation_status"] == "passed"

# Test 2: GET /curves/{date}
def test_get_curve_by_date(db_session: Session):
    # Non-existent date -> 404 with error envelope
    res = client.get("/api/v1/curves/2026-07-11")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
    
    # Insert calibration
    cal = CurveCalibration(
        curve_date=date(2026, 7, 11),
        model_type="cubic_spline",
        is_active=True,
        spline_knots={"knots": [0.5, 1.0, 5.0]},
        optimizer_converged=True,
        fit_residual_error=0.005,
        validation_status="failed_fallback_used",
        validation_notes="NSS optimizer did not satisfy stability constraints.",
        created_at=datetime.utcnow()
    )
    db_session.add(cal)
    db_session.commit()
    
    res = client.get("/api/v1/curves/2026-07-11")
    assert res.status_code == 200
    data = res.json()
    assert data["model_type"] == "cubic_spline"
    assert data["spline_knots"] == {"knots": [0.5, 1.0, 5.0]}
    assert data["diagnostics"]["validation_status"] == "failed_fallback_used"

# Test 3: GET /curves/history
def test_get_curve_history(db_session: Session):
    cal1 = CurveCalibration(
        curve_date=date(2026, 7, 10),
        model_type="nss",
        is_active=True,
        optimizer_converged=True,
        fit_residual_error=0.002,
        validation_status="passed",
        created_at=datetime.utcnow()
    )
    cal2 = CurveCalibration(
        curve_date=date(2026, 7, 11),
        model_type="cubic_spline",
        is_active=True,
        optimizer_converged=True,
        fit_residual_error=0.005,
        validation_status="failed_fallback_used",
        created_at=datetime.utcnow()
    )
    db_session.add_all([cal1, cal2])
    db_session.commit()
    
    # Query history
    res = client.get("/api/v1/curves/history?start=2026-07-10&end=2026-07-11")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert data[0]["curve_date"] == "2026-07-11"
    assert data[1]["curve_date"] == "2026-07-10"

# Test 4: GET /key-rate-tenors
def test_get_key_rate_tenors(db_session: Session):
    # Empty DB -> fallback to default tenors
    res = client.get("/api/v1/key-rate-tenors")
    assert res.status_code == 200
    data = res.json()
    assert data["effective_date"] == date.today().isoformat()
    assert len(data["tenors"]) == 12
    assert data["tenors"][0]["label"] == "91D"
    
    # Insert custom tenors
    db_session.add(KeyRateTenorGrid(effective_date=date(2026, 8, 1), tenor_label="10Y", tenor_years=10.0, source="fbil"))
    db_session.commit()
    
    res = client.get("/api/v1/key-rate-tenors")
    assert res.status_code == 200
    data = res.json()
    assert data["effective_date"] == "2026-08-01"
    assert len(data["tenors"]) == 1
    assert data["tenors"][0]["label"] == "10Y"

# Test 5: GET /securities
def test_get_securities(db_session: Session):
    s1 = Security(id="sec_1", isin="IN0020150012", security_name="7.59% GS 2026", issue_date=date(2015, 1, 1), maturity_date=date(2026, 1, 15), coupon_rate=7.59, coupon_frequency=2, face_value=100.0, is_active=True)
    s2 = Security(id="sec_2", isin="IN0020200021", security_name="6.00% GS 2030", issue_date=date(2020, 1, 1), maturity_date=date(2030, 6, 15), coupon_rate=6.00, coupon_frequency=2, face_value=100.0, is_active=True)
    db_session.add_all([s1, s2])
    db_session.commit()
    
    res = client.get("/api/v1/securities")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    
    # Filtering maturity_after
    res = client.get("/api/v1/securities?maturity_after=2028-01-01")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["isin"] == "IN0020200021"

# Test 6: GET /securities/{isin}
def test_get_security_by_isin(db_session: Session):
    res = client.get("/api/v1/securities/IN0000000000")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
    
    s = Security(id="sec_1", isin="IN0020150012", security_name="7.59% GS 2026", issue_date=date(2015, 1, 1), maturity_date=date(2026, 1, 15), coupon_rate=7.59, coupon_frequency=2, face_value=100.0, is_active=True)
    db_session.add(s)
    db_session.commit()
    
    res = client.get("/api/v1/securities/IN0020150012")
    assert res.status_code == 200
    data = res.json()
    assert data["security_name"] == "7.59% GS 2026"

# Test 7: Internal ingestion trigger and status auth checks
def test_internal_endpoints_auth(db_session: Session, monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "supersecretkey")
    
    # No auth header -> 401
    res = client.post("/api/v1/internal/ingestion/trigger")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"
    
    # Invalid auth token -> 403
    res = client.post("/api/v1/internal/ingestion/trigger", headers={"Authorization": "Bearer badkey"})
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"
    
    # Get status - missing auth header
    res = client.get("/api/v1/internal/ingestion/status?date_val=2026-07-10")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"
    
    # Get status - valid auth
    res = client.get("/api/v1/internal/ingestion/status?date_val=2026-07-10", headers={"Authorization": "Bearer supersecretkey"})
    assert res.status_code == 200
    data = res.json()
    assert data["date"] == "2026-07-10"
    assert data["ingestion_status"] == "missing"
