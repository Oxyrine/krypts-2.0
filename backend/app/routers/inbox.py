import uuid
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.middleware.auth import get_current_user, create_content_access_token
from app.models.user import User
from app.models.protected_file import ProtectedFile
from app.models.file_share import FileShare
from app.models.file_key import FileKey
from app.models.groups import Group, GroupMember

router = APIRouter()


class ShareFileReq(BaseModel):
    file_id: uuid.UUID
    target_email: Optional[str] = None
    target_group_id: Optional[uuid.UUID] = None
    wrapped_dek: Optional[str] = None  # required when sharing an E2EE file


class InboxItem(BaseModel):
    share_id: uuid.UUID
    file_id: uuid.UUID
    filename: str
    content_type: str
    shared_by_name: str
    shared_by_email: str
    shared_at: datetime
    access_token: str
    is_e2ee: bool = False


def generate_short_lived_token(file_id: uuid.UUID, user_email: str, user_id: uuid.UUID) -> str:
    claims = {
        "sub": user_email,
        "file_id": str(file_id),
        "user_id": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),  # 24-hour token
        "permissions": {"stream": True, "download": False}
    }
    return create_content_access_token(claims)


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

    if file.is_e2ee:
        if req.target_group_id:
            raise HTTPException(status_code=400, detail="E2EE files can't be group-shared yet.")
        if not req.wrapped_dek:
            raise HTTPException(status_code=400, detail="E2EE files require wrapped_dek when sharing.")

    if req.target_group_id:
        g_stmt = select(Group).where(Group.group_id == req.target_group_id)
        g_result = await db.execute(g_stmt)
        group = g_result.scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        m_stmt = select(GroupMember).where(
            GroupMember.group_id == req.target_group_id,
            GroupMember.user_id == current_user.user_id,
        )
        m_result = await db.execute(m_stmt)
        is_member = m_result.scalar_one_or_none() is not None

        if group.owner_id != current_user.user_id and not is_member:
            raise HTTPException(status_code=403, detail="Not authorized to share to this group")

    # Create share record
    share = FileShare(
        file_id=req.file_id,
        shared_by_id=current_user.user_id,
        target_user_id=target_user_id,
        target_group_id=req.target_group_id
    )
    db.add(share)

    if file.is_e2ee:
        # Recipient's own copy of the DEK, wrapped with their public key —
        # the server just relays it, it never sees the DEK itself.
        existing = await db.execute(
            select(FileKey).where(FileKey.file_id == req.file_id, FileKey.user_id == target_user_id)
        )
        if not existing.scalar_one_or_none():
            db.add(FileKey(file_id=req.file_id, user_id=target_user_id, wrapped_dek=req.wrapped_dek))

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

        token = generate_short_lived_token(file.file_id, current_user.email, current_user.user_id)

        response_items.append({
            "share_id": share.share_id,
            "file_id": file.file_id,
            "filename": file.filename,
            "content_type": file.content_type,
            "shared_by_name": sharer.full_name or sharer.email,
            "shared_by_email": sharer.email,
            "shared_at": share.created_at,
            "access_token": token,
            "is_e2ee": file.is_e2ee,
        })

    # Sort descending by shared_at
    response_items.sort(key=lambda x: x["shared_at"], reverse=True)
    return response_items
