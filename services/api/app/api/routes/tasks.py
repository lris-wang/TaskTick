import json
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import cast, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.events import EVENT_TASK_CREATED, EVENT_TASK_DELETED, EVENT_TASK_UPDATED, sse_emitter
from app.models import Task, User
from app.schemas.task import BatchDeleteRequest, BatchUpdateRequest, TaskCreate, TaskResponse, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def _task_to_dict(task: Task) -> dict:
    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "completed": task.completed,
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "priority": task.priority,
        "project_ids": json.loads(task.project_ids) if isinstance(task.project_ids, str) else task.project_ids,
        "tag_ids": json.loads(task.tag_ids) if isinstance(task.tag_ids, str) else task.tag_ids,
        "deleted_at": task.deleted_at.isoformat() if task.deleted_at else None,
        "client_mutation_id": task.client_mutation_id,
        "is_important": task.is_important,
        "repeat_rule": task.repeat_rule,
        "notify_enabled": task.notify_enabled,
        "attachments": json.loads(task.attachments) if isinstance(task.attachments, str) else task.attachments,
        "parent_id": str(task.parent_id) if task.parent_id else None,
        "sort_order": task.sort_order,
        "depends_on": json.loads(task.depends_on) if isinstance(task.depends_on, str) else task.depends_on,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
    }


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[Task]:
    stmt = select(Task).where(
        Task.user_id == user.id,
        Task.deleted_at.is_(None),
    ).order_by(Task.created_at.desc())
    result = await session.execute(stmt)
    tasks = list(result.scalars().all())
    for task in tasks:
        if isinstance(task.project_ids, str):
            task.project_ids = json.loads(task.project_ids)
        if isinstance(task.tag_ids, str):
            task.tag_ids = json.loads(task.tag_ids)
        if isinstance(task.attachments, str):
            task.attachments = json.loads(task.attachments)
        if isinstance(task.depends_on, str):
            task.depends_on = json.loads(task.depends_on)
    return tasks


