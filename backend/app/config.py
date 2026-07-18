from pydantic_settings import BaseSettings
from functools import lru_cache


import os
import sys

def get_env_path():
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, '.env')
    return '.env'

class Settings(BaseSettings):
    # Database (defaults to SQLite for zero-dependency local dev)
    database_url: str = "sqlite+aiosqlite:///./krypts.db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT — NO DEFAULT. Must be set in environment or .env.
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # Separate secret for content access tokens (DRM tokens)
    # Falls back to jwt_secret_key if not set (migration path).
    content_token_secret: str = ""

    # S3-compatible storage
    s3_endpoint_url: str = "https://s3.amazonaws.com"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket_name: str = "krypts-protected-content"

    # Encryption — NO DEFAULT. Must be set in environment or .env.
    master_kek: str

    # Admin
    admin_email: str = "admin@example.com"

    # Security thresholds
    rapid_session_threshold_seconds: int = 120   # < 2 min = suspicious
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60

    # Max content token lifetime (days)
    max_content_token_days: int = 90

    # Max file upload size (bytes) — 500 MB
    max_upload_size_bytes: int = 500 * 1024 * 1024

    class Config:
        env_file = get_env_path()
        env_file_encoding = "utf-8"

    def get_content_token_secret(self) -> str:
        """Return the content token secret, falling back to jwt_secret_key."""
        return self.content_token_secret or self.jwt_secret_key

@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
