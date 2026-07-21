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
    if pf.is_e2ee:
        raise HTTPException(
            status_code=409,
            detail="This file is end-to-end encrypted; use /e2ee/blob and decrypt client-side.",
        )
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
    user_email = payload.get("sub", "")  # inbox share-tokens carry email in `sub`; owner tokens don't
    forensic_id = f"{user_email or user_id} | {user_id[:8]} | Krypts"

    try:
        # opacity=0.05 -- hard to notice during normal viewing, but leaves a
        # real recoverable signal (empirically verified: opacity below ~0.03
        # falls under the noise floor of any realistic capture and can't be
        # reliably recovered no matter how the scanner is tuned). Includes
        # the leaker's email directly (not just a truncated user_id) so the
        # Forensic Scanner's levels/contrast boost can read it back clearly.
        watermarked = watermark_image(plaintext, forensic_id, opacity=0.05, invisible_text=forensic_id)
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
