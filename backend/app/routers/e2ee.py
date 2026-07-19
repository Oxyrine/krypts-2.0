"""
End-to-end encryption support: public key lookup, per-recipient wrapped DEK
retrieval, and raw ciphertext delivery for client-side decryption.

The server never has access to plaintext or DEKs for E2EE files — this
router only relays opaque, already-encrypted material.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.file_key import FileKey
from app.models.protected_file import ProtectedFile
from app.models.user import User
from app.routers.content import _get_file_record, _validate_content_token
from app.schemas import PublicKeyResponse
from app.utils.storage import download_encrypted_file

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /e2ee/pubkey?email=
# ---------------------------------------------------------------------------

@router.get("/pubkey", response_model=PublicKeyResponse)
async def get_public_key(
    email: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.public_key:
        raise HTTPException(status_code=404, detail="This user has not set up end-to-end encryption yet.")

    return PublicKeyResponse(email=user.email, public_key=user.public_key)


# ---------------------------------------------------------------------------
# GET /e2ee/filekey/{file_id}
# ---------------------------------------------------------------------------

@router.get("/filekey/{file_id}")
async def get_file_key(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FileKey).where(FileKey.file_id == file_id, FileKey.user_id == current_user.user_id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=403, detail="No key available for this file.")

    pf_result = await db.execute(select(ProtectedFile).where(ProtectedFile.file_id == file_id))
    pf = pf_result.scalar_one_or_none()

    return {
        "file_id": str(file_id),
        "wrapped_dek": key.wrapped_dek,
        # The client-side AES-GCM IV used at upload time — stored in the
        # existing `iv` column (repurposed for E2EE files).
        "client_iv": pf.iv if pf else None,
    }


# ---------------------------------------------------------------------------
# GET /e2ee/blob/{file_id}
# ---------------------------------------------------------------------------

@router.get("/blob/{file_id}")
async def get_blob(file_id: str, token: str, request: Request):
    client_ip = request.client.host if request.client else ""
    _validate_content_token(token, file_id, client_ip)

    pf = await _get_file_record(file_id)
    if not pf.is_e2ee:
        raise HTTPException(status_code=400, detail="This file is not end-to-end encrypted.")

    ciphertext = download_encrypted_file(pf.s3_key)

    return Response(
        content=ciphertext,
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        },
    )
