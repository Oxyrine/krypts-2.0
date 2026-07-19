"""
File management: upload (encrypt + store), list, delete.
"""
import uuid
from base64 import b64encode
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.file_key import FileKey
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
    is_e2ee: bool = Form(False),
    wrapped_dek: Optional[str] = Form(None),
    client_iv: Optional[str] = Form(None),
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

    if is_e2ee and (not wrapped_dek or not client_iv):
        raise HTTPException(
            status_code=400,
            detail="E2EE uploads require wrapped_dek and client_iv.",
        )

    file_id = uuid.uuid4()
    filename = file.filename or f"file_{file_id}"
    file_type = _detect_file_type(filename)

    storage_key = f"{current_user.user_id}/{file_id}/{filename}.enc"

    if is_e2ee:
        # File bytes were already encrypted client-side (AES-GCM) — the
        # server just stores the opaque ciphertext, it never sees the DEK.
        ciphertext = data
        encrypted_dek_str = None
        iv_b64 = client_iv
    else:
        dek = generate_dek()
        iv = generate_iv()
        ciphertext = encrypt_file_bytes(data, dek, iv)
        encrypted_dek_str = encrypt_dek(dek)
        iv_b64 = b64encode(iv).decode()

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
        is_e2ee=is_e2ee,
    )
    db.add(protected)

    if is_e2ee:
        db.add(FileKey(file_id=file_id, user_id=current_user.user_id, wrapped_dek=wrapped_dek))

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
        is_e2ee=protected.is_e2ee,
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
            is_e2ee=f.is_e2ee,
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
