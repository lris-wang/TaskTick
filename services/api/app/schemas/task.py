from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TaskBase(BaseModel):
    title: str
    description: str | None = None
    completed: bool = False
    start_at: datetime | None = None
    due_at: datetime | None = None
    priority: int = 0
    project_ids: list[str] = []
    tag_ids: list[str] = []
    deleted_at: datetime | None = None
    client_mutation_id: str | None = None
    is_important: bool = False
    repeat_rule: str | None = None
    notify_enabled: bool = False
    reminder_settings: dict | None = None  # {"presets": [5, 15], "customTimes": ["2026-04-22T10:00"]}
    attachments: list[dict] = []
    parent_id: UUID | None = None
    sort_order: float | None = None
    depends_on: list[str] = []
    assignee_id: UUID | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    completed: bool | None = None
    start_at: datetime | None = None
    due_at: datetime | None = None
    priority: int | None = None
    project_ids: list[str] | None = None
    tag_ids: list[str] | None = None
    deleted_at: datetime | None = None
    client_mutation_id: str | None = None
    is_important: bool | None = None
    repeat_rule: str | None = None
    notify_enabled: bool | None = None
    reminder_settings: dict | None = None
    attachments: list[dict] | None = None
    parent_id: UUID | None = None
    sort_order: float | None = None
    depends_on: list[str] | None = None
    assignee_id: UUID | None = None


class BatchDeleteRequest(BaseModel):
    task_ids: list[UUID]


class BatchUpdateRequest(BaseModel):
    task_ids: list[UUID]
    project_ids: list[str] | None = None
    tag_ids: list[str] | None = None
    priority: int | None = None
    is_important: bool | None = None
    completed: bool | None = None


class TaskResponse(TaskBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
