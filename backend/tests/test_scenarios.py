"""Tests for saved scenario CRUD endpoints — Stage 17.

Covers:
- CRUD lifecycle (create, get, delete)
- Ownership: user B cannot access user A's scenarios
- Defaults: fields default to 0.0 / 5.0
"""
import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from main import app
from api.dependencies import get_current_user
from db.session import engine, SessionLocal
from db.models import Base, SavedScenario

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


# ---------- CRUD ----------

class TestScenarioCRUD:
    def test_create_and_get(self):
        r = _create()
        assert r.status_code == 201
        sid = r.json()["id"]
        g = client.get(f"/api/v1/scenarios/saved/{sid}", headers=AUTH_A)
        assert g.status_code == 200
        assert g.json()["scenario_name"] == "Test Scenario"

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
        assert d.status_code in (200, 204)

    def test_get_nonexistent_returns_404(self):
        r = client.get("/api/v1/scenarios/saved/nonexistent-id", headers=AUTH_A)
        assert r.status_code == 404

    def test_delete_nonexistent_returns_404(self):
        r = client.delete("/api/v1/scenarios/saved/nonexistent-id", headers=AUTH_A)
        assert r.status_code == 404


# ---------- Ownership ----------

class TestScenarioOwnership:
    def test_user_b_cannot_see_user_a_scenario(self):
        r = _create("A's Scenario", auth=AUTH_A)
        sid = r.json()["id"]
        _switch_user("user-b-002")
        g = client.get(f"/api/v1/scenarios/saved/{sid}", headers=AUTH_B)
        assert g.status_code in (403, 404)

    def test_user_b_cannot_delete_user_a_scenario(self):
        r = _create("A's Scenario", auth=AUTH_A)
        sid = r.json()["id"]
        _switch_user("user-b-002")
        d = client.delete(f"/api/v1/scenarios/saved/{sid}", headers=AUTH_B)
        assert d.status_code in (403, 404)


# ---------- Defaults ----------

class TestScenarioDefaults:
    def test_all_fields_default(self):
        r = client.post("/api/v1/scenarios/saved",
                        json={"scenario_name": "Defaults"}, headers=AUTH_A)
        assert r.status_code == 201
        data = r.json()
        assert data["parallel_shift"] == 0.0
        assert data["twist_pivot"] == 5.0


# ---------- Validation ----------

class TestScenarioValidation:
    def test_missing_name_returns_422(self):
        r = client.post("/api/v1/scenarios/saved", json={}, headers=AUTH_A)
        assert r.status_code == 422
