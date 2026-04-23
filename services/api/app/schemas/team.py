from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TeamBase(BaseModel):
    name: str


class TeamCreate(TeamBase):
    pass


class TeamUpdate(BaseModel):
    name: str | None = None


class TeamResponse(TeamBase):
    id: UUID
    owner_user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
