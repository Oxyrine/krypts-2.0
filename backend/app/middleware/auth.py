"""
Authentication utilities: password hashing (bcrypt), JWT creation/validation,
and FastAPI dependency for extracting the current authenticated user.
"""
import secrets
import uuid as _uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Password hashing — bcrypt via passlib (intentionally slow, salted)
# ---------------------------------------------------------------------------

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash of the given password."""
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against a bcrypt hash.
    Also handles legacy SHA-256 hashes ('salt:hexdigest') for migration.
    """
    # Legacy SHA-256 path — migrate on first successful verify
    if ":" in hashed and len(hashed) == 97:
        import hashlib
        try:
            salt, stored_digest = hashed.split(":", 1)
            digest = hashlib.sha256(f"{salt}{plain}".encode()).hexdigest()
            return secrets.compare_digest(digest, stored_digest)
        except Exception:
            return False
    # bcrypt path
    try:
        return _pwd_context.verify(plain, hashed)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload.update({"exp": expire, "type": "access"})
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_content_access_token(claims: dict) -> str:
    """Create a short-lived token specifically for content access.
    Signed with CONTENT_TOKEN_SECRET (separate from user access tokens).
    """
    payload = claims.copy()
    payload.update({"type": "content_access"})
    return jwt.encode(payload, settings.get_content_token_secret(), algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Decode and verify a user access JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def decode_content_token(token: str) -> dict:
    """Decode and verify a content access JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.get_content_token_secret(), algorithms=[settings.jwt_algorithm])


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """FastAPI dependency: extract and validate the Bearer token, return User."""
    from app.models.user import User, AccountStatus

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    try:
        payload = decode_token(credentials.credentials)
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type", "")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.user_id == _uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    if user.account_status == AccountStatus.banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been permanently banned.",
        )
    if user.account_status == AccountStatus.suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is temporarily suspended.",
        )

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Same as get_current_user but returns None instead of raising on missing token."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None
