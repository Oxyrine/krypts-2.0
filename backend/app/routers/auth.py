"""
Authentication routes: signup, login (with rapid-session detection + brute-force lockout), logout, /me.
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
from app.schemas import (
    KeyBundleRequest,
    KeyBundleResponse,
    LoginRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()

_redis: aioredis.Redis | None = None

# Max failed login attempts before temporary lockout
_MAX_FAILED_ATTEMPTS = 10
_LOCKOUT_KEY_PREFIX = "login_lockout:"
_FAIL_COUNT_KEY_PREFIX = "login_fails:"


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        # Short connect/socket timeouts so brute-force tracking degrades
        # gracefully (per the except-and-pass callers below) instead of
        # letting every login hang for several seconds when Redis is
        # unreachable. Mirrors middleware/rate_limiter.py's client config.
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
        )
    return _redis


async def _check_brute_force(email: str):
    """Raise 429 if this email has exceeded the failed login threshold."""
    try:
        r = _get_redis()
        lockout_key = f"{_LOCKOUT_KEY_PREFIX}{email}"
        if await r.exists(lockout_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Try again in 15 minutes.",
            )
    except HTTPException:
        raise
    except Exception:
        pass  # Redis unavailable — degrade gracefully


async def _record_failed_attempt(email: str):
    """Increment failed attempt counter; lock out after threshold."""
    try:
        r = _get_redis()
        fail_key = f"{_FAIL_COUNT_KEY_PREFIX}{email}"
        count = await r.incr(fail_key)
        await r.expire(fail_key, 900)  # 15-minute window
        if count >= _MAX_FAILED_ATTEMPTS:
            lockout_key = f"{_LOCKOUT_KEY_PREFIX}{email}"
            await r.setex(lockout_key, 900, "1")  # 15-minute lockout
    except Exception:
        pass  # Redis unavailable — degrade gracefully


async def _clear_failed_attempts(email: str):
    """Clear failed attempt counter on successful login."""
    try:
        r = _get_redis()
        await r.delete(f"{_FAIL_COUNT_KEY_PREFIX}{email}")
        await r.delete(f"{_LOCKOUT_KEY_PREFIX}{email}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# POST /auth/signup
# ---------------------------------------------------------------------------

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Check for existing email
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered.")

    # E2EE key bundle is optional but must be provided as a complete set
    has_partial_keys = any([body.public_key, body.encrypted_private_key, body.key_salt])
    has_all_keys = all([body.public_key, body.encrypted_private_key, body.key_salt])
    if has_partial_keys and not has_all_keys:
        raise HTTPException(
            status_code=400,
            detail="public_key, encrypted_private_key, and key_salt must all be provided together.",
        )

    user = User(
        user_id=uuid.uuid4(),
        email=body.email,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        security_token=secrets.token_hex(32),
        public_key=body.public_key,
        encrypted_private_key=body.encrypted_private_key,
        key_salt=body.key_salt,
    )
    db.add(user)
    await db.flush()  # get user_id assigned

    # Log signup event
    log = UserActivityLog(
        user_id=user.user_id,
        event_type=EventType.signup,
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
    # Brute-force protection
    await _check_brute_force(body.email)

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        await _record_failed_attempt(body.email)
        # Log failed attempt (only if user exists, to avoid leaking email validity)
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

    # Clear brute-force counters on successful login
    await _clear_failed_attempts(body.email)

    # --- Rapid session detection ---
    now_utc = datetime.now(timezone.utc)
    if user.last_login_time is not None:
        last_login = user.last_login_time
        if last_login.tzinfo is None:
            last_login = last_login.replace(tzinfo=timezone.utc)
        elapsed = (now_utc - last_login).total_seconds()

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

    # Rehash password with bcrypt if it was stored as legacy SHA-256
    if ":" in user.password_hash and len(user.password_hash) == 97:
        user.password_hash = hash_password(body.password)

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


# ---------------------------------------------------------------------------
# GET /auth/keys, POST /auth/keys — E2EE key bundle (lazy provisioning for
# accounts created before end-to-end encryption existed)
# ---------------------------------------------------------------------------

@router.get("/keys", response_model=KeyBundleResponse)
async def get_keys(current_user=Depends(get_current_user)):
    return KeyBundleResponse(
        public_key=current_user.public_key,
        encrypted_private_key=current_user.encrypted_private_key,
        key_salt=current_user.key_salt,
        has_keys=bool(current_user.public_key),
    )


@router.post("/keys", response_model=KeyBundleResponse)
async def set_keys(
    body: KeyBundleRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.public_key and not body.force:
        raise HTTPException(
            status_code=400,
            detail="Key bundle already exists for this account. Pass force=true to overwrite.",
        )

    current_user.public_key = body.public_key
    current_user.encrypted_private_key = body.encrypted_private_key
    current_user.key_salt = body.key_salt
    await db.commit()

    return KeyBundleResponse(
        public_key=body.public_key,
        encrypted_private_key=body.encrypted_private_key,
        key_salt=body.key_salt,
        has_keys=True,
    )
