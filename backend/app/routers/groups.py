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
