from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    email: Mapped[str] = mapped_column(String(255), primary_key=True)
    code: Mapped[str] = mapped_column(String(8), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_reset: Mapped[bool] = mapped_column(default=False)

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at
