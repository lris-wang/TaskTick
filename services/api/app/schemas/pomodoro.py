from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PomodoroSessionBase(BaseModel):
    task_id: UUID | None = None
    started_at: datetime
    ended_at: datetime | None = None
    duration_minutes: int = 25
    completed: bool = False


class PomodoroSessionCreate(BaseModel):
    task_id: UUID | None = None
    started_at: datetime
    duration_minutes: int = 25


class PomodoroSessionUpdate(BaseModel):
    ended_at: datetime | None = None
    duration_minutes: int | None = None
    completed: bool | None = None


class PomodoroSessionResponse(PomodoroSessionBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PomodoroStatsResponse(BaseModel):
    total_sessions: int
    total_minutes: int
    today_sessions: int
    today_minutes: int
    week_sessions: int
    week_minutes: int
