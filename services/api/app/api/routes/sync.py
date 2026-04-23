import json
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import Note, Project, ProjectGroup, Schedule, Tag, Task, TeamMember, User
from app.schemas.task import TaskResponse
from app.schemas.project import ProjectResponse, ProjectGroupResponse
from app.schemas.tag import TagResponse
from app.utils.ical import (
    generate_ical_footer,
    generate_ical_header,
    schedule_to_vevent,
    task_to_vevent,
)
from app.schemas.note import NoteResponse

router = APIRouter(prefix="/sync", tags=["Sync"])


def parse_json_field(val):
    if val is None:
        return []
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


def parse_dt(val):
    """Parse ISO datetime string to Python datetime, or return None."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/pull", response_model=dict)
async def sync_pull(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    since: str | None = Query(default=None),
) -> dict:
    """
    返回该用户所有未删除的 tasks / projects / tags。
    包括用户的个人资源以及所在团队的资源。
    可传入 since（ISO 时间戳）只拉取该时间之后更新的数据。
    """
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            pass

    # Get user's team IDs
    team_result = await session.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == user.id)
    )
    team_ids = list(team_result.scalars().all())

    # Build team filter condition
    team_filter = Project.team_id.in_(team_ids) if team_ids else False
    tag_team_filter = Tag.team_id.in_(team_ids) if team_ids else False

    # Tasks (only tasks belonging to user's projects)
    # First get all project IDs user can access
    proj_ids_result = await session.execute(
        select(Project.id).where(
            Project.deleted_at.is_(None),
            (Project.user_id == user.id) | (Project.team_id.in_(team_ids) if team_ids else False),
        )
    )
    accessible_project_ids = list(proj_ids_result.scalars().all())

    task_stmt = select(Task).where(
        Task.deleted_at.is_(None),
        Task.user_id == user.id,
    )
    if since_dt:
        task_stmt = task_stmt.where(Task.updated_at > since_dt)
    task_stmt = task_stmt.order_by(Task.updated_at.asc())
    task_result = await session.execute(task_stmt)
    tasks = []
    for t in task_result.scalars().all():
        tasks.append(TaskResponse(
            id=t.id,
            title=t.title,
            description=t.description,
            completed=t.completed,
            due_at=t.due_at,
            start_at=t.start_at,
            priority=t.priority,
            project_ids=parse_json_field(t.project_ids),
            tag_ids=parse_json_field(t.tag_ids),
            deleted_at=t.deleted_at,
            client_mutation_id=t.client_mutation_id,
            is_important=t.is_important,
            repeat_rule=t.repeat_rule,
            notify_enabled=t.notify_enabled,
            attachments=parse_json_field(t.attachments),
            parent_id=t.parent_id,
            sort_order=t.sort_order,
            depends_on=parse_json_field(t.depends_on),
            assignee_id=t.assignee_id,
            created_at=t.created_at,
            updated_at=t.updated_at,
        ).model_dump(mode="json"))

    # Projects (personal + team)
    proj_stmt = select(Project).where(
        Project.deleted_at.is_(None),
        (Project.user_id == user.id) | team_filter,
    )
    if since_dt:
        proj_stmt = proj_stmt.where(Project.updated_at > since_dt)
    proj_stmt = proj_stmt.order_by(Project.updated_at.asc())
    proj_result = await session.execute(proj_stmt)
    projects = [
        ProjectResponse.model_validate(p).model_dump(mode="json")
        for p in proj_result.scalars().all()
    ]

    # Tags (personal + team)
    tag_stmt = select(Tag).where(
        Tag.deleted_at.is_(None),
        (Tag.user_id == user.id) | tag_team_filter,
    )
    if since_dt:
        tag_stmt = tag_stmt.where(Tag.updated_at > since_dt)
    tag_stmt = tag_stmt.order_by(Tag.updated_at.asc())
    tag_result = await session.execute(tag_stmt)
    tags = [
        TagResponse.model_validate(t).model_dump(mode="json")
        for t in tag_result.scalars().all()
    ]

    # Notes
    note_stmt = select(Note).where(
        Note.user_id == user.id,
        Note.deleted_at.is_(None),
    )
    if since_dt:
        note_stmt = note_stmt.where(Note.updated_at > since_dt)
    note_stmt = note_stmt.order_by(Note.updated_at.asc())
    note_result = await session.execute(note_stmt)
    notes = [
        NoteResponse.model_validate(n).model_dump(mode="json")
        for n in note_result.scalars().all()
    ]

    # Project Groups
    group_stmt = select(ProjectGroup).where(
        ProjectGroup.user_id == user.id,
        ProjectGroup.deleted_at.is_(None),
    )
    if since_dt:
        group_stmt = group_stmt.where(ProjectGroup.updated_at > since_dt)
    group_stmt = group_stmt.order_by(ProjectGroup.order.asc())
    group_result = await session.execute(group_stmt)
    project_groups = [
        ProjectGroupResponse.model_validate(g).model_dump(mode="json")
        for g in group_result.scalars().all()
    ]

    # next_cursor = last updated_at among results, or None
    next_cursor = None
    all_items: list = tasks + projects + tags + notes + project_groups
    if all_items:
        last_updated = max(item["updated_at"] for item in all_items)
        next_cursor = last_updated

    return {
        "nextCursor": next_cursor,
        "tasks": tasks,
        "projects": projects,
        "tags": tags,
        "notes": notes,
        "projectGroups": project_groups,
    }


@router.post("/push", response_model=dict)
async def sync_push(
    body: dict,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    接收一批 mutations，按顺序应用（upsert 或 soft-delete）。
    返回每个 mutation 的结果。
    """
    device_id: str = body.get("deviceId", "")
    mutations: list = body.get("mutations", [])

    results: list[dict] = []

    for m in mutations:
        entity_type = m.get("entityType")
        entity_id = m.get("entityId")
        op = m.get("op")
        payload = m.get("payload") or {}

        try:
            if entity_type == "task":
                result = await _apply_task_mutation(session, user.id, entity_id, op, payload)
            elif entity_type == "project":
                result = await _apply_project_mutation(session, user.id, entity_id, op, payload)
            elif entity_type == "tag":
                result = await _apply_tag_mutation(session, user.id, entity_id, op, payload)
            elif entity_type == "note":
                result = await _apply_note_mutation(session, user.id, entity_id, op, payload)
            elif entity_type == "project_group":
                result = await _apply_project_group_mutation(session, user.id, entity_id, op, payload)
            else:
                result = {"status": "error", "message": f"unknown entityType: {entity_type}"}
        except Exception as e:
            result = {"status": "error", "message": str(e)}

        results.append({
            "entityType": entity_type,
            "entityId": entity_id,
            "clientMutationId": m.get("clientMutationId"),
            "status": result.get("status", "ok"),
            "serverId": result.get("serverId", entity_id),
        })

    await session.commit()

    return {"deviceId": device_id, "results": results}


