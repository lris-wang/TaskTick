from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ScheduleBase(BaseModel):
    title: str = Field(..., max_length=500)
    description: str | None = None
    start_at: datetime
    end_at: datetime | None = None
    timezone: str = Field(default="UTC", max_length=64)
    location: str | None = Field(default=None, max_length=500)


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    timezone: str | None = Field(default=None, max_length=64)
    location: str | None = Field(default=None, max_length=500)


class ScheduleRead(ScheduleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
