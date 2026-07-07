"""
File management: upload (encrypt + store), list, delete.
"""
import uuid
from base64 import b64encode
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")

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
    except Exception:
        pass  # Best-effort storage deletion

    await db.delete(pf)
    await db.commit()

    return FileDeleteResponse(message="File deleted successfully.", file_id=file_id)
