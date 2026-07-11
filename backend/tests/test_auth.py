import os
import time
import pytest
import jwt
from fastapi.testclient import TestClient

# Set JWT secret before importing app
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-for-unit-tests-only")

from main import app
from api.dependencies import get_current_user

client = TestClient(app)

TEST_SECRET = os.environ["SUPABASE_JWT_SECRET"]


def _make_token(sub: str = "user-uuid-123", email: str = "test@example.com",
                exp: int | None = None, aud: str = "authenticated",
                secret: str = TEST_SECRET) -> str:
    payload = {
        "sub": sub,
        "email": email,
        "role": "authenticated",
        "aud": aud,
        "iss": "https://test.supabase.co/auth/v1",
        "iat": int(time.time()),
    }
    if exp is not None:
        payload["exp"] = exp
    return jwt.encode(payload, secret, algorithm="HS256")


# --- get_current_user dependency tests ---

def test_valid_token_returns_user():
    token = _make_token()
    # FastAPI TestClient doesn't directly invoke async deps, so test via raw call
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        get_current_user(authorization=f"Bearer {token}")
    )
    assert result["id"] == "user-uuid-123"
    assert result["email"] == "test@example.com"
    assert result["role"] == "authenticated"


def test_missing_header_raises_401():
    import asyncio
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            get_current_user(authorization=None)
        )
    assert exc_info.value.status_code == 401


def test_malformed_header_raises_401():
    import asyncio
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            get_current_user(authorization="Token abc123")
        )
    assert exc_info.value.status_code == 401


def test_invalid_token_raises_401():
    import asyncio
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            get_current_user(authorization="Bearer not-a-real-jwt")
        )
    assert exc_info.value.status_code == 401


def test_expired_token_raises_401():
    import asyncio
    from fastapi import HTTPException
    expired = _make_token(exp=int(time.time()) - 3600)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            get_current_user(authorization=f"Bearer {expired}")
        )
    assert exc_info.value.status_code == 401


def test_wrong_secret_raises_401():
    import asyncio
    from fastapi import HTTPException
    token = _make_token(secret="wrong-secret")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            get_current_user(authorization=f"Bearer {token}")
        )
    assert exc_info.value.status_code == 401


def test_wrong_audience_raises_401():
    import asyncio
    from fastapi import HTTPException
    token = _make_token(aud="anon")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            get_current_user(authorization=f"Bearer {token}")
        )
    assert exc_info.value.status_code == 401


def test_missing_env_var_returns_500(monkeypatch):
    import asyncio
    from fastapi import HTTPException
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    # Re-import to pick up the empty env
    import importlib
    import api.dependencies as dep_mod
    monkeypatch.setattr(dep_mod, "SUPABASE_JWT_SECRET", "")
    token = _make_token()
    with pytest.raises(HTTPException) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            dep_mod.get_current_user(authorization=f"Bearer {token}")
        )
    assert exc_info.value.status_code == 500
