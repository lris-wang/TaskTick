from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.sqlite import JSON as SQLite_JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.pomodoro import PomodoroSession


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    completed: Mapped[bool] = mapped_column(Integer, default=0)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    priority: Mapped[int] = mapped_column(Integer, default=0)  # 0普通 1低 2中 3高
    project_ids: Mapped[list] = mapped_column(SQLite_JSON, default=list)  # JSON list of UUID strings
    tag_ids: Mapped[list] = mapped_column(SQLite_JSON, default=list)  # JSON list of UUID strings
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    client_mutation_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_important: Mapped[bool] = mapped_column(Integer, default=0)
    repeat_rule: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    notify_enabled: Mapped[bool] = mapped_column(Integer, default=0)
    reminder_settings: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    attachments: Mapped[list] = mapped_column(SQLite_JSON, default=list)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    sort_order: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)  # 手动排序权重
    depends_on: Mapped[list] = mapped_column(SQLite_JSON, default=list)  # JSON list of task ID strings (dependencies)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True, index=True
    )  # 指派给哪个团队成员
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="tasks")
    sessions: Mapped[list[PomodoroSession]] = relationship(back_populates="task")
