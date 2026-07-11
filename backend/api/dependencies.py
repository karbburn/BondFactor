import os
import jwt
from fastapi import Header, HTTPException
from typing import Dict

async def get_current_user(authorization: str = Header(None)) -> Dict:
    """Validates a Supabase-issued Bearer token and returns the user payload.

    Verifies locally using the JWT secret — no network call to Supabase.
    Raises 401 on missing, invalid, or expired tokens.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Missing or invalid Authorization header."},
        )

    token = authorization.split(" ", 1)[1]
    secret = os.getenv("SUPABASE_JWT_SECRET", "")

    if not secret:
        raise HTTPException(
            status_code=500,
            detail={"code": "INTERNAL_SERVER_ERROR", "message": "SUPABASE_JWT_SECRET is not configured."},
        )

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Token has expired."},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Invalid authentication token."},
        )

    return {
        "id": payload.get("sub"),
        "email": payload.get("email"),
        "role": payload.get("role"),
    }
