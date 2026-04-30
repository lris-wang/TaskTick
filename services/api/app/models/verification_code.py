from datetime import datetime, timezone

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
        if self.expires_at is None:
            return True
        # Compare as naive UTC datetimes
        now_utc = datetime.utcnow()
        exp_utc = self.expires_at.replace(tzinfo=None) if self.expires_at.tzinfo else self.expires_at
        return now_utc > exp_utc
