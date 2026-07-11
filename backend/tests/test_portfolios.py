"""Tests for portfolio CRUD endpoints — Stage 13.

Covers:
- CRUD lifecycle (create, get, update, delete)
- Position add/delete
- Validation: security not found, inactive security, negative face_value
- Ownership: user B cannot access user A's portfolio
"""
import os
import time
import pytest
import jwt
from datetime import date, datetime, timezone
from fastapi.testclient import TestClient

# Match the secret used by test_auth.py so tests pass when run together.
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-for-unit-tests-only")

from main import app
from db.session import engine, SessionLocal
from db.models import Base, Security, Portfolio, PortfolioPosition

client = TestClient(app)
TEST_SECRET = os.environ["SUPABASE_JWT_SECRET"]


def _make_token(user_id: str = "user-a-001") -> str:
    return jwt.encode({
        "sub": user_id, "email": f"{user_id}@test.com", "role": "authenticated",
        "aud": "authenticated", "iss": "https://test.supabase.co/auth/v1",
        "iat": int(time.time()),
    }, TEST_SECRET, algorithm="HS256")


TOKEN_A = _make_token("user-a-001")
TOKEN_B = _make_token("user-b-002")
AUTH_A = {"Authorization": f"Bearer {TOKEN_A}"}
AUTH_B = {"Authorization": f"Bearer {TOKEN_B}"}


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    db = SessionLocal()
    db.query(PortfolioPosition).delete()
    db.query(Portfolio).delete()
    db.query(Security).delete()
    db.commit()
    db.close()


def _insert_security(isin="IN0020200021", name="6.00% GS 2030", active=True):
    db = SessionLocal()
    s = Security(
        id=f"sec-{isin}", isin=isin, security_name=name,
        issue_date=date(2020, 1, 1), maturity_date=date(2030, 6, 15),
        coupon_rate=6.0, coupon_frequency=2, face_value=100.0, is_active=active,
    )
    db.add(s)
    db.commit()
    db.close()
    return s


# ── Portfolio CRUD ──────────────────────────────────────────────

def test_create_portfolio():
    res = client.post("/api/v1/portfolios", json={"portfolio_name": "My Book"}, headers=AUTH_A)
    assert res.status_code == 201
    data = res.json()
    assert data["portfolio_name"] == "My Book"
    assert data["positions"] == []
    assert "id" in data


def test_list_portfolios():
    client.post("/api/v1/portfolios", json={"portfolio_name": "A"}, headers=AUTH_A)
    client.post("/api/v1/portfolios", json={"portfolio_name": "B"}, headers=AUTH_A)
    res = client.get("/api/v1/portfolios", headers=AUTH_A)
    assert res.status_code == 200
    assert len(res.json()) >= 2


def test_get_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "X"}, headers=AUTH_A).json()["id"]
    res = client.get(f"/api/v1/portfolios/{pid}", headers=AUTH_A)
    assert res.status_code == 200
    assert res.json()["portfolio_name"] == "X"


def test_update_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "Old"}, headers=AUTH_A).json()["id"]
    res = client.put(f"/api/v1/portfolios/{pid}", json={"portfolio_name": "New"}, headers=AUTH_A)
    assert res.status_code == 200
    assert res.json()["portfolio_name"] == "New"


def test_delete_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "Doomed"}, headers=AUTH_A).json()["id"]
    res = client.delete(f"/api/v1/portfolios/{pid}", headers=AUTH_A)
    assert res.status_code == 204
    res = client.get(f"/api/v1/portfolios/{pid}", headers=AUTH_A)
    assert res.status_code == 404


def test_get_nonexistent_portfolio():
    res = client.get("/api/v1/portfolios/nonexistent-id", headers=AUTH_A)
    assert res.status_code == 404


# ── Positions ───────────────────────────────────────────────────

def test_add_position():
    _insert_security()
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    sec = SessionLocal().query(Security).first()
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": sec.id, "face_value_held": 5000000}, headers=AUTH_A)
    assert res.status_code == 201
    data = res.json()
    assert data["face_value_held"] == 5000000.0
    assert data["isin"] == sec.isin


def test_delete_position():
    _insert_security()
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    sec = SessionLocal().query(Security).first()
    pos = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": sec.id, "face_value_held": 1000000}, headers=AUTH_A).json()
    res = client.delete(f"/api/v1/portfolios/{pid}/positions/{pos['id']}", headers=AUTH_A)
    assert res.status_code == 204


# ── Validation ──────────────────────────────────────────────────

def test_add_position_security_not_found():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": "no-such-id", "face_value_held": 1000000}, headers=AUTH_A)
    assert res.status_code == 422
    assert "not found" in res.json()["error"]["message"].lower()


def test_add_position_inactive_security():
    _insert_security(active=False)
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    sec = SessionLocal().query(Security).first()
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": sec.id, "face_value_held": 1000000}, headers=AUTH_A)
    assert res.status_code == 422
    assert "not active" in res.json()["error"]["message"].lower()


def test_add_position_negative_face_value():
    _insert_security()
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    sec = SessionLocal().query(Security).first()
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": sec.id, "face_value_held": -100}, headers=AUTH_A)
    assert res.status_code == 422
    assert "positive" in res.json()["error"]["message"].lower()


# ── Ownership / RLS ────────────────────────────────────────────

def test_user_b_cannot_see_user_a_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "A's secret"}, headers=AUTH_A).json()["id"]
    res = client.get(f"/api/v1/portfolios/{pid}", headers=AUTH_B)
    assert res.status_code == 404


def test_user_b_cannot_update_user_a_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "A's"}, headers=AUTH_A).json()["id"]
    res = client.put(f"/api/v1/portfolios/{pid}", json={"portfolio_name": "HACKED"}, headers=AUTH_B)
    assert res.status_code == 404


def test_user_b_cannot_delete_user_a_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "A's"}, headers=AUTH_A).json()["id"]
    res = client.delete(f"/api/v1/portfolios/{pid}", headers=AUTH_B)
    assert res.status_code == 404


def test_user_b_cannot_add_position_to_user_a_portfolio():
    _insert_security()
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "A's"}, headers=AUTH_A).json()["id"]
    sec = SessionLocal().query(Security).first()
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": sec.id, "face_value_held": 1000}, headers=AUTH_B)
    assert res.status_code == 404


def test_user_b_list_only_own_portfolios():
    client.post("/api/v1/portfolios", json={"portfolio_name": "A1"}, headers=AUTH_A)
    client.post("/api/v1/portfolios", json={"portfolio_name": "B1"}, headers=AUTH_B)
    res_a = client.get("/api/v1/portfolios", headers=AUTH_A)
    res_b = client.get("/api/v1/portfolios", headers=AUTH_B)
    names_a = {p["portfolio_name"] for p in res_a.json()}
    names_b = {p["portfolio_name"] for p in res_b.json()}
    assert "B1" not in names_a
    assert "A1" not in names_b


def test_unauthenticated_access_rejected():
    res = client.get("/api/v1/portfolios")
    assert res.status_code == 401
