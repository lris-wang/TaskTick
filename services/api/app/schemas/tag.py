from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TagBase(BaseModel):
    name: str
    color: str | None = None
    team_id: UUID | None = None


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    team_id: UUID | None = None


class TagResponse(TagBase):
    id: UUID
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
