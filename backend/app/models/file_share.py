import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FileShare(Base):
    __tablename__ = "file_shares"

    share_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("protected_files.file_id", ondelete="CASCADE"), nullable=False, index=True
    )
    shared_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Can share to a user OR a group
    target_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=True, index=True
    )
    target_group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("groups.group_id", ondelete="CASCADE"), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<FileShare file={self.file_id} by={self.shared_by_id}>"