@router.get("/trash", response_model=list[TaskResponse])
async def list_deleted_tasks(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[Task]:
    """列出所有已删除的任务（回收站）"""
    stmt = select(Task).where(
        Task.user_id == user.id,
        Task.deleted_at.isnot(None),
    ).order_by(Task.deleted_at.desc())
    result = await session.execute(stmt)
    tasks = list(result.scalars().all())
    for task in tasks:
        if isinstance(task.project_ids, str):
            task.project_ids = json.loads(task.project_ids)
        if isinstance(task.tag_ids, str):
            task.tag_ids = json.loads(task.tag_ids)
        if isinstance(task.attachments, str):
            task.attachments = json.loads(task.attachments)
        if isinstance(task.depends_on, str):
            task.depends_on = json.loads(task.depends_on)
    return tasks


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Task:
    task = Task(
        user_id=user.id,
        title=body.title,
        description=body.description,
        completed=body.completed,
        start_at=body.start_at,
        due_at=body.due_at,
        priority=body.priority,
        project_ids=json.dumps(body.project_ids) if body.project_ids else "[]",
        tag_ids=json.dumps(body.tag_ids) if body.tag_ids else "[]",
        deleted_at=body.deleted_at,
        client_mutation_id=body.client_mutation_id,
        is_important=body.is_important,
        repeat_rule=body.repeat_rule,
        notify_enabled=body.notify_enabled,
        reminder_settings=body.reminder_settings,
        attachments=json.dumps(body.attachments) if body.attachments else "[]",
        parent_id=body.parent_id,
        sort_order=body.sort_order,
        depends_on=json.dumps(body.depends_on) if body.depends_on else "[]",
        assignee_id=body.assignee_id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    # Parse JSON for response
    if isinstance(task.project_ids, str):
        task.project_ids = json.loads(task.project_ids)
    if isinstance(task.tag_ids, str):
        task.tag_ids = json.loads(task.tag_ids)
    if isinstance(task.attachments, str):
        task.attachments = json.loads(task.attachments)
    if isinstance(task.depends_on, str):
        task.depends_on = json.loads(task.depends_on)
    # Emit SSE event
    await sse_emitter.emit(user.id, EVENT_TASK_CREATED, _task_to_dict(task))
    return task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Task:
    row = await session.get(Task, task_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    if isinstance(row.project_ids, str):
        row.project_ids = json.loads(row.project_ids)
    if isinstance(row.tag_ids, str):
        row.tag_ids = json.loads(row.tag_ids)
    if isinstance(row.attachments, str):
        row.attachments = json.loads(row.attachments)
    if isinstance(row.depends_on, str):
        row.depends_on = json.loads(row.depends_on)
    return row


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    body: TaskUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Task:
    row = await session.get(Task, task_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        if k in ("project_ids", "tag_ids", "attachments", "depends_on"):
            v = json.dumps(v) if v else "[]"
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    if isinstance(row.project_ids, str):
        row.project_ids = json.loads(row.project_ids)
    if isinstance(row.tag_ids, str):
        row.tag_ids = json.loads(row.tag_ids)
    if isinstance(row.attachments, str):
        row.attachments = json.loads(row.attachments)
    if isinstance(row.depends_on, str):
        row.depends_on = json.loads(row.depends_on)
    # Emit SSE event
    await sse_emitter.emit(user.id, EVENT_TASK_UPDATED, _task_to_dict(row))
    return row


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(Task, task_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    row.deleted_at = datetime.now(UTC)
    await session.commit()
    # Emit SSE event
    await sse_emitter.emit(user.id, EVENT_TASK_DELETED, {"id": str(task_id)})


@router.post("/{task_id}/restore", response_model=TaskResponse)
async def restore_task(
    task_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Task:
    """恢复已删除的任务（清除 deleted_at）"""
    row = await session.get(Task, task_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    if not row.deleted_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务未被删除")
    row.deleted_at = None
    row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    if isinstance(row.project_ids, str):
        row.project_ids = json.loads(row.project_ids)
    if isinstance(row.tag_ids, str):
        row.tag_ids = json.loads(row.tag_ids)
    if isinstance(row.attachments, str):
        row.attachments = json.loads(row.attachments)
    if isinstance(row.depends_on, str):
        row.depends_on = json.loads(row.depends_on)
    # Emit SSE event
    await sse_emitter.emit(user.id, EVENT_TASK_CREATED, _task_to_dict(row))
    return row


@router.delete("/{task_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanent_delete_task(
    task_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    """永久删除任务（不可恢复）"""
    row = await session.get(Task, task_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    await session.delete(row)
    await session.commit()


@router.post("/batch-delete", status_code=status.HTTP_204_NO_CONTENT)
async def batch_delete_tasks(
    body: BatchDeleteRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    """批量软删除任务"""
    stmt = select(Task).where(
        Task.id.in_(body.task_ids),
        Task.user_id == user.id,
    )
    result = await session.execute(stmt)
    tasks = list(result.scalars().all())
    now = datetime.now(UTC)
    for task in tasks:
        task.deleted_at = now
    await session.commit()
    for task in tasks:
        await sse_emitter.emit(user.id, EVENT_TASK_DELETED, {"id": str(task.id)})


@router.patch("/batch", response_model=list[TaskResponse])
async def batch_update_tasks(
    body: BatchUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[Task]:
    """批量更新任务（项目/标签/优先级/重要/完成状态）"""
    stmt = select(Task).where(
        Task.id.in_(body.task_ids),
        Task.user_id == user.id,
        Task.deleted_at.is_(None),
    )
    result = await session.execute(stmt)
    tasks = list(result.scalars().all())
    now = datetime.now(UTC)
    for task in tasks:
        if body.project_ids is not None:
            task.project_ids = json.dumps(body.project_ids)
        if body.tag_ids is not None:
            task.tag_ids = json.dumps(body.tag_ids)
        if body.priority is not None:
            task.priority = body.priority
        if body.is_important is not None:
            task.is_important = body.is_important
        if body.completed is not None:
            task.completed = body.completed
        task.updated_at = now
    await session.commit()
    updated = []
    for task in tasks:
        await sse_emitter.emit(user.id, EVENT_TASK_UPDATED, _task_to_dict(task))
        # Parse JSON for response
        if isinstance(task.project_ids, str):
            task.project_ids = json.loads(task.project_ids)
        if isinstance(task.tag_ids, str):
            task.tag_ids = json.loads(task.tag_ids)
        if isinstance(task.attachments, str):
            task.attachments = json.loads(task.attachments)
        updated.append(task)
    return updated


@router.get("/export-csv", response_class=Response)
async def export_tasks_csv(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    project_id: str | None = Query(None, description="Filter by project ID"),
    include_completed: bool = Query(False, description="Include completed tasks"),
) -> Response:
    """
    Export tasks as a CSV file.
    """
    stmt = select(Task).where(
        Task.user_id == user.id,
        Task.deleted_at.is_(None),
    )
    if not include_completed:
        stmt = stmt.where(Task.completed == 0)
    if project_id:
        # Filter tasks that belong to the given project
        # project_ids is a JSON list stored as string
        from sqlalchemy import or_
        stmt = stmt.where(Task.project_ids.cast(String).like(f'%"{project_id}"%'))

    result = await session.execute(stmt)
    tasks = result.scalars().all()

    import csv
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["标题", "描述", "截止日期", "开始日期", "优先级", "完成状态", "所属分类ID", "标签ID", "创建时间", "更新时间"])

    priority_map = {0: "普通", 1: "低", 2: "中", 3: "高"}

    for t in tasks:
        pids = json.loads(t.project_ids) if isinstance(t.project_ids, str) else (t.project_ids or [])
        tids = json.loads(t.tag_ids) if isinstance(t.tag_ids, str) else (t.tag_ids or [])
        writer.writerow([
            t.title,
            t.description or "",
            t.due_at.isoformat() if t.due_at else "",
            t.start_at.isoformat() if t.start_at else "",
            priority_map.get(int(t.priority), "普通") if t.priority else "普通",
            "已完成" if t.completed else "未完成",
            "|".join(pids),
            "|".join(tids),
            t.created_at.isoformat() if t.created_at else "",
            t.updated_at.isoformat() if t.updated_at else "",
        ])

    csv_content = output.getvalue()
    filename = f"tasktick-export-{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
        },
    )
