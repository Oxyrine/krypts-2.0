"""
API key management: create, list, revoke.
Raw keys are shown only once at creation time.
"""
import hashlib
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.api_key import ApiKey
from app.schemas import ApiKeyCreateRequest, ApiKeyResponse

router = APIRouter()


def _generate_raw_key(environment: str) -> str:
    prefix = "krypts_test_" if environment == "test" else "krypts_live_"
    return f"{prefix}{secrets.token_urlsafe(32)}"


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


# ---------------------------------------------------------------------------
# POST /apikey/create
# ---------------------------------------------------------------------------

@router.post("/create", response_model=ApiKeyResponse, status_code=201)
async def create_api_key(
    body: ApiKeyCreateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_key = _generate_raw_key(body.environment)
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:12]  # "krypts_live_" or "krypts_test_"

    api_key = ApiKey(
        key_id=uuid.uuid4(),
        user_id=current_user.user_id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        label=body.label,
        scopes=body.environment,
        is_active=True,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return ApiKeyResponse(
        id=str(api_key.key_id),
        key_prefix=api_key.key_prefix,
        label=api_key.label or "",
        environment=body.environment,
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        raw_key=raw_key,  # Only returned once
    )


# ---------------------------------------------------------------------------
# POST /apikey/revoke
# ---------------------------------------------------------------------------

@router.post("/revoke")
async def revoke_api_key(
    body: dict,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key_id = body.get("key_id")
    if not key_id:
        raise HTTPException(status_code=400, detail="key_id is required.")

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_id == uuid.UUID(key_id),
            ApiKey.user_id == current_user.user_id,
        )
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found.")

    api_key.is_active = False
    await db.commit()
    return {"message": "API key revoked.", "key_id": key_id}


# ---------------------------------------------------------------------------
# GET /apikey/list
# ---------------------------------------------------------------------------

@router.get("/list", response_model=list[ApiKeyResponse])
async def list_api_keys(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == current_user.user_id)
        .order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()

    return [
        ApiKeyResponse(
            id=str(k.key_id),
            key_prefix=k.key_prefix,
            label=k.label or "",
            environment=k.scopes or "live",
            is_active=k.is_active,
            created_at=k.created_at,
            last_used_at=k.last_used_at,
            raw_key=None,  # Never re-expose raw key
        )
        for k in keys
    ]
