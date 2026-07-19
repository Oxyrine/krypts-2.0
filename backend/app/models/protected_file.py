import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, DateTime, func, BigInteger, Boolean, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProtectedFile(Base):
    __tablename__ = "protected_files"

    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )

    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    # S3 object key for the encrypted file
    s3_key: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    # Encrypted DEK (base64 AES-256-CBC wrapped with master KEK)
    encryption_key_ref: Mapped[str] = mapped_column(String(1024), nullable=True)
    # AES-CBC initialization vector (base64)
    iv: Mapped[str] = mapped_column(String(64), nullable=True)

    # DRM flags
    allow_download: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stream_only: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    watermark_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # End-to-end encrypted: file bytes were encrypted client-side before
    # upload. The server never holds a usable DEK for these — encryption_key_ref
    # is unused (NULL) and `iv` instead holds the client's AES-GCM IV.
    is_e2ee: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Relationship
    owner: Mapped["User"] = relationship("User", back_populates="protected_files")

    def __repr__(self) -> str:
        return f"<ProtectedFile {self.filename} owner={self.owner_id}>"
