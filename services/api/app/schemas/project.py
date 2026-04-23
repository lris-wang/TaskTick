from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ProjectBase(BaseModel):
    name: str
    color: str | None = None
    team_id: UUID | None = None
    group_id: UUID | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    team_id: UUID | None = None
    group_id: UUID | None = None
    archived: bool | None = None
    muted: bool | None = None


class ProjectResponse(ProjectBase):
    id: UUID
    deleted_at: datetime | None = None
    built_in: bool = False
    archived: bool = False
    muted: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectGroupBase(BaseModel):
    name: str
    color: str | None = None
    order: int = 0


class ProjectGroupCreate(ProjectGroupBase):
    pass


class ProjectGroupUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    order: int | None = None


class ProjectGroupResponse(ProjectGroupBase):
    id: UUID
    user_id: UUID
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
