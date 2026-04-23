from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.api_token import ApiToken
    from app.models.note import Note
    from app.models.pomodoro import PomodoroSession
    from app.models.project import Project
    from app.models.project_group import ProjectGroup
    from app.models.schedule import Schedule
    from app.models.smart_list import SmartList
    from app.models.tag import Tag
    from app.models.task import Task
    from app.models.team import Team
    from app.models.team_member import TeamMember


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    avatar_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    api_tokens: Mapped[list[ApiToken]] = relationship(
        "ApiToken", back_populates="user", cascade="all, delete-orphan"
    )
    notes: Mapped[list[Note]] = relationship(
        "Note", back_populates="user", cascade="all, delete-orphan"
    )
    pomodoro_sessions: Mapped[list[PomodoroSession]] = relationship(
        "PomodoroSession", back_populates="user", cascade="all, delete-orphan"
    )
    schedules: Mapped[list[Schedule]] = relationship(
        "Schedule", back_populates="user", cascade="all, delete-orphan"
    )
    tasks: Mapped[list[Task]] = relationship(
        "Task", back_populates="user", cascade="all, delete-orphan"
    )
    projects: Mapped[list[Project]] = relationship(
        "Project", back_populates="user", cascade="all, delete-orphan"
    )
    project_groups: Mapped[list[ProjectGroup]] = relationship(
        "ProjectGroup", back_populates="user", cascade="all, delete-orphan"
    )
    tags: Mapped[list[Tag]] = relationship(
        "Tag", back_populates="user", cascade="all, delete-orphan"
    )
    smart_lists: Mapped[list[SmartList]] = relationship(
        "SmartList", back_populates="user", cascade="all, delete-orphan"
    )
    owned_teams: Mapped[list[Team]] = relationship(
        "Team", back_populates="owner", cascade="all, delete-orphan"
    )
    team_memberships: Mapped[list[TeamMember]] = relationship(
        "TeamMember", back_populates="user", cascade="all, delete-orphan"
    )
