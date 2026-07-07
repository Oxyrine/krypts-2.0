"""
Token management: generate and validate content access tokens.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import create_content_access_token, decode_token, get_current_user
from app.models.protected_file import ProtectedFile
from app.schemas import (
    GenerateTokenRequest,
    GenerateTokenResponse,
    ValidateTokenRequest,
    ValidateTokenResponse,
)

router = APIRouter()

_EXPIRY_RE = re.compile(r"^(\d+)(m|h|d)$")


def _parse_expiry(expires_in: str) -> timedelta:
    m = _EXPIRY_RE.match(expires_in)
    if not m:
        raise HTTPException(status_code=400, detail="Invalid expires_in format. Use e.g. '30m', '2h', '7d'.")
    amount, unit = int(m.group(1)), m.group(2)
    if unit == "m":
        return timedelta(minutes=amount)
    elif unit == "h":
        return timedelta(hours=amount)
    else:
        return timedelta(days=amount)


# ---------------------------------------------------------------------------
# POST /generate-token
# ---------------------------------------------------------------------------

@router.post("/generate-token", response_model=GenerateTokenResponse)
async def generate_token(
    body: GenerateTokenRequest,
    request: Request,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify the file exists and belongs to current user
    result = await db.execute(
        select(ProtectedFile).where(ProtectedFile.file_id == uuid.UUID(body.file_id))
    )
    pf = result.scalar_one_or_none()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found.")

    # Only owner or admin can generate tokens
    if str(pf.owner_id) != str(current_user.user_id):
        from app.config import settings
        if current_user.email != settings.admin_email:
            raise HTTPException(status_code=403, detail="Not authorized for this file.")

    delta = _parse_expiry(body.expires_in)
    exp = datetime.now(timezone.utc) + delta
    token_id = str(uuid.uuid4())

    claims = {
        "file_id": str(body.file_id),
        "user_id": str(current_user.user_id),
        "permissions": body.permissions,
        "exp": exp,
        "jti": token_id,
    }
    if body.ip_restriction:
        claims["ip"] = body.ip_restriction

    token = create_content_access_token(claims)

    return GenerateTokenResponse(
        token=token,
        expires_at=exp,
        id=token_id,
        file_id=str(body.file_id),
    )


# ---------------------------------------------------------------------------
# POST /validate-token
# ---------------------------------------------------------------------------

@router.post("/validate-token", response_model=ValidateTokenResponse)
async def validate_token(body: ValidateTokenRequest, request: Request):
    try:
        payload = decode_token(body.token)
        if payload.get("type") != "content_access":
            return ValidateTokenResponse(valid=False, message="Not a content access token.")

        exp_raw = payload.get("exp")
        exp_dt = datetime.fromtimestamp(exp_raw, tz=timezone.utc) if exp_raw else None

        if body.file_id and payload.get("file_id") != body.file_id:
            return ValidateTokenResponse(valid=False, message="Token file_id mismatch.")

        ip_restriction = payload.get("ip")
        if ip_restriction:
            client_ip = request.client.host if request.client else ""
            if client_ip != ip_restriction:
                return ValidateTokenResponse(valid=False, message="IP address mismatch.")

        return ValidateTokenResponse(
            valid=True,
            file_id=payload.get("file_id"),
            user_id=payload.get("user_id"),
            expires_at=exp_dt,
            permissions=payload.get("permissions"),
        )
    except JWTError as e:
        return ValidateTokenResponse(valid=False, message=f"Invalid token: {e}")
