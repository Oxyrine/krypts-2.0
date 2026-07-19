import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, Text, func, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FileKey(Base):
    """Per-recipient wrapped DEK for an end-to-end encrypted file.

    Each row is the file's DEK, RSA-OAEP-wrapped with one user's public key.
    The server can store and relay these but never unwrap them — only the
    holder of the matching private key can recover the DEK.
    """

    __tablename__ = "file_keys"
    __table_args__ = (UniqueConstraint("file_id", "user_id", name="uq_file_keys_file_user"),)

    key_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("protected_files.file_id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    wrapped_dek: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<FileKey file={self.file_id} user={self.user_id}>"
