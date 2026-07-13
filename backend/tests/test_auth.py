import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from main import app
from api.dependencies import get_current_user

client = TestClient(app)


def _mock_supabase_response(status_code: int = 200, json_data: dict | None = None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    return resp


# --- get_current_user dependency tests ---

def test_valid_token_returns_user():
    user_data = {"id": "user-uuid-123", "email": "test@example.com", "role": "authenticated"}
    with patch("api.dependencies.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get.return_value = _mock_supabase_response(200, user_data)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            get_current_user(authorization="Bearer some-token")
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


def test_expired_token_raises_401():
    with patch("api.dependencies.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get.return_value = _mock_supabase_response(401, {"msg": "Token has expired"})
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        import asyncio
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                get_current_user(authorization="Bearer expired-token")
            )
    assert exc_info.value.status_code == 401


def test_invalid_token_raises_401():
    with patch("api.dependencies.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get.return_value = _mock_supabase_response(401, {"msg": "Invalid token"})
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        import asyncio
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                get_current_user(authorization="Bearer garbage-token")
            )
    assert exc_info.value.status_code == 401


def test_missing_env_url_returns_500(monkeypatch):
    import asyncio
    from fastapi import HTTPException
    from api.dependencies import _token_cache
    _token_cache.clear()
    monkeypatch.setattr(os, "getenv", lambda key, default="": "" if key == "SUPABASE_URL" else default)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.get_event_loop().run_until_complete(
            get_current_user(authorization="Bearer some-token")
        )
    assert exc_info.value.status_code == 500


def test_supabase_unreachable_returns_502():
    import httpx
    with patch("api.dependencies.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.RequestError("connection refused")
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        import asyncio
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                get_current_user(authorization="Bearer some-token")
            )
    assert exc_info.value.status_code == 502
