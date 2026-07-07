import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, DateTime, func, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AlertType(str, enum.Enum):
    rapid_session = "rapid_session"
    failed_logins = "failed_logins"
    suspended = "suspended"
    banned = "banned"
    manual = "manual"


class AlertStatus(str, enum.Enum):
    unread = "unread"
    read = "read"


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    alert_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    alert_type: Mapped[AlertType] = mapped_column(Enum(AlertType), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus), default=AlertStatus.unread, nullable=False
    )

    # Extra context fields stored directly for quick admin access
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="security_alerts")

    def __repr__(self) -> str:
        return f"<SecurityAlert type={self.alert_type} user={self.user_id} status={self.status}>"
