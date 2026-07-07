"""
Pydantic v2 schemas for all request/response bodies.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None


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
    warning_count: int
    suspension_count: int
    rapid_session_count: int
    security_token: str
    created_at: datetime
    last_login_time: Optional[datetime] = None

    @classmethod
    def from_user(cls, user) -> "UserResponse":
        return cls(
            id=user.user_id,
            email=user.email,
            full_name=user.full_name,
            account_status=user.account_status.value,
            warning_count=user.warning_count,
            suspension_count=user.suspension_count,
            rapid_session_count=user.rapid_session_count,
            security_token=user.security_token,
            created_at=user.created_at,
            last_login_time=user.last_login_time,
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
    user_id: Optional[str] = None
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
    security_token: str
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
            security_token=user.security_token,
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
