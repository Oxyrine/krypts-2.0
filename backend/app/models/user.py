import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, Integer, DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AccountStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"
    banned = "banned"


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    security_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    account_status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus), default=AccountStatus.active, nullable=False
    )
    warning_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    suspension_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rapid_session_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_login_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    activity_logs: Mapped[list["UserActivityLog"]] = relationship(
        "UserActivityLog", back_populates="user", cascade="all, delete-orphan"
    )
    security_alerts: Mapped[list["SecurityAlert"]] = relationship(
        "SecurityAlert", back_populates="user", cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(
        "ApiKey", back_populates="user", cascade="all, delete-orphan"
    )
    protected_files: Mapped[list["ProtectedFile"]] = relationship(
        "ProtectedFile", back_populates="owner", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} [{self.account_status}]>"
