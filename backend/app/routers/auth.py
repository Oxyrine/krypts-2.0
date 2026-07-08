"""
Authentication routes: signup, login (with rapid-session detection), logout, /me.
"""
import secrets
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.models.activity_log import EventType, UserActivityLog
from app.models.security_alert import AlertStatus, AlertType, SecurityAlert
from app.models.user import AccountStatus, User
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserResponse

router = APIRouter()

_redis: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


# ---------------------------------------------------------------------------
# POST /auth/signup
# ---------------------------------------------------------------------------

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Check for existing email
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(
        user_id=uuid.uuid4(),
        email=body.email,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        security_token=secrets.token_hex(32),
    )
    db.add(user)
    await db.flush()  # get user_id assigned

    # Log signup event
    log = UserActivityLog(
        user_id=user.user_id,
        event_type=EventType.login,
        ip_address=request.client.host if request.client else None,
        device_info=request.headers.get("user-agent"),
        session_id=secrets.token_hex(16),
    )
    db.add(log)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.user_id)})
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        # Log failed attempt
        if user:
            log = UserActivityLog(
                user_id=user.user_id,
                event_type=EventType.failure,
                ip_address=request.client.host if request.client else None,
                device_info=request.headers.get("user-agent"),
            )
            db.add(log)
            await db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if user.account_status == AccountStatus.banned:
        raise HTTPException(status_code=403, detail="Account permanently banned.")
    if user.account_status == AccountStatus.suspended:
        raise HTTPException(status_code=403, detail="Account temporarily suspended.")

    # --- Rapid session detection (DB Fallback for Local Testing) ---
    now_utc = datetime.now(timezone.utc)
    if user.last_login_time is not None:
        elapsed = (now_utc - user.last_login_time).total_seconds()
        
        if elapsed < settings.rapid_session_threshold_seconds:
            user.rapid_session_count += 1

            if user.rapid_session_count == 1:
                user.warning_count += 1
                alert = SecurityAlert(
                    user_id=user.user_id,
                    alert_type=AlertType.rapid_session,
                    description=(
                        f"Warning: rapid login detected for {user.email} "
                        f"(session gap: {elapsed:.0f}s)"
                    ),
                    ip_address=request.client.host if request.client else None,
                )
                db.add(alert)
            elif user.rapid_session_count == 2:
                user.account_status = AccountStatus.suspended
                user.suspension_count += 1
                alert = SecurityAlert(
                    user_id=user.user_id,
                    alert_type=AlertType.suspended,
                    description=f"Account suspended: repeated rapid sessions for {user.email}",
                    ip_address=request.client.host if request.client else None,
                )
                db.add(alert)
            elif user.rapid_session_count >= 3:
                user.account_status = AccountStatus.banned
                alert = SecurityAlert(
                    user_id=user.user_id,
                    alert_type=AlertType.banned,
                    description=f"Account banned: excessive rapid sessions for {user.email}",
                    ip_address=request.client.host if request.client else None,
                )
                db.add(alert)
        else:
            # If they waited long enough, reset the counter
            user.rapid_session_count = 0

    # Check again after possible status change
    if user.account_status == AccountStatus.banned:
        user.last_login_time = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=403, detail="Account has been banned due to suspicious activity.")
    if user.account_status == AccountStatus.suspended:
        user.last_login_time = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=403, detail="Account suspended due to suspicious activity.")

    # Update last login time
    user.last_login_time = datetime.now(timezone.utc)

    session_id = secrets.token_hex(16)
    log = UserActivityLog(
        user_id=user.user_id,
        event_type=EventType.login,
        ip_address=request.client.host if request.client else None,
        device_info=request.headers.get("user-agent"),
        session_id=session_id,
    )
    db.add(log)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.user_id)})
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------

@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(request: Request, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    log = UserActivityLog(
        user_id=current_user.user_id,
        event_type=EventType.logout,
        ip_address=request.client.host if request.client else None,
        device_info=request.headers.get("user-agent"),
    )
    db.add(log)
    await db.commit()
    return {"detail": "Logged out successfully."}


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

@router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)):
    return UserResponse.from_user(current_user)
