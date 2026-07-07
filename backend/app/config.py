from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database (defaults to SQLite for zero-dependency local dev)
    database_url: str = "sqlite+aiosqlite:///./krypts.db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret_key: str = "change-this-secret-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # S3-compatible storage
    s3_endpoint_url: str = "https://s3.amazonaws.com"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket_name: str = "krypts-protected-content"

    # Encryption
    master_kek: str = "change-this-32-byte-kek-in-prod!!"

    # Admin
    admin_email: str = "admin@example.com"

    # Security thresholds
    rapid_session_threshold_seconds: int = 120   # < 2 min = suspicious
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
