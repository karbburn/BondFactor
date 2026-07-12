"""Tests for portfolio CRUD endpoints — Stage 13.

Covers:
- CRUD lifecycle (create, get, update, delete)
- Position add/delete
- Validation: security not found, inactive security, negative face_value
- Ownership: user B cannot access user A's portfolio
"""
import os
import pytest
from datetime import date
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from main import app
from api.dependencies import get_current_user
from db.session import engine, SessionLocal
from db.models import Base, Security, Portfolio, PortfolioPosition

client = TestClient(app)


def _mock_user(user_id: str = "user-a-001"):
    async def dep():
        return {"id": user_id, "email": f"{user_id}@test.com", "role": "authenticated"}
    return dep


AUTH_A = {"Authorization": "Bearer fake-token-a"}
AUTH_B = {"Authorization": "Bearer fake-token-b"}


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def mock_auth():
    app.dependency_overrides[get_current_user] = _mock_user("user-a-001")
    yield
    app.dependency_overrides.clear()


def _switch_user(user_id: str):
    app.dependency_overrides[get_current_user] = _mock_user(user_id)


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


# ---------- CRUD lifecycle ----------

def test_create_portfolio():
    res = client.post("/api/v1/portfolios", json={"portfolio_name": "My Book"}, headers=AUTH_A)
    assert res.status_code == 201
    data = res.json()
    assert data["portfolio_name"] == "My Book"
    assert "id" in data


def test_list_portfolios():
    client.post("/api/v1/portfolios", json={"portfolio_name": "A"}, headers=AUTH_A)
    client.post("/api/v1/portfolios", json={"portfolio_name": "B"}, headers=AUTH_A)
    res = client.get("/api/v1/portfolios", headers=AUTH_A)
    assert res.status_code == 200
    assert len(res.json()) == 2


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
    assert res.status_code in (200, 204)
    assert client.get(f"/api/v1/portfolios/{pid}", headers=AUTH_A).status_code == 404


def test_get_nonexistent_portfolio():
    res = client.get("/api/v1/portfolios/nonexistent-id", headers=AUTH_A)
    assert res.status_code == 404


# ---------- Position management ----------

def test_add_position():
    _insert_security()
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": "sec-IN0020200021", "face_value_held": 1000000},
                      headers=AUTH_A)
    assert res.status_code == 201
    assert res.json()["face_value_held"] == 1000000


def test_delete_position():
    _insert_security()
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    pos = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": "sec-IN0020200021", "face_value_held": 500000},
                      headers=AUTH_A).json()
    res = client.delete(f"/api/v1/portfolios/{pid}/positions/{pos['id']}", headers=AUTH_A)
    assert res.status_code in (200, 204)


def test_add_position_security_not_found():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": "nonexistent", "face_value_held": 1000},
                      headers=AUTH_A)
    assert res.status_code in (404, 422)


def test_add_position_inactive_security():
    _insert_security(active=False)
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": "sec-IN0020200021", "face_value_held": 1000},
                      headers=AUTH_A)
    assert res.status_code in (404, 422)


def test_add_position_negative_face_value():
    _insert_security()
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "P"}, headers=AUTH_A).json()["id"]
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": "sec-IN0020200021", "face_value_held": -1000},
                      headers=AUTH_A)
    assert res.status_code == 422


# ---------- Ownership ----------

def test_user_b_cannot_see_user_a_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "A's secret"}, headers=AUTH_A).json()["id"]
    _switch_user("user-b-002")
    res = client.get(f"/api/v1/portfolios/{pid}", headers=AUTH_B)
    assert res.status_code == 404


def test_user_b_cannot_update_user_a_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "A's"}, headers=AUTH_A).json()["id"]
    _switch_user("user-b-002")
    res = client.put(f"/api/v1/portfolios/{pid}", json={"portfolio_name": "Hacked"}, headers=AUTH_B)
    assert res.status_code in (403, 404)


def test_user_b_cannot_delete_user_a_portfolio():
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "A's"}, headers=AUTH_A).json()["id"]
    _switch_user("user-b-002")
    res = client.delete(f"/api/v1/portfolios/{pid}", headers=AUTH_B)
    assert res.status_code in (403, 404)


def test_user_b_cannot_add_position_to_user_a_portfolio():
    _insert_security()
    pid = client.post("/api/v1/portfolios", json={"portfolio_name": "A's"}, headers=AUTH_A).json()["id"]
    _switch_user("user-b-002")
    res = client.post(f"/api/v1/portfolios/{pid}/positions",
                      json={"security_id": "sec-IN0020200021", "face_value_held": 1000},
                      headers=AUTH_B)
    assert res.status_code in (403, 404)


def test_user_b_list_only_own_portfolios():
    client.post("/api/v1/portfolios", json={"portfolio_name": "A1"}, headers=AUTH_A)
    _switch_user("user-b-002")
    client.post("/api/v1/portfolios", json={"portfolio_name": "B1"}, headers=AUTH_B)
    _switch_user("user-a-001")
    res_a = client.get("/api/v1/portfolios", headers=AUTH_A)
    _switch_user("user-b-002")
    res_b = client.get("/api/v1/portfolios", headers=AUTH_B)
    names_a = {p["portfolio_name"] for p in res_a.json()}
    names_b = {p["portfolio_name"] for p in res_b.json()}
    assert "A1" in names_a and "B1" not in names_a
    assert "B1" in names_b and "A1" not in names_b
