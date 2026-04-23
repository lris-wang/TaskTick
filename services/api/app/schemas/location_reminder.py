from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class LocationReminderBase(BaseModel):
    task_id: UUID
    location_name: str
    latitude: float
    longitude: float
    radius: int = 100
    reminder_type: str = "arrival"  # "arrival" or "departure"
    enabled: bool = True


class LocationReminderCreate(LocationReminderBase):
    pass


class LocationReminderUpdate(BaseModel):
    location_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    radius: int | None = None
    reminder_type: str | None = None
    enabled: bool | None = None


class LocationReminderResponse(LocationReminderBase):
    id: UUID
    user_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
