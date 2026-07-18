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
