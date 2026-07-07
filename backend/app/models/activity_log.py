import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, Float, DateTime, func, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EventType(str, enum.Enum):
    login = "login"
    logout = "logout"
    failure = "failure"
    expired = "expired"


class UserActivityLog(Base):
    __tablename__ = "user_activity_logs"

    log_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)   # IPv4/IPv6
    device_info: Mapped[str | None] = mapped_column(Text, nullable=True)         # User-Agent string
    login_duration: Mapped[float | None] = mapped_column(Float, nullable=True)   # seconds

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="activity_logs")

    def __repr__(self) -> str:
        return f"<ActivityLog user={self.user_id} event={self.event_type} at={self.timestamp}>"
