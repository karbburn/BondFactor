"""Tests for saved scenario CRUD endpoints — Stage 17.

Covers:
- CRUD lifecycle (create, get, delete)
- Ownership: user B cannot access user A's scenarios
- Defaults: fields default to 0.0 / 5.0
"""
import os
import time
import pytest
import jwt
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-for-unit-tests-only")

from main import app
from db.session import engine, SessionLocal
from db.models import Base, SavedScenario

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
    db.query(SavedScenario).delete()
    db.commit()
    db.close()


# ---------- helpers ----------

def _create(name="Test Scenario", overrides=None, auth=AUTH_A):
    body = {
        "scenario_name": name,
        "parallel_shift": 0.25,
        "slope_shock": -0.10,
        "curvature1_shock": 0.05,
        "curvature2_shock": -0.05,
        "twist_shock": 0.15,
        "twist_pivot": 7.0,
    }
    if overrides:
        body.update(overrides)
    return client.post("/api/v1/scenarios/saved", json=body, headers=auth)


# ---------- tests ----------

class TestScenarioCRUD:

    def test_create_and_get(self):
        r = _create()
        assert r.status_code == 201
        sid = r.json()["id"]
        g = client.get(f"/api/v1/scenarios/saved/{sid}", headers=AUTH_A)
        assert g.status_code == 200
        assert g.json()["scenario_name"] == "Test Scenario"
        assert g.json()["parallel_shift"] == 0.25
        assert g.json()["twist_pivot"] == 7.0

    def test_list_returns_all_for_user(self):
        _create("S1")
        _create("S2")
        r = client.get("/api/v1/scenarios/saved", headers=AUTH_A)
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_delete(self):
        r = _create("ToDelete")
        sid = r.json()["id"]
        d = client.delete(f"/api/v1/scenarios/saved/{sid}", headers=AUTH_A)
        assert d.status_code == 204
        g = client.get(f"/api/v1/scenarios/saved/{sid}", headers=AUTH_A)
        assert g.status_code == 404

    def test_get_nonexistent_returns_404(self):
        r = client.get("/api/v1/scenarios/saved/nonexistent-id", headers=AUTH_A)
        assert r.status_code == 404

    def test_delete_nonexistent_returns_404(self):
        r = client.delete("/api/v1/scenarios/saved/nonexistent-id", headers=AUTH_A)
        assert r.status_code == 404


class TestScenarioOwnership:

    def test_user_b_cannot_see_user_a_scenario(self):
        r = _create("A's Scenario", auth=AUTH_A)
        sid = r.json()["id"]
        g = client.get(f"/api/v1/scenarios/saved/{sid}", headers=AUTH_B)
        assert g.status_code == 404

    def test_user_b_cannot_delete_user_a_scenario(self):
        r = _create("A's Scenario", auth=AUTH_A)
        sid = r.json()["id"]
        d = client.delete(f"/api/v1/scenarios/saved/{sid}", headers=AUTH_B)
        assert d.status_code == 404

    def test_user_list_isolation(self):
        _create("A1", auth=AUTH_A)
        _create("B1", auth=AUTH_B)
        ra = client.get("/api/v1/scenarios/saved", headers=AUTH_A)
        rb = client.get("/api/v1/scenarios/saved", headers=AUTH_B)
        assert len(ra.json()) == 1
        assert len(rb.json()) == 1


class TestScenarioDefaults:

    def test_all_fields_default(self):
        r = client.post("/api/v1/scenarios/saved", json={"scenario_name": "Defaults"}, headers=AUTH_A)
        assert r.status_code == 201
        j = r.json()
        assert j["parallel_shift"] == 0.0
        assert j["slope_shock"] == 0.0
        assert j["curvature1_shock"] == 0.0
        assert j["curvature2_shock"] == 0.0
        assert j["twist_shock"] == 0.0
        assert j["twist_pivot"] == 5.0


class TestScenarioValidation:

    def test_missing_name_returns_422(self):
        r = client.post("/api/v1/scenarios/saved", json={}, headers=AUTH_A)
        assert r.status_code == 422

    def test_unauthenticated_returns_401(self):
        r = client.get("/api/v1/scenarios/saved")
        assert r.status_code == 401
