# Backend Reconciliation (drm-platform → drm-platform-desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `drm-platform-desktop/backend/app` up to parity with `drm-platform/backend/app` (the source that was actually compiled into the `backend-server.exe` the Electron app runs), porting the Groups/Invites/Inbox feature plus a backlog of security and frontend-contract fixes — without blindly overwriting anything that's intentionally desktop-specific — then rebuild and swap in the exe.

**Architecture:** `drm-platform` and `drm-platform-desktop` are sibling repos sharing the same FastAPI backend design. `drm-platform-desktop`'s own `backend/app/` source has drifted behind `drm-platform`'s: it's missing the Groups/Sharing/Inbox feature entirely (only an untracked, broken WIP `routers/inbox.py` exists) and is missing security hardening (bcrypt, brute-force lockout, content-token secret separation, CORS lockdown) and response-shape fixes that the frontend (`src/lib/api.ts`, already updated in a recent "security hardening" commit) now expects. This plan replaces the stale files in `drm-platform-desktop/backend/app` with the versions from `drm-platform/backend/app`, fixing two known bugs while porting (admin-seed hardcoded email, missing `settings` import in `files.py`), then rebuilds `backend-server.exe` via PyInstaller and verifies the Electron app end-to-end.

**Tech Stack:** FastAPI, SQLAlchemy async (SQLite dev), Pydantic v2, python-jose, passlib[bcrypt], PyInstaller, Electron.

## Global Constraints

- Source of truth for ported code is `C:\Documents\Hackathon\drm-platform\backend\app\*` — copy verbatim except where a known bug is called out below.
- Never modify anything under `C:\Documents\Hackathon\drm-platform` (read-only reference).
- Never modify `main.js` — it already correctly loads `JWT_SECRET_KEY`, `CONTENT_TOKEN_SECRET`, `MASTER_KEK`, `ADMIN_EMAIL` from `backend/.env` via `loadBackendSecrets()` (main.js:11-24) and injects `LOCAL_VAULT_PATH`/`DATABASE_URL` at spawn time (main.js:95-111). No electron-side change is needed for anything in this plan.
- `backend/.env` already sets `JWT_SECRET_KEY` and `MASTER_KEK` (required, no-default in the new `config.py`) and `ADMIN_EMAIL=admin@krypts.com` — do not change `.env` values.
- Fix, don't blindly port: `database.py`'s admin-seed check must use `settings.admin_email`, not a hardcoded `"admin@example.com"` string (drm-platform's version has this bug, papered over there by a difference in test setup — porting it verbatim would silently break admin access here since `.env` sets `admin@krypts.com`).
- Fix, don't blindly port: `routers/files.py` in drm-platform references `settings.max_upload_size_bytes` without importing `settings` — add `from app.config import settings` when porting, or `upload_file` will raise `NameError` on first call.
- No backend automated test suite exists in either repo — verification is via direct `uvicorn` runs + `curl`/manual smoke checks, not invented pytest files (don't add test infrastructure that wasn't asked for).
- `backend/requirements.txt` is already identical between the two repos — no dependency changes needed.
- Windows/PowerShell environment; `py` launcher is available (`py -m pip`, `py -m uvicorn`), plain `python`/`pip` are not on PATH.
- **Discovered during Task 1 execution:** this machine only has Python 3.14 available. Two environment issues follow from that, both handled below — do not treat either as a plan defect:
  1. `asyncpg==0.30.0` (pinned in `requirements.txt`) has no prebuilt wheel for Python 3.14. Local-venv-only workaround: install everything else, then `pip install asyncpg==0.31.0` (has a cp314 wheel) directly — do NOT edit the committed `requirements.txt` (asyncpg is never invoked at runtime here since `.env` points at SQLite).
  2. SQLAlchemy 2.0.36's declarative mapper crashes on Python 3.14 (`TypeError: descriptor '__getitem__' requires a 'typing.Union' object but received a 'tuple'`) when a model uses PEP 604 `Mapped[X | None]` syntax. `drm-platform`'s model files already avoid this (they use `Mapped[X]` with `nullable=True` instead) — this turns out to be a **required fix, not a cosmetic style difference** as originally assessed. Task 3 now also ports `models/api_key.py`, `models/protected_file.py`, and `models/security_alert.py` for exactly this reason (see Task 3 Step 3a below) — every model file must avoid `X | None` in `Mapped[...]` or app startup will crash on this Python version.
  3. **Discovered during Task 3 execution:** `requirements.txt` pins `passlib[bcrypt]==1.7.4` with no upper bound on `bcrypt` itself. `passlib` 1.7.4's bcrypt backend loader reads `bcrypt.__about__.__version__`, which was removed in `bcrypt` 4.1.0 (Oct 2023) — so any environment-independent fresh `pip install -r requirements.txt` today resolves a `bcrypt` version that breaks `hash_password()`/`verify_password()` (raises via a confusing `ValueError: password cannot be longer than 72 bytes` before the real `AttributeError` surfaces). This is NOT Python-3.14-specific like the asyncpg/SQLAlchemy issues above — it will hit anyone installing fresh, on any Python version, from today onward. Since Task 2 ported bcrypt-based hashing (which the codebase didn't use before this plan), this is now a real, in-scope bug: `requirements.txt` gets an explicit `bcrypt==4.0.1` pin added directly below the `passlib[bcrypt]==1.7.4` line (Task 3 Step 7a, added below) so a fresh install reproduces a working environment — this is a one-line dependency-file fix, not a "no dependency changes needed" violation, since the existing pin set was actually broken/non-functional for the very feature this plan ports in.

---

### Task 1: Environment setup for local backend testing

**Files:** none (environment only)

- [ ] **Step 1: Create a virtualenv and install backend deps**

Run:
```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
py -m venv venv
./venv/Scripts/pip install -r requirements.txt
./venv/Scripts/pip install pyinstaller
```
Expected: no errors; `pyinstaller` and all of `requirements.txt` install cleanly.

- [ ] **Step 2: Verify the current (unmodified) backend still boots**

Run:
```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
./venv/Scripts/python -m uvicorn app.main:app --port 8000
```
Expected: `Application startup complete.` with no tracebacks. Ctrl+C to stop. This is the baseline — if it doesn't boot cleanly now, note the error before continuing (don't assume every subsequent failure was introduced by this plan).

**Known result on this machine:** this step is EXPECTED TO FAIL with `TypeError: descriptor '__getitem__' requires a 'typing.Union' object but received a 'tuple'` inside SQLAlchemy's declarative mapper, triggered by `Mapped[str | None]` syntax in `app/models/user.py` (see Global Constraints — Python 3.14 / SQLAlchemy 2.0.36 incompatibility). This is a pre-existing condition, not something this plan's changes cause. Task 3 fixes it (Step 3a ports the remaining model files that also use this syntax). Do not attempt to patch source in this task — record the traceback and move on.

- [ ] **Step 3: Commit — skip (no files changed)**

---

### Task 2: Core config, auth, and rate-limiter

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/middleware/auth.py`
- Modify: `backend/app/middleware/rate_limiter.py`

**Interfaces:**
- Produces: `settings.get_content_token_secret()`, `settings.max_content_token_days`, `settings.max_upload_size_bytes` (consumed by Task 3's `routers/tokens.py`, `routers/content.py`, `routers/files.py`)
- Produces: `create_content_access_token(claims: dict) -> str`, `decode_content_token(token: str) -> dict` in `middleware/auth.py` (consumed by Task 3 and Task 4's `routers/inbox.py`)

- [ ] **Step 1: Replace `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings
from functools import lru_cache


import os
import sys

def get_env_path():
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, '.env')
    return '.env'

class Settings(BaseSettings):
    # Database (defaults to SQLite for zero-dependency local dev)
    database_url: str = "sqlite+aiosqlite:///./krypts.db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT — NO DEFAULT. Must be set in environment or .env.
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # Separate secret for content access tokens (DRM tokens)
    # Falls back to jwt_secret_key if not set (migration path).
    content_token_secret: str = ""

    # S3-compatible storage
    s3_endpoint_url: str = "https://s3.amazonaws.com"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket_name: str = "krypts-protected-content"

    # Encryption — NO DEFAULT. Must be set in environment or .env.
    master_kek: str

    # Admin
    admin_email: str = "admin@example.com"

    # Security thresholds
    rapid_session_threshold_seconds: int = 120   # < 2 min = suspicious
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60

    # Max content token lifetime (days)
    max_content_token_days: int = 90

    # Max file upload size (bytes) — 500 MB
    max_upload_size_bytes: int = 500 * 1024 * 1024

    class Config:
        env_file = get_env_path()
        env_file_encoding = "utf-8"

    def get_content_token_secret(self) -> str:
        """Return the content token secret, falling back to jwt_secret_key."""
        return self.content_token_secret or self.jwt_secret_key

@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
```

- [ ] **Step 2: Replace `backend/app/middleware/auth.py`**

```python
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
```

- [ ] **Step 3: Modify `backend/app/middleware/rate_limiter.py`**

Find the Redis client constructor (the `redis.asyncio.from_url(...)` call near the top of the file) and add two timeout kwargs so a dead/slow Redis can't hang requests:

```python
        _redis_client = redis.asyncio.from_url(  # keep the existing variable/function name as-is
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
        )
```
(Match this against the existing call signature in the file — only the two new kwargs are being added; do not otherwise restructure the function.)

- [ ] **Step 4: Verify imports resolve**

Run:
```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
./venv/Scripts/python -c "from app.config import settings; from app.middleware import auth, rate_limiter; print('ok', settings.jwt_secret_key[:5])"
```
Expected: prints `ok` followed by the first 5 chars of the configured JWT secret, no traceback.

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/app/middleware/auth.py backend/app/middleware/rate_limiter.py
git commit -m "security: port bcrypt hashing, content-token secret separation, and no-default secrets from drm-platform"
```

---

### Task 3: Models and database bootstrap (with the admin-seed fix)

