from __future__ import annotations

import uuid

from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LocationReminder(Base):
    __tablename__ = "location_reminders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    location_name: Mapped[str] = mapped_column(String(200), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    radius: Mapped[int] = mapped_column(Integer, default=100)  # meters
    reminder_type: Mapped[str] = mapped_column(String(20), default="arrival")  # "arrival" or "departure"
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
