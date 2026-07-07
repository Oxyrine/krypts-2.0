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

LOCAL_VAULT = Path(__file__).parent.parent.parent / "local_vault"


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