**Files:**
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/activity_log.py`
- Create: `backend/app/models/groups.py`
- Create: `backend/app/models/file_share.py`
- Modify: `backend/app/models/api_key.py` (Step 3a — required, not cosmetic; see below)
- Modify: `backend/app/models/protected_file.py` (Step 3a)
- Modify: `backend/app/models/security_alert.py` (Step 3a)
- Modify: `backend/app/database.py`

**Interfaces:**
- Produces: `Group`, `GroupMember`, `GroupInvite` classes (`app.models.groups`), `FileShare` class (`app.models.file_share`) — consumed by Task 5's `routers/groups.py`, `routers/invites.py`, `routers/inbox.py`
- Produces: `User.risk_score` column, `EventType.signup` — consumed by Task 4's `routers/auth.py`

- [ ] **Step 1: Replace `backend/app/models/user.py`**

```python
import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, Integer, DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AccountStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"
    banned = "banned"


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    security_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    account_status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus), default=AccountStatus.active, nullable=False
    )
    warning_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    suspension_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rapid_session_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_login_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    activity_logs: Mapped[list["UserActivityLog"]] = relationship(
        "UserActivityLog", back_populates="user", cascade="all, delete-orphan"
    )
    security_alerts: Mapped[list["SecurityAlert"]] = relationship(
        "SecurityAlert", back_populates="user", cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(
        "ApiKey", back_populates="user", cascade="all, delete-orphan"
    )
    protected_files: Mapped[list["ProtectedFile"]] = relationship(
        "ProtectedFile", back_populates="owner", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} [{self.account_status}]>"
```

- [ ] **Step 2: Replace `backend/app/models/activity_log.py`**

```python
import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, Float, DateTime, func, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EventType(str, enum.Enum):
    signup = "signup"
    login = "login"
    logout = "logout"
    failure = "failure"
    expired = "expired"



class UserActivityLog(Base):
    __tablename__ = "user_activity_logs"

    log_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[str] = mapped_column(String(128), nullable=True, index=True)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)   # IPv4/IPv6
    device_info: Mapped[str] = mapped_column(Text, nullable=True)         # User-Agent string
    login_duration: Mapped[float] = mapped_column(Float, nullable=True)   # seconds

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="activity_logs")

    def __repr__(self) -> str:
        return f"<ActivityLog user={self.user_id} event={self.event_type} at={self.timestamp}>"
```

- [ ] **Step 3: Create `backend/app/models/groups.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import String, ForeignKey, DateTime, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Group(Base):
    __tablename__ = "groups"

    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1024), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    members: Mapped[list["GroupMember"]] = relationship(
        "GroupMember", back_populates="group", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Group {self.name} owner={self.owner_id}>"


class GroupMember(Base):
    __tablename__ = "group_members"

    membership_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("groups.group_id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(64), default="member", nullable=False)

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="members")

    def __repr__(self) -> str:
        return f"<GroupMember group={self.group_id} user={self.user_id}>"


class GroupInvite(Base):
    __tablename__ = "group_invites"

    invite_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("groups.group_id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    invited_by: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    group: Mapped["Group"] = relationship("Group")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    inviter: Mapped["User"] = relationship("User", foreign_keys=[invited_by])

    def __repr__(self) -> str:
        return f"<GroupInvite {self.invite_id} status={self.status}>"
```

- [ ] **Step 4: Create `backend/app/models/file_share.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FileShare(Base):
    __tablename__ = "file_shares"

    share_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("protected_files.file_id", ondelete="CASCADE"), nullable=False, index=True
    )
    shared_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Can share to a user OR a group
    target_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=True, index=True
    )
    target_group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("groups.group_id", ondelete="CASCADE"), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<FileShare file={self.file_id} by={self.shared_by_id}>"
```

- [ ] **Step 4a: Replace `backend/app/models/api_key.py`, `backend/app/models/protected_file.py`, `backend/app/models/security_alert.py`**

These three files were originally assessed as cosmetic (`Optional[X]`/`X | None` typing-style only, no behavior change). That assessment was **wrong for this environment**: on Python 3.14, SQLAlchemy 2.0.36's declarative mapper crashes with `TypeError: descriptor '__getitem__' requires a 'typing.Union' object but received a 'tuple'` on any `Mapped[X | None]` annotation (confirmed via Task 1's baseline boot attempt, traceback rooted in `app/models/user.py`). All three of these files currently use that syntax and must be replaced to avoid the same crash the moment they're imported (via `app/models/__init__.py`, which imports all models together).

Replace `backend/app/models/api_key.py`:

```python
import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, DateTime, func, Boolean, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    key_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Store the hashed key; raw key is shown only once on creation
    key_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(10), nullable=False)   # first 8 chars for display
    label: Mapped[str] = mapped_column(String(128), nullable=True)
    scopes: Mapped[str] = mapped_column(Text, nullable=True)        # comma-separated scopes

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="api_keys")

    def __repr__(self) -> str:
        return f"<ApiKey {self.key_prefix}... user={self.user_id} active={self.is_active}>"
```

Replace `backend/app/models/protected_file.py`:

```python
import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, DateTime, func, BigInteger, Boolean, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProtectedFile(Base):
    __tablename__ = "protected_files"

    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )

    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    # S3 object key for the encrypted file
    s3_key: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    # Encrypted DEK (base64 AES-256-CBC wrapped with master KEK)
    encryption_key_ref: Mapped[str] = mapped_column(String(1024), nullable=True)
    # AES-CBC initialization vector (base64)
    iv: Mapped[str] = mapped_column(String(64), nullable=True)

    # DRM flags
    allow_download: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stream_only: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    watermark_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Relationship
    owner: Mapped["User"] = relationship("User", back_populates="protected_files")

    def __repr__(self) -> str:
        return f"<ProtectedFile {self.filename} owner={self.owner_id}>"
```

Replace `backend/app/models/security_alert.py`:

```python
import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, DateTime, func, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AlertType(str, enum.Enum):
    rapid_session = "rapid_session"
    failed_logins = "failed_logins"
    suspended = "suspended"
    banned = "banned"
    manual = "manual"


class AlertStatus(str, enum.Enum):
    unread = "unread"
    read = "read"


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    alert_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    alert_type: Mapped[AlertType] = mapped_column(Enum(AlertType), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus), default=AlertStatus.unread, nullable=False
    )

    # Extra context fields stored directly for quick admin access
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="security_alerts")

    def __repr__(self) -> str:
        return f"<SecurityAlert type={self.alert_type} user={self.user_id} status={self.status}>"
```

- [ ] **Step 5: Replace `backend/app/database.py`** (note the admin-seed fix in the final block — uses `settings.admin_email`, not a hardcoded string)

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import logging

from app.config import settings

logger = logging.getLogger(__name__)

# SQLite doesn't support connection pooling options; detect and configure accordingly
_is_sqlite = settings.database_url.startswith("sqlite")

# Log which DB we are connecting to (masks password for security)
_db_display = settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url
print(f"[DB] Connecting to: {'SQLite' if _is_sqlite else 'PostgreSQL'} — {_db_display}", flush=True)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    **({} if _is_sqlite else {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}),
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables on startup (dev convenience; use Alembic in production)."""
    import app.models.user  # noqa: F401
    import app.models.activity_log  # noqa: F401
    import app.models.security_alert  # noqa: F401
    import app.models.protected_file  # noqa: F401
    import app.models.api_key  # noqa: F401
    import app.models.groups  # noqa: F401
    import app.models.file_share  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add newly added columns to existing users table if they don't exist
    from sqlalchemy import text
    for col, col_def in [
        ("warning_count", "INTEGER DEFAULT 0"),
        ("suspension_count", "INTEGER DEFAULT 0"),
        ("rapid_session_count", "INTEGER DEFAULT 0"),
        ("risk_score", "INTEGER DEFAULT 0"),
        ("account_status", "VARCHAR DEFAULT 'active'")
    ]:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_def}"))
        except Exception as e:
            # Column likely already exists
            pass

    # Seed admin account
    import uuid
    import secrets
    from sqlalchemy import select
    from app.models.user import User
    from app.middleware.auth import hash_password

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == settings.admin_email))
        admin = result.scalar_one_or_none()
        if not admin:
            # Generate a secure random password and print it once to console.
            # The operator must save this password; it will NOT be shown again.
            admin_password = secrets.token_urlsafe(16)
            print("\n" + "="*60, flush=True)
            print("[ADMIN ACCOUNT CREATED]", flush=True)
            print(f"  Email:    {settings.admin_email}", flush=True)
            print(f"  Password: {admin_password}", flush=True)
            print("  SAVE THIS PASSWORD — it will NOT be shown again.", flush=True)
            print("="*60 + "\n", flush=True)

            admin_user = User(
                user_id=uuid.uuid4(),
                email=settings.admin_email,
                full_name="System Admin",
                password_hash=hash_password(admin_password),
                security_token=secrets.token_hex(32),
            )
            session.add(admin_user)
            await session.commit()
```

- [ ] **Step 6: Verify models import and tables create cleanly**

