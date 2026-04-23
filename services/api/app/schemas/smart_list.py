from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SmartListFilter(BaseModel):
    builtin_view: Literal["today", "planned", "engaged", "next", "all", "completed", "inbox"] | None = None
    project_ids: list[str] | None = None
    tag_ids: list[str] | None = None
    priority_min: int | None = None
    priority_max: int | None = None
    is_important: bool | None = None
    due_from: str | None = None
    due_to: str | None = None
    search_text: str | None = None


class SmartListBase(BaseModel):
    name: str
    color: str | None = None
    filter: SmartListFilter | None = None


class SmartListCreate(SmartListBase):
    pass


class SmartListUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    filter: SmartListFilter | None = None


class SmartListResponse(SmartListBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
