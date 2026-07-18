from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import logging

from app.config import settings

logger = logging.getLogger(__name__)

# SQLite doesn't support connection pooling options; detect and configure accordingly
_is_sqlite = settings.database_url.startswith("sqlite")

# Log which DB we are connecting to (masks password for security)
_db_display = settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url
print(f"[DB] Connecting to: {'SQLite' if _is_sqlite else 'PostgreSQL'} — {_db_display}", flush=True)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    **({} if _is_sqlite else {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}),
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables on startup (dev convenience; use Alembic in production)."""
    import app.models.user  # noqa: F401
    import app.models.activity_log  # noqa: F401
    import app.models.security_alert  # noqa: F401
    import app.models.protected_file  # noqa: F401
    import app.models.api_key  # noqa: F401
    import app.models.groups  # noqa: F401
    import app.models.file_share  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add newly added columns to existing users table if they don't exist
    from sqlalchemy import text
    for col, col_def in [
        ("warning_count", "INTEGER DEFAULT 0"),
        ("suspension_count", "INTEGER DEFAULT 0"),
        ("rapid_session_count", "INTEGER DEFAULT 0"),
        ("risk_score", "INTEGER DEFAULT 0"),
        ("account_status", "VARCHAR DEFAULT 'active'")
    ]:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_def}"))
        except Exception as e:
            # Column likely already exists
            pass

    # Seed admin account
    import uuid
    import secrets
    from sqlalchemy import select
    from app.models.user import User
    from app.middleware.auth import hash_password

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == settings.admin_email))
        admin = result.scalar_one_or_none()
        if not admin:
            # Generate a secure random password and print it once to console.
            # The operator must save this password; it will NOT be shown again.
            admin_password = secrets.token_urlsafe(16)
            print("\n" + "="*60, flush=True)
            print("[ADMIN ACCOUNT CREATED]", flush=True)
            print(f"  Email:    {settings.admin_email}", flush=True)
            print(f"  Password: {admin_password}", flush=True)
            print("  SAVE THIS PASSWORD — it will NOT be shown again.", flush=True)
            print("="*60 + "\n", flush=True)

            admin_user = User(
                user_id=uuid.uuid4(),
                email=settings.admin_email,
                full_name="System Admin",
                password_hash=hash_password(admin_password),
                security_token=secrets.token_hex(32),
            )
            session.add(admin_user)
            await session.commit()
