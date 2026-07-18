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
