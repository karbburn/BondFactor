import os
import time
import httpx
from fastapi import Header, HTTPException
from typing import Dict

    # In-memory token cache, 60s TTL — saves a Supabase roundtrip per request
_token_cache: Dict[str, tuple] = {}
_CACHE_TTL = 60

async def get_current_user(authorization: str = Header(None)) -> Dict:
    """Validates a Supabase-issued Bearer token via Supabase's /auth/v1/user endpoint.

    Avoids manual JWT decode — lets Supabase verify its own tokens regardless of algorithm.
    Raises 401 on missing, invalid, or expired tokens.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Missing or invalid Authorization header."},
        )

    token = authorization.split(" ", 1)[1]

    # Check cache
    now = time.time()
    if token in _token_cache:
        user_data, expiry = _token_cache[token]
        if now < expiry:
            return user_data
        del _token_cache[token]

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url:
        raise HTTPException(
            status_code=500,
            detail={"code": "INTERNAL_SERVER_ERROR", "message": "SUPABASE_URL is not configured."},
        )

    if not service_key:
        raise HTTPException(
            status_code=500,
            detail={"code": "INTERNAL_SERVER_ERROR", "message": "SUPABASE_SERVICE_ROLE_KEY is not configured."},
        )

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers={"Authorization": f"Bearer {token}", "apikey": service_key},
                timeout=10.0,
            )
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail={"code": "BAD_GATEWAY", "message": "Unable to reach Supabase auth service."},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Invalid or expired token."},
        )

    data = resp.json()
    user_data = {
        "id": data.get("id"),
        "email": data.get("email"),
        "role": data.get("role"),
    }

    # Cache successful result
    _token_cache[token] = (user_data, now + _CACHE_TTL)

    return user_data