async def _check_team_access(team_id: UUID, user_id: UUID, session: AsyncSession, require_role: str | None = None) -> bool:
    """Check if user is a member of the team with optional role requirement."""
    result = await session.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        return False
    if require_role and member.role not in require_role.split(","):
        return False
    return True


async def _apply_task_mutation(
    session: AsyncSession, user_id: UUID, entity_id: str, op: str, payload: dict
) -> dict:
    """Apply a single task mutation (upsert or delete)."""
    if op == "delete":
        row = await session.get(Task, UUID(entity_id))
        if row and row.user_id == user_id:
            row.deleted_at = datetime.now(UTC)
            row.updated_at = datetime.now(UTC)
        return {"status": "ok", "serverId": entity_id}

    # upsert
    row = await session.get(Task, UUID(entity_id)) if entity_id else None
    now = datetime.now(UTC)

    if row is None:
        # create new
        row = Task(
            id=UUID(entity_id) if entity_id else UUID(),
            user_id=user_id,
            title=payload.get("title", ""),
            description=payload.get("description"),
            completed=payload.get("completed", False),
            due_at=parse_dt(payload.get("due_at")),
            start_at=parse_dt(payload.get("start_at")),
            priority=payload.get("priority", 0),
            project_ids=json.dumps(payload.get("project_ids", [])) if payload.get("project_ids") else "[]",
            tag_ids=json.dumps(payload.get("tag_ids", [])) if payload.get("tag_ids") else "[]",
            deleted_at=parse_dt(payload.get("deleted_at")),
            client_mutation_id=payload.get("client_mutation_id"),
            is_important=payload.get("is_important", False),
            repeat_rule=payload.get("repeat_rule"),
            notify_enabled=payload.get("notify_enabled", False),
            attachments=json.dumps(payload.get("attachments", [])) if payload.get("attachments") else "[]",
            parent_id=UUID(payload["parent_id"]) if payload.get("parent_id") else None,
            sort_order=payload.get("sort_order"),
            depends_on=json.dumps(payload.get("depends_on", [])) if payload.get("depends_on") else "[]",
            assignee_id=UUID(payload["assignee_id"]) if payload.get("assignee_id") else None,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
    else:
        # update existing
        if row.user_id != user_id:
            return {"status": "error", "message": "forbidden"}
        for k, v in payload.items():
            if k in ("project_ids", "tag_ids", "attachments", "depends_on"):
                v = json.dumps(v) if v else "[]"
            elif k in ("due_at", "deleted_at", "start_at"):
                v = parse_dt(v)
            elif k == "assignee_id":
                v = UUID(v) if v else None
            setattr(row, k, v)
        row.updated_at = now

    return {"status": "ok", "serverId": str(row.id)}


async def _apply_project_mutation(
    session: AsyncSession, user_id: UUID, entity_id: str, op: str, payload: dict
) -> dict:
    if op == "delete":
        row = await session.get(Project, UUID(entity_id))
        if row:
            # Check access: owner or team member
            if row.user_id == user_id:
                pass
            elif row.team_id and await _check_team_access(row.team_id, user_id, session):
                pass
            else:
                return {"status": "error", "message": "forbidden"}
            row.deleted_at = datetime.now(UTC)
            row.updated_at = datetime.now(UTC)
        return {"status": "ok", "serverId": entity_id}

    row = await session.get(Project, UUID(entity_id)) if entity_id else None
    now = datetime.now(UTC)

    # Check if creating with team_id
    new_team_id = payload.get("team_id")
    if new_team_id and isinstance(new_team_id, str):
        new_team_id = UUID(new_team_id)

    if row is None:
        # Creating new - check team access if team_id provided
        if new_team_id:
            if not await _check_team_access(new_team_id, user_id, session, "owner,admin,member"):
                return {"status": "error", "message": "forbidden"}
        new_group_id = payload.get("group_id")
        if new_group_id and isinstance(new_group_id, str):
            new_group_id = UUID(new_group_id)
        row = Project(
            id=UUID(entity_id) if entity_id else UUID(),
            user_id=user_id,
            name=payload.get("name", ""),
            color=payload.get("color"),
            team_id=new_team_id,
            group_id=new_group_id,
            archived=payload.get("archived", False),
            muted=payload.get("muted", False),
            created_at=now,
            updated_at=now,
        )
        session.add(row)
    else:
        # Check access: owner or team member
        if row.user_id == user_id:
            pass
        elif row.team_id and await _check_team_access(row.team_id, user_id, session):
            pass
        else:
            return {"status": "error", "message": "forbidden"}
        # If changing team_id, check access
        if new_team_id and new_team_id != row.team_id:
            if not await _check_team_access(new_team_id, user_id, session, "owner,admin,member"):
                return {"status": "error", "message": "forbidden"}
        for k, v in payload.items():
            if k == "team_id" and v is not None:
                v = UUID(v) if isinstance(v, str) else v
            elif k == "group_id" and v is not None:
                v = UUID(v) if isinstance(v, str) else v
            setattr(row, k, v)
        row.updated_at = now

    return {"status": "ok", "serverId": str(row.id)}


async def _apply_project_group_mutation(
    session: AsyncSession, user_id: UUID, entity_id: str, op: str, payload: dict
) -> dict:
    if op == "delete":
        row = await session.get(ProjectGroup, UUID(entity_id))
        if row and row.user_id == user_id:
            row.deleted_at = datetime.now(UTC)
            row.updated_at = datetime.now(UTC)
        return {"status": "ok", "serverId": entity_id}

    row = await session.get(ProjectGroup, UUID(entity_id)) if entity_id else None
    now = datetime.now(UTC)

    if row is None:
        row = ProjectGroup(
            id=UUID(entity_id) if entity_id else UUID(),
            user_id=user_id,
            name=payload.get("name", ""),
            color=payload.get("color"),
            order=payload.get("order", 0),
            created_at=now,
            updated_at=now,
        )
        session.add(row)
    else:
        if row.user_id != user_id:
            return {"status": "error", "message": "forbidden"}
        for k, v in payload.items():
            setattr(row, k, v)
        row.updated_at = now

    return {"status": "ok", "serverId": str(row.id)}


async def _apply_tag_mutation(
    session: AsyncSession, user_id: UUID, entity_id: str, op: str, payload: dict
) -> dict:
    if op == "delete":
        row = await session.get(Tag, UUID(entity_id))
        if row:
            # Check access: owner or team member
            if row.user_id == user_id:
                pass
            elif row.team_id and await _check_team_access(row.team_id, user_id, session):
                pass
            else:
                return {"status": "error", "message": "forbidden"}
            row.deleted_at = datetime.now(UTC)
            row.updated_at = datetime.now(UTC)
        return {"status": "ok", "serverId": entity_id}

    row = await session.get(Tag, UUID(entity_id)) if entity_id else None
    now = datetime.now(UTC)

    # Check if creating with team_id
    new_team_id = payload.get("team_id")
    if new_team_id and isinstance(new_team_id, str):
        new_team_id = UUID(new_team_id)

    if row is None:
        # Creating new - check team access if team_id provided
        if new_team_id:
            if not await _check_team_access(new_team_id, user_id, session, "owner,admin,member"):
                return {"status": "error", "message": "forbidden"}
        row = Tag(
            id=UUID(entity_id) if entity_id else UUID(),
            user_id=user_id,
            name=payload.get("name", ""),
            color=payload.get("color"),
            team_id=new_team_id,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
    else:
        # Check access: owner or team member
        if row.user_id == user_id:
            pass
        elif row.team_id and await _check_team_access(row.team_id, user_id, session):
            pass
        else:
            return {"status": "error", "message": "forbidden"}
        # If changing team_id, check access
        if new_team_id and new_team_id != row.team_id:
            if not await _check_team_access(new_team_id, user_id, session, "owner,admin,member"):
                return {"status": "error", "message": "forbidden"}
        for k, v in payload.items():
            if k == "team_id" and v is not None:
                v = UUID(v) if isinstance(v, str) else v
            setattr(row, k, v)
        row.updated_at = now

    return {"status": "ok", "serverId": str(row.id)}


async def _apply_note_mutation(
    session: AsyncSession, user_id: UUID, entity_id: str, op: str, payload: dict
) -> dict:
    """Apply a single note mutation (upsert or delete)."""
    if op == "delete":
        row = await session.get(Note, UUID(entity_id))
        if row and row.user_id == user_id:
            row.deleted_at = datetime.now(UTC)
            row.updated_at = datetime.now(UTC)
        return {"status": "ok", "serverId": entity_id}

    row = await session.get(Note, UUID(entity_id)) if entity_id else None
    now = datetime.now(UTC)

    if row is None:
        # create new
        row = Note(
            id=UUID(entity_id) if entity_id else UUID(),
            user_id=user_id,
            title=payload.get("title", ""),
            content=payload.get("content"),
            created_at=now,
            updated_at=now,
        )
        session.add(row)
    else:
        # update existing
        if row.user_id != user_id:
            return {"status": "error", "message": "forbidden"}
        for k, v in payload.items():
            setattr(row, k, v)
        row.updated_at = now

    return {"status": "ok", "serverId": str(row.id)}


@router.get("/export-ical", response_class=Response)
async def export_ical(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD), default 30 days ago"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD), default 90 days from now"),
) -> Response:
    """
    Export all tasks (with due dates) and schedules as an iCalendar (.ics) file.
    """
    from datetime import timedelta

    now = datetime.now()
    start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=UTC) if start_date else now - timedelta(days=30)
    end = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=UTC) if end_date else now + timedelta(days=90)

    # Fetch tasks with due dates
    task_stmt = select(Task).where(
        Task.user_id == user.id,
        Task.deleted_at.is_(None),
        Task.due_at.isnot(None),
    )
    task_result = await session.execute(task_stmt)
    tasks = task_result.scalars().all()

    # Fetch schedules in range
    sched_stmt = select(Schedule).where(
        Schedule.user_id == user.id,
        Schedule.start_at >= start,
        Schedule.start_at <= end,
    )
    sched_result = await session.execute(sched_stmt)
    schedules = sched_result.scalars().all()

    ical_parts = [generate_ical_header()]

    for t in tasks:
        d = {
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "due_at": t.due_at.isoformat() if t.due_at else None,
            "start_at": t.start_at.isoformat() if t.start_at else None,
            "completed": bool(t.completed),
            "priority": int(t.priority) if t.priority else 0,
            "project_ids": json.loads(t.project_ids) if isinstance(t.project_ids, str) else (t.project_ids or []),
        }
        ical_parts.append(task_to_vevent(d))

    for s in schedules:
        d = {
            "id": str(s.id),
            "title": s.title,
            "description": s.description,
            "start_at": s.start_at.isoformat() if s.start_at else None,
            "end_at": s.end_at.isoformat() if s.end_at else None,
            "location": s.location,
        }
        ical_parts.append(schedule_to_vevent(d))

    ical_parts.append(generate_ical_footer())
    ical_content = "".join(ical_parts)

    return Response(
        content=ical_content,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=tasktick-export.ics",
        },
    )