Run:
```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
rm -f krypts.db
./venv/Scripts/python -c "
import asyncio
from app.database import init_db
asyncio.run(init_db())
"
```
Expected: prints the `[DB] Connecting to: SQLite ...` line, then the `[ADMIN ACCOUNT CREATED]` block with `Email: admin@krypts.com` (matching `backend/.env`'s `ADMIN_EMAIL`) and a generated password — save that password, you'll need it in Task 6's smoke test. No tracebacks. **This confirms the Python 3.14/SQLAlchemy `Mapped[X | None]` crash from Task 1's baseline check is resolved** — if it still throws that `TypeError`, check for any remaining `X | None` annotation in a `Mapped[...]` across all the model files touched in this task.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/user.py backend/app/models/activity_log.py backend/app/models/groups.py backend/app/models/file_share.py backend/app/models/api_key.py backend/app/models/protected_file.py backend/app/models/security_alert.py backend/app/database.py
git commit -m "feat: add Group/GroupMember/GroupInvite/FileShare models, risk_score column, fix admin-seed to use settings.admin_email"
```

- [ ] **Step 7a: Pin `bcrypt` to a version compatible with `passlib[bcrypt]==1.7.4`**

Add an explicit `bcrypt` pin directly below the existing `passlib[bcrypt]==1.7.4` line in `backend/requirements.txt` (find that exact line and insert after it):

```
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
```

This fixes a real, environment-independent bug: `passlib` 1.7.4's bcrypt backend reads `bcrypt.__about__.__version__`, which was removed in `bcrypt` 4.1.0 — an unconstrained `pip install -r requirements.txt` today resolves a newer `bcrypt` and breaks `hash_password()`/`verify_password()` (see Global Constraints). Since Task 2 ported bcrypt-based hashing, this is now a functional requirement, not a style choice.

Run:
```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
./venv/Scripts/pip install "bcrypt==4.0.1"
./venv/Scripts/python -c "
import asyncio
from app.database import init_db
asyncio.run(init_db())
"
```
Expected: same clean `[ADMIN ACCOUNT CREATED]` output as Step 6, no `AttributeError`/`ValueError` about bcrypt/password length. (If `krypts.db` already exists from Step 6 and already has the admin seeded, expect just the `[DB] Connecting...` line and no error — that's still a pass.)

Commit as a separate commit (don't amend Step 7's commit):
```bash
git add backend/requirements.txt
git commit -m "fix: pin bcrypt==4.0.1 for passlib[bcrypt]==1.7.4 compatibility"
```

---

### Task 4: Router fixes — auth, tokens, content, files, analytics, admin

**Files:**
- Modify: `backend/app/schemas/__init__.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/routers/tokens.py`
- Modify: `backend/app/routers/content.py`
- Modify: `backend/app/routers/files.py`
- Modify: `backend/app/routers/analytics.py`
- Modify: `backend/app/routers/admin.py`

**Interfaces:**
- Consumes: `create_content_access_token`, `decode_content_token` from Task 2; `EventType.signup`, `User.risk_score` from Task 3
- Produces: no new public interfaces consumed elsewhere in this plan (these are the "leaf" fixes)

- [ ] **Step 1: Replace `backend/app/schemas/__init__.py`**

```python
"""
Pydantic v2 schemas for all request/response bodies.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    account_status: str
    # NOTE: Internal security counters intentionally NOT exposed to clients.
    created_at: datetime
    last_login_time: Optional[datetime] = None
    is_admin: bool = False

    @classmethod
    def from_user(cls, user) -> "UserResponse":
        from app.config import settings
        return cls(
            id=user.user_id,
            email=user.email,
            full_name=user.full_name,
            account_status=user.account_status.value,
            created_at=user.created_at,
            last_login_time=user.last_login_time,
            is_admin=(user.email == settings.admin_email),
        )


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

class FileUploadResponse(BaseModel):
    id: str
    original_filename: str
    file_type: str
    file_size: int
    status: str = "protected"
    upload_date: datetime
    watermark_enabled: bool
    allow_download: bool


class FileListResponse(FileUploadResponse):
    access_count: int = 0


class FileDeleteResponse(BaseModel):
    message: str
    file_id: str


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

class GenerateTokenRequest(BaseModel):
    file_id: str
    expires_in: str = "2h"          # e.g. "30m", "2h", "7d"
    ip_restriction: Optional[str] = None
    permissions: Dict[str, Any] = {"view": True, "download": False}


class GenerateTokenResponse(BaseModel):
    token: str
    expires_at: datetime
    id: str                          # UUID token record identifier
    file_id: str


class ValidateTokenRequest(BaseModel):
    token: str
    file_id: Optional[str] = None


class ValidateTokenResponse(BaseModel):
    valid: bool
    file_id: Optional[str] = None
    # user_id intentionally NOT returned to prevent UUID enumeration
    expires_at: Optional[datetime] = None
    permissions: Optional[Dict[str, Any]] = None
    message: str = "ok"


# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------

class ApiKeyCreateRequest(BaseModel):
    label: str
    environment: str = "live"        # "live" or "test"


class ApiKeyResponse(BaseModel):
    id: str
    key_prefix: str
    label: str
    environment: str
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None
    raw_key: Optional[str] = None    # Only returned once on creation


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

class UsageAnalytics(BaseModel):
    total_files: int = 0
    total_tokens_issued: int = 0
    total_access_events: int = 0
    blocked_attempts: int = 0
    bandwidth_saved_mb: float = 0.0
    recent_events: List[Dict[str, Any]] = []
    auth_data: List[Dict[str, Any]] = []
    content_data: List[Dict[str, Any]] = []
    geo_data: List[Dict[str, Any]] = []


class SecurityEventItem(BaseModel):
    alert_id: str
    alert_type: str
    description: str
    timestamp: datetime
    status: str
    ip_address: Optional[str] = None


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: Optional[str]
    account_status: str
    warning_count: int
    suspension_count: int
    rapid_session_count: int
    risk_score: int
    # NOTE: security_token intentionally NOT included — it's an internal field.
    created_at: datetime
    last_login_time: Optional[datetime]

    @classmethod
    def from_user(cls, user) -> "AdminUserResponse":
        return cls(
            id=user.user_id,
            email=user.email,
            full_name=user.full_name,
            account_status=user.account_status.value,
            warning_count=user.warning_count,
            suspension_count=user.suspension_count,
            rapid_session_count=user.rapid_session_count,
            risk_score=user.risk_score,
            created_at=user.created_at,
            last_login_time=user.last_login_time,
        )


class ActivityLogResponse(BaseModel):
    log_id: str
    event_type: str
    timestamp: datetime
    ip_address: Optional[str]
    device_info: Optional[str]
    login_duration: Optional[float]
    session_id: Optional[str]


class SecurityAlertResponse(BaseModel):
    alert_id: str
    user_id: str
    alert_type: str
    description: str
    timestamp: datetime
    status: str
    ip_address: Optional[str] = None


class UserActionResponse(BaseModel):
    message: str
    user_id: str
    new_status: str


class AlertUpdateRequest(BaseModel):
    status: str = "read"
```

- [ ] **Step 2: Replace `backend/app/routers/auth.py`**

```python
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
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserResponse

router = APIRouter()

_redis: aioredis.Redis | None = None

# Max failed login attempts before temporary lockout
_MAX_FAILED_ATTEMPTS = 10
_LOCKOUT_KEY_PREFIX = "login_lockout:"
_FAIL_COUNT_KEY_PREFIX = "login_fails:"


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
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
```

- [ ] **Step 3: Replace `backend/app/routers/tokens.py`**

```python
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

from app.config import settings
from app.database import get_db
from app.middleware.auth import create_content_access_token, decode_content_token, get_current_user
from app.models.protected_file import ProtectedFile
from app.schemas import (
    GenerateTokenRequest,
    GenerateTokenResponse,
    ValidateTokenRequest,
    ValidateTokenResponse,
)

router = APIRouter()

_EXPIRY_RE = re.compile(r"^(\d+)(m|h|d)$")
_MAX_EXPIRY_DAYS = settings.max_content_token_days


def _parse_expiry(expires_in: str) -> timedelta:
    m = _EXPIRY_RE.match(expires_in)
    if not m:
        raise HTTPException(status_code=400, detail="Invalid expires_in format. Use e.g. '30m', '2h', '7d'.")
    amount, unit = int(m.group(1)), m.group(2)
    if unit == "m":
        delta = timedelta(minutes=amount)
    elif unit == "h":
        delta = timedelta(hours=amount)
    else:
        delta = timedelta(days=amount)

    # Cap at maximum allowed lifetime
    max_delta = timedelta(days=_MAX_EXPIRY_DAYS)
    if delta > max_delta:
        delta = max_delta
    return delta


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
# POST /validate-token  (requires authentication to prevent token enumeration)
# ---------------------------------------------------------------------------

@router.post("/validate-token", response_model=ValidateTokenResponse)
async def validate_token(
    body: ValidateTokenRequest,
    request: Request,
    current_user=Depends(get_current_user),   # F-26: require auth
):
    try:
        payload = decode_content_token(body.token)
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
            # user_id intentionally NOT returned (prevents UUID enumeration)
            expires_at=exp_dt,
            permissions=payload.get("permissions"),
        )
    except JWTError:
        return ValidateTokenResponse(valid=False, message="Invalid or expired token.")
```

- [ ] **Step 4: Replace `backend/app/routers/content.py`**

```python
"""
Secure content delivery: video streaming, PDF page rendering, image serving.
All endpoints require a valid content access token.
"""
import uuid
from base64 import b64decode
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.middleware.auth import decode_content_token
from app.models.protected_file import ProtectedFile
from app.utils.encryption import decrypt_dek, decrypt_file_bytes
from app.utils.storage import download_encrypted_file
from app.utils.watermark import watermark_image, watermark_pdf_page

router = APIRouter()

CHUNK_SIZE = 65536  # 64 KB


def _safe_filename(filename: str) -> str:
    """Sanitize a filename for use in Content-Disposition headers."""
    import urllib.parse
    # Keep only safe characters; URL-encode the rest
    safe = filename.replace('"', "'").replace('\\', '_').replace('\n', '').replace('\r', '')
    return safe[:255]  # Limit length


def _validate_content_token(token: str, file_id: str, client_ip: str) -> dict:
    """Validate a content access token and return its payload."""
    try:
        payload = decode_content_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired content token.")

    if payload.get("type") != "content_access":
        raise HTTPException(status_code=401, detail="Token is not a content access token.")

    if payload.get("file_id") != file_id:
        raise HTTPException(status_code=403, detail="Token does not match requested file.")

    ip_restriction = payload.get("ip")
    if ip_restriction and client_ip != ip_restriction:
        raise HTTPException(status_code=403, detail="Access denied: IP address mismatch.")

    return payload


async def _get_file_record(file_id: str) -> ProtectedFile:
    """Fetch the ProtectedFile record from DB."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ProtectedFile).where(ProtectedFile.file_id == uuid.UUID(file_id))
        )
        pf = result.scalar_one_or_none()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found.")
    return pf


async def _decrypt_file(pf: ProtectedFile) -> bytes:
    """Download and decrypt a protected file."""
    if not pf.encryption_key_ref or not pf.iv:
        raise HTTPException(status_code=500, detail="File encryption metadata missing.")

    ciphertext = download_encrypted_file(pf.s3_key)
    dek = decrypt_dek(pf.encryption_key_ref)
    iv = b64decode(pf.iv)
    return decrypt_file_bytes(ciphertext, dek, iv)


# ---------------------------------------------------------------------------
# GET /stream/video/{file_id}
# ---------------------------------------------------------------------------

@router.get("/stream/video/{file_id}")
async def stream_video(file_id: str, token: str, request: Request):
    client_ip = request.client.host if request.client else ""
    _validate_content_token(token, file_id, client_ip)

    pf = await _get_file_record(file_id)
    plaintext = await _decrypt_file(pf)

    def video_chunks():
        for i in range(0, len(plaintext), CHUNK_SIZE):
            yield plaintext[i:i + CHUNK_SIZE]

    headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Disposition": f'inline; filename="{_safe_filename(pf.filename)}"',
        "Content-Length": str(len(plaintext)),
        "X-Content-Type-Options": "nosniff",
    }

    media_type = "video/mp4"
    if pf.filename.lower().endswith(".webm"):
        media_type = "video/webm"
    elif pf.filename.lower().endswith(".mov"):
        media_type = "video/quicktime"

    return StreamingResponse(video_chunks(), media_type=media_type, headers=headers)


# ---------------------------------------------------------------------------
# GET /pdf/{file_id}/page/{page}
# ---------------------------------------------------------------------------

