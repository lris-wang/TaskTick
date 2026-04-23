from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NoteBase(BaseModel):
    title: str
    content: str | None = None
    is_markdown: bool = False


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    is_markdown: bool | None = None


class NoteResponse(NoteBase):
    id: UUID
    user_id: UUID
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
