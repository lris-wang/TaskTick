from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.team import Team
    from app.models.user import User
    from app.models.project_group import ProjectGroup


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    built_in: Mapped[bool] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Integer, default=0)
    muted: Mapped[bool] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="projects")
    team: Mapped[Team | None] = relationship("Team", back_populates="projects")
    group: Mapped[ProjectGroup | None] = relationship("ProjectGroup", back_populates="projects")