@router.get("/pdf/{file_id}/page/{page}")
async def get_pdf_page(file_id: str, page: int, token: str, request: Request):
    client_ip = request.client.host if request.client else ""
    payload = _validate_content_token(token, file_id, client_ip)

    pf = await _get_file_record(file_id)
    plaintext = await _decrypt_file(pf)

    # Build watermark text from token payload
    user_id = payload.get("user_id", "unknown")
    watermark_text = f"Protected • {user_id[:8]}... • Krypts DRM"

    try:
        page_bytes = watermark_pdf_page(plaintext, page, watermark_text)
    except Exception:
        raise HTTPException(status_code=500, detail="PDF rendering failed.")

    return Response(
        content=page_bytes,
        media_type="application/pdf",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ---------------------------------------------------------------------------
# GET /image/{file_id}
# ---------------------------------------------------------------------------

@router.get("/image/{file_id}")
async def get_image(file_id: str, token: str, request: Request):
    client_ip = request.client.host if request.client else ""
    payload = _validate_content_token(token, file_id, client_ip)

    pf = await _get_file_record(file_id)
    plaintext = await _decrypt_file(pf)

    user_id = payload.get("user_id", "unknown")
    watermark_text = f"© Krypts • {user_id[:8]}..."

    try:
        watermarked = watermark_image(plaintext, watermark_text, opacity=0.2)
    except Exception:
        raise HTTPException(status_code=500, detail="Image processing failed.")

    return Response(
        content=watermarked,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ---------------------------------------------------------------------------
# GET /download/{file_id}
# ---------------------------------------------------------------------------

@router.get("/download/{file_id}")
async def download_file(file_id: str, token: str, request: Request):
    client_ip = request.client.host if request.client else ""
    payload = _validate_content_token(token, file_id, client_ip)

    # Check if download permission is granted in the token
    permissions = payload.get("permissions", {})
    if not permissions.get("download"):
        raise HTTPException(
            status_code=403,
            detail="Download permission not granted by this token."
        )

    pf = await _get_file_record(file_id)
    plaintext = await _decrypt_file(pf)

    # Determine media type based on file extension
    media_type = "application/octet-stream"
    filename_lower = pf.filename.lower()
    if filename_lower.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
        media_type = "image/png"
    elif filename_lower.endswith(".pdf"):
        media_type = "application/pdf"
    elif filename_lower.endswith((".mp4", ".webm", ".mov", ".avi", ".mkv")):
        media_type = "video/mp4"

    return Response(
        content=plaintext,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{_safe_filename(pf.filename)}"',
            "X-Content-Type-Options": "nosniff",
        },
    )
```

- [ ] **Step 5: Replace `backend/app/routers/files.py`** (note the `from app.config import settings` import added on the bugfix line — drm-platform's copy omits it and would crash on upload)

```python
"""
File management: upload (encrypt + store), list, delete.
"""
import uuid
from base64 import b64encode
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.protected_file import ProtectedFile
from app.models.activity_log import EventType, UserActivityLog
from app.schemas import FileUploadResponse, FileListResponse, FileDeleteResponse
from app.utils.encryption import generate_dek, generate_iv, encrypt_file_bytes, encrypt_dek
from app.utils.storage import upload_encrypted_file, delete_file

router = APIRouter()

# Map file extensions to content type labels
EXTENSION_MAP = {
    ".mp4": "VIDEO", ".mov": "VIDEO", ".avi": "VIDEO", ".mkv": "VIDEO", ".webm": "VIDEO",
    ".pdf": "PDF",
    ".png": "IMAGE", ".jpg": "IMAGE", ".jpeg": "IMAGE", ".gif": "IMAGE", ".webp": "IMAGE",
}


def _detect_file_type(filename: str) -> str:
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return EXTENSION_MAP.get(suffix, "API_DATA")


# ---------------------------------------------------------------------------
# POST /upload
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Enforce maximum upload size
    if len(data) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {settings.max_upload_size_bytes // (1024*1024)} MB."
        )

    file_id = uuid.uuid4()
    filename = file.filename or f"file_{file_id}"
    file_type = _detect_file_type(filename)

    # Encrypt
    dek = generate_dek()
    iv = generate_iv()
    ciphertext = encrypt_file_bytes(data, dek, iv)
    encrypted_dek_str = encrypt_dek(dek)
    iv_b64 = b64encode(iv).decode()

    storage_key = f"{current_user.user_id}/{file_id}/{filename}.enc"

    try:
        upload_encrypted_file(storage_key, ciphertext)
    except Exception:
        raise HTTPException(status_code=500, detail="Storage error: failed to store file.")

    protected = ProtectedFile(
        file_id=file_id,
        owner_id=current_user.user_id,
        filename=filename,
        content_type=file_type,
        size_bytes=len(data),
        s3_key=storage_key,
        encryption_key_ref=encrypted_dek_str,
        iv=iv_b64,
        allow_download=False,
        stream_only=True,
        watermark_enabled=True,
    )
    db.add(protected)
    await db.commit()
    await db.refresh(protected)

    return FileUploadResponse(
        id=str(protected.file_id),
        original_filename=protected.filename,
        file_type=protected.content_type,
        file_size=protected.size_bytes,
        status="protected",
        upload_date=protected.created_at,
        watermark_enabled=protected.watermark_enabled,
        allow_download=protected.allow_download,
    )


# ---------------------------------------------------------------------------
# GET /files
# ---------------------------------------------------------------------------

@router.get("/files", response_model=list[FileListResponse])
async def list_files(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProtectedFile)
        .where(ProtectedFile.owner_id == current_user.user_id)
        .order_by(ProtectedFile.created_at.desc())
    )
    files = result.scalars().all()

    return [
        FileListResponse(
            id=str(f.file_id),
            original_filename=f.filename,
            file_type=f.content_type,
            file_size=f.size_bytes,
            status="protected",
            upload_date=f.created_at,
            watermark_enabled=f.watermark_enabled,
            allow_download=f.allow_download,
            access_count=0,
        )
        for f in files
    ]


# ---------------------------------------------------------------------------
# DELETE /file/{file_id}
# ---------------------------------------------------------------------------

@router.delete("/file/{file_id}", response_model=FileDeleteResponse)
async def delete_protected_file(
    file_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProtectedFile).where(
            ProtectedFile.file_id == uuid.UUID(file_id),
            ProtectedFile.owner_id == current_user.user_id,
        )
    )
    pf = result.scalar_one_or_none()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found.")

    try:
        delete_file(pf.s3_key)
    except Exception as e:
        # Best-effort storage deletion — log failure but continue
        import logging
        logging.getLogger(__name__).warning("Storage deletion failed for key %s: %s", pf.s3_key, e)

    await db.delete(pf)
    await db.commit()

    return FileDeleteResponse(message="File deleted successfully.", file_id=file_id)
```

- [ ] **Step 6: Replace `backend/app/routers/analytics.py`**

```python
"""
Analytics routes: usage statistics and security event history.
"""
import asyncio
from typing import List, Dict, Any
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.activity_log import EventType, UserActivityLog
from app.models.protected_file import ProtectedFile
from app.models.security_alert import SecurityAlert
from app.schemas import SecurityEventItem, UsageAnalytics

router = APIRouter()


@router.get("/usage", response_model=UsageAnalytics)
async def usage_analytics(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = current_user.user_id

    files_r = await db.execute(
        select(func.count(ProtectedFile.file_id)).where(ProtectedFile.owner_id == uid)
    )
    bw_r = await db.execute(
        select(func.sum(ProtectedFile.size_bytes)).where(ProtectedFile.owner_id == uid)
    )
    events_r = await db.execute(
        select(func.count(UserActivityLog.log_id)).where(
            UserActivityLog.user_id == uid,
            UserActivityLog.event_type == EventType.login,
        )
    )
    failed_r = await db.execute(
        select(func.count(UserActivityLog.log_id)).where(
            UserActivityLog.user_id == uid,
            UserActivityLog.event_type == EventType.failure,
        )
    )
    recent_r = await db.execute(
        select(UserActivityLog)
        .where(UserActivityLog.user_id == uid)
        .order_by(UserActivityLog.timestamp.desc())
        .limit(10)
    )

    seven_days_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)
    logs_r = await db.execute(
        select(UserActivityLog)
        .where(
            UserActivityLog.user_id == uid,
            UserActivityLog.timestamp >= seven_days_ago
        )
    )
    types_r = await db.execute(
        select(ProtectedFile.content_type, func.count(ProtectedFile.file_id))
        .where(ProtectedFile.owner_id == uid)
        .group_by(ProtectedFile.content_type)
    )
    ips_r = await db.execute(
        select(UserActivityLog.ip_address, func.count(UserActivityLog.log_id))
        .where(UserActivityLog.user_id == uid, UserActivityLog.ip_address.isnot(None))
        .group_by(UserActivityLog.ip_address)
        .order_by(func.count(UserActivityLog.log_id).desc())
        .limit(5)
    )

    total_files = files_r.scalar() or 0
    total_bytes = bw_r.scalar() or 0
    bandwidth_saved_mb = round(total_bytes / (1024 * 1024), 2)
    total_access_events = events_r.scalar() or 0
    blocked_attempts = failed_r.scalar() or 0
    recent_logs = recent_r.scalars().all()

    recent_events = [
        {
            "id": str(log.log_id),
            "event_type": log.event_type.value,
            "timestamp": log.timestamp.isoformat(),
            "ip_address": log.ip_address,
        }
        for log in recent_logs
    ]

    # Calculate auth_data for last 7 days
    today = datetime.now(timezone.utc)
    days_dict = {}
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        day_name = d.strftime("%a")
        date_str = d.strftime("%Y-%m-%d")
        days_dict[date_str] = {
            "name": day_name,
            "sessions": 0,
            "blocked": 0
        }

    all_logs = logs_r.scalars().all()
    for log in all_logs:
        log_date = log.timestamp.strftime("%Y-%m-%d")
        if log_date in days_dict:
            if log.event_type == EventType.login:
                days_dict[log_date]["sessions"] += 1
            elif log.event_type == EventType.failure:
                days_dict[log_date]["blocked"] += 1

    auth_data = [days_dict[d] for d in sorted(days_dict.keys())]

    # Calculate content_data
    files_types = types_r.all()
    type_map = {
        "video": {"name": "Video", "color": "#ec4899"},
        "pdf": {"name": "PDF", "color": "#3b82f6"},
        "image": {"name": "Image", "color": "#10b981"}
    }

    content_data = []
    total_val = sum(item[1] for item in files_types)
    for f_type, count in files_types:
        f_type_lower = (f_type or "image").lower()
        if "video" in f_type_lower:
            cat = "video"
        elif "pdf" in f_type_lower:
            cat = "pdf"
        else:
            cat = "image"

        cfg = type_map[cat]
        percentage = round((count / total_val) * 100) if total_val > 0 else 0

        existing = next((x for x in content_data if x["name"] == cfg["name"]), None)
        if existing:
            existing["value"] += percentage
        else:
            content_data.append({
                "name": cfg["name"],
                "value": percentage,
                "color": cfg["color"]
            })

    # Calculate geo_data (IP addresses)
    ip_counts = ips_r.all()
    geo_data = [{"name": item[0] if item[0] else "Unknown", "value": item[1]} for item in ip_counts]

    return UsageAnalytics(
        total_files=total_files,
        total_tokens_issued=total_access_events,
        total_access_events=total_access_events,
        blocked_attempts=blocked_attempts,
        bandwidth_saved_mb=bandwidth_saved_mb,
        recent_events=recent_events,
        auth_data=auth_data,
        content_data=content_data,
        geo_data=geo_data
    )


@router.get("/security-events", response_model=list[SecurityEventItem])
async def security_events(
    limit: int = 20,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SecurityAlert)
        .where(SecurityAlert.user_id == current_user.user_id)
        .order_by(SecurityAlert.timestamp.desc())
        .limit(limit)
    )
    alerts = result.scalars().all()

    return [
        SecurityEventItem(
            alert_id=str(a.alert_id),
            alert_type=a.alert_type.value,
            description=a.description,
            timestamp=a.timestamp,
            status=a.status.value,
            ip_address=a.ip_address,
        )
        for a in alerts
    ]


from pydantic import BaseModel

class TelemetryEvent(BaseModel):
    event_type: str
    metadata: dict = {}

@router.post("/telemetry", response_model=dict)
async def submit_telemetry(
    event: TelemetryEvent,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.user import User, AccountStatus
    from app.models.security_alert import SecurityAlert, AlertType

    result = await db.execute(select(User).where(User.user_id == current_user.user_id))
    user = result.scalar_one_or_none()

    if not user:
        return {"status": "error", "detail": "User not found"}

    score_increment = 0
    alert_threshold = 80

    if event.event_type == "rapid_scrubbing":
        score_increment = 10
    elif event.event_type == "copy_attempt":
        score_increment = 20
    elif event.event_type == "dev_tools_opened":
        score_increment = 50

    if score_increment > 0:
        user.risk_score += score_increment

        # If threshold crossed, auto-ban
        if user.risk_score >= alert_threshold and user.account_status != AccountStatus.banned:
            user.account_status = AccountStatus.banned

            alert = SecurityAlert(
                user_id=user.user_id,
                alert_type=AlertType.banned,
                description=f"Auto-banned due to high risk score ({user.risk_score}): {event.event_type}",
                ip_address=event.metadata.get("ip_address", "unknown")
            )
            db.add(alert)

        await db.commit()

    return {"status": "ok", "new_score": user.risk_score, "banned": user.account_status == AccountStatus.banned}
```

- [ ] **Step 7: Replace `backend/app/routers/admin.py`**

```python
"""
Admin routes: user management, activity logs, security alerts.
Requires the requesting user's email to match ADMIN_EMAIL in settings.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.activity_log import UserActivityLog
from app.models.security_alert import AlertStatus, SecurityAlert
from app.models.user import AccountStatus, User
from app.schemas import (
    ActivityLogResponse,
    AdminUserResponse,
    AlertUpdateRequest,
    SecurityAlertResponse,
    UserActionResponse,
)

router = APIRouter()


def _require_admin(current_user):
    if current_user.email != settings.admin_email:
        raise HTTPException(status_code=403, detail="Admin access required.")


# ---------------------------------------------------------------------------
# GET /admin/users
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )
    users = result.scalars().all()
    return [AdminUserResponse.from_user(u) for u in users]


# ---------------------------------------------------------------------------
# GET /admin/user/{user_id}/activity
# ---------------------------------------------------------------------------

@router.get("/user/{user_id}/activity", response_model=list[ActivityLogResponse])
async def user_activity(
    user_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(
        select(UserActivityLog)
        .where(UserActivityLog.user_id == uuid.UUID(user_id))
        .order_by(UserActivityLog.timestamp.desc())
        .limit(100)
    )
    logs = result.scalars().all()
    return [
        ActivityLogResponse(
            log_id=str(log.log_id),
            event_type=log.event_type.value,
            timestamp=log.timestamp,
            ip_address=log.ip_address,
            device_info=log.device_info,
            login_duration=log.login_duration,
            session_id=log.session_id,
        )
        for log in logs
    ]


# ---------------------------------------------------------------------------
# POST /admin/user/{user_id}/ban
# ---------------------------------------------------------------------------

@router.post("/user/{user_id}/ban", response_model=UserActionResponse)
async def ban_user(
    user_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(select(User).where(User.user_id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Prevent self-ban or banning another admin
    if str(user.user_id) == str(current_user.user_id):
        raise HTTPException(status_code=400, detail="Cannot ban your own account.")
    if user.email == settings.admin_email:
        raise HTTPException(status_code=400, detail="Cannot ban the admin account.")

    user.account_status = AccountStatus.banned
    await db.commit()
    return UserActionResponse(message="User banned.", user_id=user_id, new_status="banned")


# ---------------------------------------------------------------------------
# POST /admin/user/{user_id}/suspend
# ---------------------------------------------------------------------------

@router.post("/user/{user_id}/suspend", response_model=UserActionResponse)
async def suspend_user(
    user_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(select(User).where(User.user_id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Prevent self-suspend or suspending another admin
    if str(user.user_id) == str(current_user.user_id):
        raise HTTPException(status_code=400, detail="Cannot suspend your own account.")
    if user.email == settings.admin_email:
        raise HTTPException(status_code=400, detail="Cannot suspend the admin account.")

    user.account_status = AccountStatus.suspended
    user.suspension_count += 1
    await db.commit()
    return UserActionResponse(message="User suspended.", user_id=user_id, new_status="suspended")


# ---------------------------------------------------------------------------
# POST /admin/user/{user_id}/reactivate
# ---------------------------------------------------------------------------

@router.post("/user/{user_id}/reactivate", response_model=UserActionResponse)
async def reactivate_user(
    user_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(select(User).where(User.user_id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.account_status = AccountStatus.active
    user.rapid_session_count = 0
    user.risk_score = 0
    await db.commit()
    return UserActionResponse(message="User reactivated.", user_id=user_id, new_status="active")


# ---------------------------------------------------------------------------
# GET /admin/security-alerts
# ---------------------------------------------------------------------------

@router.get("/security-alerts", response_model=list[SecurityAlertResponse])
async def security_alerts(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(
        select(SecurityAlert)
        .order_by(SecurityAlert.timestamp.desc())
        .offset(skip)
        .limit(limit)
    )
    alerts = result.scalars().all()
    return [
        SecurityAlertResponse(
            alert_id=str(a.alert_id),
            user_id=str(a.user_id),
            alert_type=a.alert_type.value,
            description=a.description,
            timestamp=a.timestamp,
            status=a.status.value,
            ip_address=a.ip_address,
        )
        for a in alerts
    ]


# ---------------------------------------------------------------------------
# PATCH /admin/security-alerts/{alert_id}
# ---------------------------------------------------------------------------

@router.patch("/security-alerts/{alert_id}", response_model=SecurityAlertResponse)
async def update_alert(
    alert_id: str,
    body: AlertUpdateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(
        select(SecurityAlert).where(SecurityAlert.alert_id == uuid.UUID(alert_id))
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")

    alert.status = AlertStatus.read if body.status == "read" else AlertStatus.unread
    await db.commit()
    await db.refresh(alert)

    return SecurityAlertResponse(
        alert_id=str(alert.alert_id),
        user_id=str(alert.user_id),
        alert_type=alert.alert_type.value,
        description=alert.description,
        timestamp=alert.timestamp,
        status=alert.status.value,
        ip_address=alert.ip_address,
    )
```

- [ ] **Step 8: Verify all routers import cleanly**

Run:
```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
./venv/Scripts/python -c "from app.routers import admin, analytics, apikeys, auth, content, files, tokens; print('all routers import ok')"
```
Expected: `all routers import ok`, no `NameError`/`ImportError`.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/__init__.py backend/app/routers/auth.py backend/app/routers/tokens.py backend/app/routers/content.py backend/app/routers/files.py backend/app/routers/analytics.py backend/app/routers/admin.py
git commit -m "fix: port brute-force lockout, content-token validation, upload size limits, telemetry risk scoring, admin self-action guards from drm-platform"
```

---

### Task 5: Groups, Invites, Inbox routers + wire up main.py

**Files:**
- Create: `backend/app/routers/groups.py`
- Create: `backend/app/routers/invites.py`
- Replace (untracked): `backend/app/routers/inbox.py`
- Modify: `backend/app/main.py`
- Delete: `backend/app/utils/storage.py` is modified in Task 6, not here

**Interfaces:**
- Consumes: `Group`, `GroupMember`, `GroupInvite` (Task 3), `FileShare` (Task 3), `create_content_access_token`/`decode_content_token` pattern via `settings.get_content_token_secret()` (Task 2)
- Produces: `/groups`, `/invites`, `/inbox` HTTP routes matching `src/lib/api.ts`'s `api.groups.*`, `api.invites.*`, `api.inbox.*` calls exactly

- [ ] **Step 1: Create `backend/app/routers/groups.py`**

```python
import uuid
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.groups import Group, GroupMember, GroupInvite

router = APIRouter()


class GroupCreateReq(BaseModel):
    name: str
    description: Optional[str] = None


class GroupResponse(BaseModel):
    group_id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: Optional[str]
    member_count: int


class AddMemberReq(BaseModel):
    email: str


class GroupMemberResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: Optional[str]
    role: str
    joined_at: datetime


@router.post("", response_model=GroupResponse)
async def create_group(
    req: GroupCreateReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_group = Group(
        owner_id=current_user.user_id,
        name=req.name,
        description=req.description,
    )
    db.add(new_group)
    await db.commit()
    await db.refresh(new_group)

    # Add owner as admin member
    member = GroupMember(
        group_id=new_group.group_id,
        user_id=current_user.user_id,
        role="admin"
    )
    db.add(member)
    await db.commit()

    return {
        "group_id": new_group.group_id,
        "owner_id": new_group.owner_id,
        "name": new_group.name,
        "description": new_group.description,
        "member_count": 1
    }


@router.get("", response_model=List[GroupResponse])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func
    # Get groups where I am a member
    subq = select(GroupMember.group_id).where(GroupMember.user_id == current_user.user_id)

    stmt = (
        select(Group, func.count(GroupMember.membership_id))
        .join(GroupMember, Group.group_id == GroupMember.group_id)
        .where(Group.group_id.in_(subq))
        .group_by(Group.group_id)
    )
    result = await db.execute(stmt)
    rows = result.all()

    resp = []
    for g, count in rows:
        resp.append({
            "group_id": g.group_id,
            "owner_id": g.owner_id,
            "name": g.name,
            "description": g.description,
            "member_count": count
        })
    return resp


@router.post("/{group_id}/invite")
async def invite_member(
    group_id: uuid.UUID,
    req: AddMemberReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify group ownership
    stmt = select(Group).where(Group.group_id == group_id, Group.owner_id == current_user.user_id)
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=403, detail="Not authorized to invite members to this group")

    # Find user by email
    u_stmt = select(User).where(User.email == req.email)
    u_result = await db.execute(u_stmt)
    target_user = u_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User with this email not found")

    # Check if already a member
    m_stmt = select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == target_user.user_id)
    m_result = await db.execute(m_stmt)
    if m_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member of this group")

    # Check if already invited
    i_stmt = select(GroupInvite).where(
        GroupInvite.group_id == group_id,
        GroupInvite.user_id == target_user.user_id,
        GroupInvite.status == "pending"
    )
    i_result = await db.execute(i_stmt)
    if i_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already invited to this group")

    # Create invite
    new_invite = GroupInvite(
        group_id=group_id,
        user_id=target_user.user_id,
        invited_by=current_user.user_id,
        status="pending"
    )
    db.add(new_invite)
    await db.commit()

    return {"status": "success", "detail": f"Invited {target_user.email} to group"}


@router.get("/{group_id}/members", response_model=List[GroupMemberResponse])
async def list_group_members(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if user is a member or owner of the group
    g_stmt = select(Group).where(Group.group_id == group_id)
    group = (await db.execute(g_stmt)).scalar_one_or_none()

    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    m_stmt = select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.user_id)
    is_member = (await db.execute(m_stmt)).scalar_one_or_none() is not None

    if group.owner_id != current_user.user_id and not is_member:
        raise HTTPException(status_code=403, detail="Not authorized to view members of this group")

    # Fetch all members
    stmt = select(GroupMember, User).join(User, GroupMember.user_id == User.user_id).where(GroupMember.group_id == group_id)
    result = await db.execute(stmt)
    rows = result.all()

    resp = []
    for member, user in rows:
        resp.append({
            "user_id": user.user_id,
            "email": user.email,
            "full_name": user.full_name,
            "role": member.role,
            "joined_at": member.joined_at,
        })

    return resp

class GroupFileResponse(BaseModel):
    share_id: uuid.UUID
    file_id: uuid.UUID
    filename: str
    content_type: str
    shared_by_email: str
    shared_at: datetime

@router.get("/{group_id}/files", response_model=List[GroupFileResponse])
async def list_group_files(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.file_share import FileShare
    from app.models.protected_file import ProtectedFile

    # Verify group membership
    g_stmt = select(Group).where(Group.group_id == group_id)
    group = (await db.execute(g_stmt)).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    m_stmt = select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.user_id)
    is_member = (await db.execute(m_stmt)).scalar_one_or_none() is not None

    if group.owner_id != current_user.user_id and not is_member:
        raise HTTPException(status_code=403, detail="Not authorized to view files of this group")

    stmt = (
        select(FileShare, ProtectedFile, User)
        .join(ProtectedFile, FileShare.file_id == ProtectedFile.file_id)
        .join(User, FileShare.shared_by_id == User.user_id)
        .where(FileShare.target_group_id == group_id)
    )
    result = await db.execute(stmt)
    rows = result.all()

    resp = []
    for share, file, user in rows:
        resp.append({
            "share_id": share.share_id,
            "file_id": file.file_id,
            "filename": file.filename,
            "content_type": file.content_type,
            "shared_by_email": user.email,
            "shared_at": share.created_at,
        })
    return resp

@router.delete("/{group_id}/files/{share_id}")
async def delete_group_file(
    group_id: uuid.UUID,
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.file_share import FileShare

    # Fetch the share
    stmt = select(FileShare).where(
        FileShare.share_id == share_id,
        FileShare.target_group_id == group_id
    )
    share = (await db.execute(stmt)).scalar_one_or_none()

    if not share:
        raise HTTPException(status_code=404, detail="File share not found in this group")

    # Only the person who shared it (or group owner) can delete it
    if str(share.shared_by_id) != str(current_user.user_id):
        # Check if group owner
        g_stmt = select(Group).where(Group.group_id == group_id)
        group = (await db.execute(g_stmt)).scalar_one_or_none()
        if not group or str(group.owner_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to delete this file share")

    await db.delete(share)
    await db.commit()

    return {"status": "success"}
```

- [ ] **Step 2: Create `backend/app/routers/invites.py`**

```python
import uuid
from typing import List, Optional
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.groups import Group, GroupMember, GroupInvite

router = APIRouter()


class GroupInviteResponse(BaseModel):
    invite_id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    invited_by_name: str
    invited_by_email: str
    created_at: datetime
    status: str


@router.get("", response_model=List[GroupInviteResponse])
async def list_invites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(GroupInvite, Group, User)
        .join(Group, GroupInvite.group_id == Group.group_id)
        .join(User, GroupInvite.invited_by == User.user_id)
        .where(
            GroupInvite.user_id == current_user.user_id,
            GroupInvite.status == "pending"
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    resp = []
    for invite, group, inviter in rows:
        resp.append({
            "invite_id": invite.invite_id,
            "group_id": invite.group_id,
            "group_name": group.name,
            "invited_by_name": inviter.full_name or inviter.email,
            "invited_by_email": inviter.email,
            "created_at": invite.created_at,
            "status": invite.status
        })

    return resp


@router.post("/{invite_id}/accept")
async def accept_invite(
    invite_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(GroupInvite).where(
        GroupInvite.invite_id == invite_id,
        GroupInvite.user_id == current_user.user_id,
        GroupInvite.status == "pending"
    )
    result = await db.execute(stmt)
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already processed")

    # Mark as accepted
    invite.status = "accepted"

    # Add to group members if not already there
    m_stmt = select(GroupMember).where(
        GroupMember.group_id == invite.group_id,
        GroupMember.user_id == current_user.user_id
    )
    m_result = await db.execute(m_stmt)
    if not m_result.scalar_one_or_none():
        new_member = GroupMember(
            group_id=invite.group_id,
            user_id=current_user.user_id,
            role="member"
        )
        db.add(new_member)

    await db.commit()
    return {"status": "success", "detail": "Invite accepted"}


@router.post("/{invite_id}/reject")
async def reject_invite(
    invite_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(GroupInvite).where(
        GroupInvite.invite_id == invite_id,
        GroupInvite.user_id == current_user.user_id,
        GroupInvite.status == "pending"
    )
    result = await db.execute(stmt)
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already processed")

    # Mark as rejected
    invite.status = "rejected"
    await db.commit()
    return {"status": "success", "detail": "Invite rejected"}
```

- [ ] **Step 3: Replace `backend/app/routers/inbox.py`** (this file is currently untracked/uncommitted in git and imports models that didn't exist until Task 3 — this is the corrected, working version)

```python
import uuid
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from jose import jwt

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.config import settings
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.protected_file import ProtectedFile
from app.models.file_share import FileShare
from app.models.groups import GroupMember

router = APIRouter()


class ShareFileReq(BaseModel):
    file_id: uuid.UUID
    target_email: Optional[str] = None
    target_group_id: Optional[uuid.UUID] = None


class InboxItem(BaseModel):
    share_id: uuid.UUID
    file_id: uuid.UUID
    filename: str
    content_type: str
    shared_by_name: str
    shared_by_email: str
    shared_at: datetime
    access_token: str


def generate_short_lived_token(file_id: uuid.UUID, user_email: str) -> str:
    payload = {
        "sub": user_email,
        "file_id": str(file_id),
        "type": "content_access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),  # 24-hour token
        "permissions": {"stream": True, "download": False}
    }
    return jwt.encode(payload, settings.get_content_token_secret(), algorithm="HS256")


@router.post("/share")
async def share_file(
    req: ShareFileReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify file ownership
    f_stmt = select(ProtectedFile).where(ProtectedFile.file_id == req.file_id, ProtectedFile.owner_id == current_user.user_id)
    f_result = await db.execute(f_stmt)
    file = f_result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found or not owned by you")

    target_user_id = None
    if req.target_email:
        u_stmt = select(User).where(User.email == req.target_email)
        u_result = await db.execute(u_stmt)
        target_user = u_result.scalar_one_or_none()
        if not target_user:
            raise HTTPException(status_code=404, detail=f"User {req.target_email} not found")
        target_user_id = target_user.user_id

    if not target_user_id and not req.target_group_id:
        raise HTTPException(status_code=400, detail="Must provide target_email or target_group_id")

    # Create share record
    share = FileShare(
        file_id=req.file_id,
        shared_by_id=current_user.user_id,
        target_user_id=target_user_id,
        target_group_id=req.target_group_id
    )
    db.add(share)
    await db.commit()

    return {"status": "success", "detail": "File shared successfully"}


@router.get("", response_model=List[InboxItem])
async def get_inbox(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Find all groups this user is a member of
    g_stmt = select(GroupMember.group_id).where(GroupMember.user_id == current_user.user_id)
    g_result = await db.execute(g_stmt)
    my_group_ids = g_result.scalars().all()

    # Find all file shares for this user OR their groups
    # Using multiple queries for simplicity in SQLite compatibility

    # 1. Direct shares
    s1_stmt = select(FileShare, ProtectedFile, User).join(
        ProtectedFile, FileShare.file_id == ProtectedFile.file_id
    ).join(
        User, FileShare.shared_by_id == User.user_id
    ).where(FileShare.target_user_id == current_user.user_id)

    # 2. Group shares
    s2_stmt = select(FileShare, ProtectedFile, User).join(
        ProtectedFile, FileShare.file_id == ProtectedFile.file_id
    ).join(
        User, FileShare.shared_by_id == User.user_id
    ).where(FileShare.target_group_id.in_(my_group_ids))

    results1 = await db.execute(s1_stmt)
    results2 = await db.execute(s2_stmt)

    all_shares = results1.all() + results2.all()

    # Deduplicate by share_id just in case
    seen_shares = set()
    response_items = []

    for share, file, sharer in all_shares:
        if share.share_id in seen_shares:
            continue
        seen_shares.add(share.share_id)

        token = generate_short_lived_token(file.file_id, current_user.email)

        response_items.append({
            "share_id": share.share_id,
            "file_id": file.file_id,
            "filename": file.filename,
            "content_type": file.content_type,
            "shared_by_name": sharer.full_name or sharer.email,
            "shared_by_email": sharer.email,
            "shared_at": share.created_at,
            "access_token": token
        })

    # Sort descending by shared_at
    response_items.sort(key=lambda x: x["shared_at"], reverse=True)
    return response_items
```

- [ ] **Step 4: Replace `backend/app/main.py`**

```python
"""
Krypts DRM Platform — FastAPI application entry point.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.routers import admin, analytics, apikeys, auth, content, files, tokens, groups, inbox, invites


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database tables on startup."""
    await init_db()
    yield


# ---------------------------------------------------------------------------
# API docs: only expose in development mode
# ---------------------------------------------------------------------------
_expose_docs = os.getenv("KRYPTS_ENV", "production").lower() in ("dev", "development", "local")

app = FastAPI(
    title="Krypts DRM API",
    description=(
        "Plug-and-play Digital Rights Management API with AES-256 encryption, "
        "signed access tokens, traceable watermarking, and security intelligence."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# CORS — allow only the Electron renderer and localhost dev server.
# The krypts:// protocol uses null origin in some Electron versions; we allow
# the localhost wildcard only.  Tighten further before deploying publicly.
_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_ALLOWED_ORIGIN_REGEX = r"^http://127\.0\.0\.1(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_origin_regex=_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.add_middleware(RateLimiterMiddleware)


# ---------------------------------------------------------------------------
# Security response headers middleware
# ---------------------------------------------------------------------------

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(files.router, tags=["File Management"])
app.include_router(tokens.router, tags=["Token Management"])
app.include_router(content.router, tags=["Secure Content"])
app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
app.include_router(apikeys.router, prefix="/apikey", tags=["API Keys"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(groups.router, prefix="/groups", tags=["Groups"])
app.include_router(inbox.router, prefix="/inbox", tags=["Inbox"])
app.include_router(invites.router, prefix="/invites", tags=["Invites"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health():
    return {"status": "healthy", "version": "1.0.0"}
```

**Important:** the new CORS config restricts origins to `localhost:3000`/`127.0.0.1:3000` (dev Next.js server) and any `127.0.0.1:<port>` (packaged Electron's local static server, per `main.js`'s `startLocalServer()`). If Task 7's smoke test is run with `curl` from a different tool/origin, that's fine (curl doesn't send an `Origin` header so CORS doesn't block it) — but if the packaged Electron app ever serves the frontend from a different host, revisit `_ALLOWED_ORIGIN_REGEX`.

- [ ] **Step 5: Verify the app boots with all 10 routers registered**

Run:
```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
./venv/Scripts/python -m uvicorn app.main:app --port 8000
```
Expected: `Application startup complete.`, the `[ADMIN ACCOUNT CREATED]` block only appears if `krypts.db` doesn't already have that admin (skip if you already created one in Task 3 Step 6). Leave this running for Task 6.

In a second terminal, confirm the new routes exist:
```
curl -s http://127.0.0.1:8000/openapi.json | grep -o '"/groups[^"]*"\|"/invites[^"]*"\|"/inbox[^"]*"' | sort -u
```
Expected output includes `"/groups"`, `"/groups/{group_id}/invite"`, `"/groups/{group_id}/members"`, `"/groups/{group_id}/files"`, `"/groups/{group_id}/files/{share_id}"`, `"/invites"`, `"/invites/{invite_id}/accept"`, `"/invites/{invite_id}/reject"`, `"/inbox"`, `"/inbox/share"`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/groups.py backend/app/routers/invites.py backend/app/routers/inbox.py backend/app/main.py
git commit -m "feat: add Groups/Invites/Inbox routers and register them in main.py, matching frontend api.ts contract"
```

---

### Task 6: Storage — LOCAL_VAULT_PATH override

**Files:**
- Modify: `backend/app/utils/storage.py`

**Interfaces:**
- Consumes: nothing new
- Produces: same public functions (`upload_encrypted_file`, `download_encrypted_file`, `delete_file`) — signatures unchanged, only the vault root path resolution changes

- [ ] **Step 1: Replace `backend/app/utils/storage.py`**

```python
"""
Dual-mode storage: S3-compatible or local filesystem fallback.

Storage key format: {owner_id}/{file_id}/{filename}.enc
For local storage, files are saved under the local_vault/ directory.
"""
import socket
from pathlib import Path
from urllib.parse import urlparse

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import settings

import os

LOCAL_VAULT = Path(os.environ.get("LOCAL_VAULT_PATH", Path(__file__).parent.parent.parent / "local_vault"))


def _check_s3_available() -> bool:
    """Quick TCP check to see if the S3 endpoint is reachable."""
    if not settings.s3_access_key or not settings.s3_secret_key:
        return False
    try:
        parsed = urlparse(settings.s3_endpoint_url)
        host = parsed.hostname or "s3.amazonaws.com"
        port = parsed.port or 443
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
    )


def _local_path(storage_key: str) -> Path:
    return LOCAL_VAULT / storage_key


def upload_encrypted_file(storage_key: str, encrypted_data: bytes) -> None:
    """Store encrypted file bytes. Uses S3 if available, otherwise local_vault."""
    if _check_s3_available():
        s3 = _get_s3_client()
        try:
            s3.head_bucket(Bucket=settings.s3_bucket_name)
        except ClientError:
            s3.create_bucket(Bucket=settings.s3_bucket_name)
        s3.put_object(
            Bucket=settings.s3_bucket_name,
            Key=storage_key,
            Body=encrypted_data,
            ContentType="application/octet-stream",
        )
    else:
        path = _local_path(storage_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encrypted_data)


def download_encrypted_file(storage_key: str) -> bytes:
    """Retrieve encrypted file bytes."""
    if _check_s3_available():
        s3 = _get_s3_client()
        resp = s3.get_object(Bucket=settings.s3_bucket_name, Key=storage_key)
        return resp["Body"].read()
    else:
        path = _local_path(storage_key)
        if not path.exists():
            raise FileNotFoundError(f"Encrypted file not found: {storage_key}")
        return path.read_bytes()


def delete_file(storage_key: str) -> None:
    """Delete an encrypted file from storage."""
    if _check_s3_available():
        s3 = _get_s3_client()
        s3.delete_object(Bucket=settings.s3_bucket_name, Key=storage_key)
    else:
        path = _local_path(storage_key)
        if path.exists():
            path.unlink()
```

- [ ] **Step 2: Verify import**

Run:
```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
./venv/Scripts/python -c "from app.utils import storage; print(storage.LOCAL_VAULT)"
```
Expected: prints a path ending in `local_vault` (no `LOCAL_VAULT_PATH` env var is set in this shell, so it falls back to the default relative path — this matches current desktop behavior when run outside Electron).

- [ ] **Step 3: Commit**

```bash
git add backend/app/utils/storage.py
git commit -m "feat: allow LOCAL_VAULT_PATH env override for vault location (used by Electron packaging)"
```

---

### Task 7: End-to-end local smoke test (uvicorn + curl)

**Files:** none (verification only)

- [ ] **Step 1: Start the backend fresh**

```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
rm -f krypts.db
./venv/Scripts/python -m uvicorn app.main:app --port 8000
```
Note the generated admin password printed to console (`[ADMIN ACCOUNT CREATED]`).

- [ ] **Step 2: Signup two users and log in**

In a second terminal:
```
curl -s -X POST http://127.0.0.1:8000/auth/signup -H "Content-Type: application/json" -d '{"email":"alice@test.com","password":"password123","full_name":"Alice"}'
curl -s -X POST http://127.0.0.1:8000/auth/signup -H "Content-Type: application/json" -d '{"email":"bob@test.com","password":"password123","full_name":"Bob"}'
```
Expected: both return `{"access_token": "...", "token_type": "bearer"}`. Save Alice's token as `ALICE_TOKEN` and Bob's as `BOB_TOKEN` (shell variables).

- [ ] **Step 3: Alice creates a group and invites Bob**

```
curl -s -X POST http://127.0.0.1:8000/groups -H "Authorization: Bearer $ALICE_TOKEN" -H "Content-Type: application/json" -d '{"name":"Test Group","description":"smoke test"}'
```
Expected: `{"group_id": "...", "owner_id": "...", "name": "Test Group", "description": "smoke test", "member_count": 1}`. Save `group_id`.

```
curl -s -X POST http://127.0.0.1:8000/groups/$GROUP_ID/invite -H "Authorization: Bearer $ALICE_TOKEN" -H "Content-Type: application/json" -d '{"email":"bob@test.com"}'
```
Expected: `{"status": "success", "detail": "Invited bob@test.com to group"}`.

- [ ] **Step 4: Bob sees and accepts the invite**

```
curl -s http://127.0.0.1:8000/invites -H "Authorization: Bearer $BOB_TOKEN"
```
Expected: a list containing one invite with `group_name: "Test Group"`. Save `invite_id`.

```
curl -s -X POST http://127.0.0.1:8000/invites/$INVITE_ID/accept -H "Authorization: Bearer $BOB_TOKEN"
```
Expected: `{"status": "success", "detail": "Invite accepted"}`.

- [ ] **Step 5: Alice uploads a file and shares it with Bob**

```
echo "test content" > /tmp/test.txt
curl -s -X POST http://127.0.0.1:8000/upload -H "Authorization: Bearer $ALICE_TOKEN" -F "file=@/tmp/test.txt"
```
Expected: `{"id": "...", "original_filename": "test.txt", ..., "status": "protected", ...}`. Save `file_id` (the `"id"` field).

```
curl -s -X POST http://127.0.0.1:8000/inbox/share -H "Authorization: Bearer $ALICE_TOKEN" -H "Content-Type: application/json" -d "{\"file_id\":\"$FILE_ID\",\"target_email\":\"bob@test.com\"}"
```
Expected: `{"status": "success", "detail": "File shared successfully"}`.

- [ ] **Step 6: Bob checks his inbox**

```
curl -s http://127.0.0.1:8000/inbox -H "Authorization: Bearer $BOB_TOKEN"
```
Expected: a list with one item, `filename: "test.txt"`, `shared_by_email: "alice@test.com"`, and a non-empty `access_token` field.

- [ ] **Step 7: Confirm existing (non-groups) features still work**

```
curl -s http://127.0.0.1:8000/auth/me -H "Authorization: Bearer $ALICE_TOKEN"
```
Expected: `{"id": "...", "email": "alice@test.com", "full_name": "Alice", "account_status": "active", "created_at": "...", "last_login_time": null, "is_admin": false}` — confirms the new `UserResponse` shape (no `security_token`, has `is_admin`) matches what `src/lib/api.ts`'s `UserResponse` interface expects.

```
curl -s http://127.0.0.1:8000/analytics/usage -H "Authorization: Bearer $ALICE_TOKEN"
```
Expected: JSON including `auth_data`, `content_data`, `geo_data` arrays (previously missing from desktop's backend, now present matching frontend expectations).

- [ ] **Step 8: Log in as admin and confirm admin routes work with the fixed seed**

```
curl -s -X POST http://127.0.0.1:8000/auth/login -H "Content-Type: application/json" -d '{"email":"admin@krypts.com","password":"<password from Step 1>"}'
```
Expected: returns an access token (confirms `settings.admin_email` from `.env` — `admin@krypts.com` — matches the seeded account, proving the admin-seed fix works).

```
curl -s http://127.0.0.1:8000/admin/users -H "Authorization: Bearer $ADMIN_TOKEN"
```
Expected: a list of all users (alice, bob, admin) with `risk_score` field present on each.

- [ ] **Step 9: Stop the server, no commit (verification only)**

---

### Task 8: Rebuild backend-server.exe and swap it into place

**Files:**
- Create: `backend/backend-server.spec` (adapted from `drm-platform/backend/backend-server.spec` — NOT a verbatim copy, see Step 1)
- Modify: `backend/app/main.py` (add a standalone `uvicorn.run()` launcher — see Step 0, a required deviation from the reference)
- Replace (binary): `backend/backend-server.exe`
- Replace (binary): `dist/win-unpacked/resources/backend-server.exe` (if the user still uses that unpacked build for testing — turned out to be gitignored, see Step 5)

**Discovered while executing this task — three real packaging bugs, not "copy verbatim" candidates:**
1. `app/main.py` (in BOTH repos) only constructs the FastAPI `app` object; it has no `if __name__ == "__main__":` block. Since the spec's entry point is `app\main.py` itself (run directly, not via `uvicorn app.main:app`), the frozen exe executes the whole module, reaches the end with nothing left to do, and exits cleanly (code 0) without ever binding a port — confirmed via a `debug=['all']` bootloader build showing `LOADER: running main.py` → `LOADER: OK.` → immediate clean shutdown, no exception anywhere. The currently-deployed exe must have been built from a locally-modified `main.py` that added this block and was never committed back to either repo's source. This plan adds it for real (Step 0).
2. The reference spec's `pathex=[]` and `hiddenimports=[]` are insufficient: `pathex=[]` means PyInstaller's static analysis can't resolve the `app` namespace package (no `app/__init__.py` in either repo) as a sibling of the entry script, producing `missing module named 'app.routers'`. Fix: `pathex=['.']`. Separately, SQLAlchemy's `aiosqlite`/`asyncpg` dialect loading and passlib's `bcrypt` backend are both resolved by runtime string-based lookup (not static imports), so PyInstaller's analysis misses them entirely — confirmed via two successive `ModuleNotFoundError` crashes (`aiosqlite`, then `passlib.handlers.bcrypt`) on the built exe. Fix: add `hiddenimports=['aiosqlite', 'asyncpg', 'passlib.handlers.bcrypt']`.
3. **This machine has Windows Smart App Control enabled** (confirmed via registry: `HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy` → `VerifiedAndReputablePolicyState = 1`). The first few attempts to launch a freshly-built exe were rejected with `"An Application Control policy has blocked this file"` while the pre-existing, already-deployed exe launched fine — initially read as a hard block on new/unrecognized binaries. **This turned out to be transient, not a persistent block**: retesting the identical (SHA256-verified) binary a short time later succeeded cleanly (booted, seeded the admin account, served `/health` with 200), both independently via the task reviewer and again by the controller. The likely explanation is a one-time Windows Defender/Smart App Control cloud-reputation check that any brand-new, previously-unseen binary goes through before being allowed — each rebuild during iterative debugging produced a byte-different "never seen" file, re-triggering the delay. No system security settings were changed. Bottom line: **Step 3's live smoke-test does work on this machine** — if it fails on a first attempt with an Application-Control-policy message, wait a short time and retry before concluding it's a hard block.

- [ ] **Step 0: Add a standalone launcher to `backend/app/main.py`**

Append to the end of the file (after the existing `/health` endpoint):
```python
# ---------------------------------------------------------------------------
# Standalone entry point (PyInstaller-packaged backend-server.exe runs this
# module directly rather than via `uvicorn app.main:app`)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
```
This only executes when the module is run directly as a script (`python app/main.py`, or PyInstaller's frozen equivalent) — it does not affect `uvicorn app.main:app` (Task 7's dev flow imports the module as `app.main`, never triggering `__main__`).

- [ ] **Step 1: Copy the PyInstaller spec from drm-platform, then patch it (do not use verbatim)**

```
cp "C:/Documents/Hackathon/drm-platform/backend/backend-server.spec" "C:/Documents/Hackathon/drm-platform-desktop/backend/backend-server.spec"
```
Then edit the copied spec's `Analysis(...)` call:
```python
a = Analysis(
    ['app\\main.py'],
    pathex=['.'],
    binaries=[],
    datas=[('.env', '.')],
    hiddenimports=['aiosqlite', 'asyncpg', 'passlib.handlers.bcrypt'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
```
(Only `pathex` and `hiddenimports` change from the reference's copy — everything else, including the `EXE(...)` block below it, stays as-is with `debug=False`.)

- [ ] **Step 2: Build the exe**

```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
./venv/Scripts/pyinstaller backend-server.spec --noconfirm
```
Expected: completes with `Building EXE from EXE-00.toc completed successfully.`, producing `backend/dist/backend-server.exe`. Check `build/backend-server/warn-backend-server.txt` for `missing module named 'app` — there should be none (only unrelated conditional-import noise like `pydantic.BaseModel` is expected and harmless).

- [ ] **Step 3: Smoke-test the built exe directly (not via Electron yet) — best-effort on this machine**

```
cd C:/Documents/Hackathon/drm-platform-desktop/backend
rm -f krypts.db
./dist/backend-server.exe
```
Expected: same `[DB] Connecting to...` / `[ADMIN ACCOUNT CREATED]` output as the `uvicorn` run in Task 3, followed by `Application startup complete.` (from uvicorn, now that Step 0's launcher runs it for real). In another terminal, repeat a couple of Task 7's curl checks (`/health`, `/groups` after signup+login) against `http://127.0.0.1:8000` to confirm the compiled binary behaves identically to the `uvicorn`-run source. Stop it after confirming (Ctrl+C or close the window).

**If a first launch attempt is rejected with `"An Application Control policy has blocked this file"`** (Smart App Control or similar): per the discovery above, this is most likely a transient reputation-check delay for a brand-new binary, not a persistent block — wait a short time and retry rather than concluding it's unfixable or attempting to change any Windows security setting. If it's still blocked after a genuine retry, then treat it as a real environment limitation: record that the build completed and passed static checks (Step 2), note the live-serving check couldn't run on this machine, and continue to Step 4 anyway — Task 9's Electron launch is the next real chance to verify it runs.

- [ ] **Step 4: Replace the exe the Electron app actually loads**

```
cp "C:/Documents/Hackathon/drm-platform-desktop/backend/dist/backend-server.exe" "C:/Documents/Hackathon/drm-platform-desktop/backend/backend-server.exe"
```
This is the path `main.js:68` uses in dev mode (`app.isPackaged` false).

If the user also tests via the already-built `dist/win-unpacked/` folder (`main.js:67`'s packaged-mode path), also update:
```
cp "C:/Documents/Hackathon/drm-platform-desktop/backend/dist/backend-server.exe" "C:/Documents/Hackathon/drm-platform-desktop/dist/win-unpacked/resources/backend-server.exe"
```

- [ ] **Step 5: Commit the launcher fix, spec file, and new exe**

```bash
git add backend/app/main.py
git commit -m "fix: add standalone uvicorn launcher to main.py for PyInstaller-packaged exe"
git add backend/backend-server.spec backend/backend-server.exe
git commit -m "build: add adapted PyInstaller spec (pathex + hiddenimports fixes) and rebuild backend-server.exe with reconciled backend source"
```
(The `dist/win-unpacked/resources/backend-server.exe` copy, if updated, is gitignored build output (`dist/` is in `.gitignore`) — confirmed via `git check-ignore`, do not force-add it.)

---

### Task 9: Full Electron app verification

**Files:** none (manual verification)

- [ ] **Step 1: Launch the Electron app**

Use the project's normal dev-launch command (per `CLAUDE.md` / `package.json` scripts) to start the Electron shell, which will spawn the just-rebuilt `backend/backend-server.exe` via `main.js`.

- [ ] **Step 2: Regression-check existing features**

Log in (or sign up), then verify each of these still works exactly as before:
- Upload a file (dashboard → Upload)
- View file list (dashboard → Content)
- Generate and validate a content access token (dashboard → Tokens)
- View a shared file through `/view/video`, `/view/pdf`, or `/view/image` (watermark should render)
- Analytics dashboard loads without errors (this now also renders auth/content/geo charts that were previously blank/broken due to missing backend fields)
- Admin panel loads and lists users (only if logging in as `admin@krypts.com`)

- [ ] **Step 3: Verify the new Groups/Inbox feature end-to-end in the UI**

- Dashboard → Groups: create a group, invite a second test user by email, confirm the group shows up with `member_count`
- Log in as the invited user: Dashboard → Inbox should show the pending invite under "Pending Group Invites"; accept it
- As the group owner: share a file to the group (via whatever UI entry point calls `api.inbox.share` — check `src/app/dashboard/content/page.tsx` or similar for the share action if not obvious)
- As the invited member: Dashboard → Inbox should show the shared file under "Shared Files"; click "Watch Securely" and confirm it opens the viewer successfully using the returned `access_token`

- [ ] **Step 4: Check backend.log for errors**

The Electron app logs backend stdout/stderr to `<userData>/backend.log` (see `main.js`'s `startBackendServer()`). After the above manual pass, check that log for unexpected tracebacks:
```
cat "$(echo $LOCALAPPDATA)/<app-name>/backend.log" | tail -100
```
(Exact path depends on the app's `productName` in `package.json` — check `app.getPath("userData")` output logged at startup if unsure.) Expected: no Python tracebacks.

- [ ] **Step 5: Final commit (if any last-mile fixes were needed during manual testing)**

If Steps 2-4 surfaced anything, fix it, then:
```bash
git add -A
git commit -m "fix: address issues found during end-to-end Electron verification of backend reconciliation"
```
Otherwise, no commit needed — this task is verification-only.
