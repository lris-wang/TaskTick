from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_session
from app.events import EVENT_PROJECT_GROUP_CREATED, EVENT_PROJECT_GROUP_DELETED, EVENT_PROJECT_GROUP_UPDATED, sse_emitter
from app.models import ProjectGroup, User
from app.schemas.project import (
    ProjectGroupCreate,
    ProjectGroupResponse,
    ProjectGroupUpdate,
)

router = APIRouter(prefix="/project-groups", tags=["project-groups"])


@router.get("", response_model=list[ProjectGroupResponse])
async def list_project_groups(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[ProjectGroup]:
    result = await session.execute(
        select(ProjectGroup)
        .where(ProjectGroup.user_id == user.id, ProjectGroup.deleted_at.is_(None))
        .order_by(ProjectGroup.order.asc())
    )
    return result.scalars().all()


@router.post("", response_model=ProjectGroupResponse)
async def create_project_group(
    body: ProjectGroupCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> ProjectGroup:
    from datetime import UTC, datetime

    group = ProjectGroup(
        user_id=user.id,
        name=body.name,
        color=body.color,
        order=body.order,
    )
    session.add(group)
    await session.commit()
    await session.refresh(group)
    await sse_emitter.emit(user.id, EVENT_PROJECT_GROUP_CREATED, ProjectGroupResponse.model_validate(group).model_dump(mode="json"))
    return group


@router.patch("/{group_id}", response_model=ProjectGroupResponse)
async def update_project_group(
    group_id: str,
    body: ProjectGroupUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> ProjectGroup | None:
    from uuid import UUID

    row = await session.get(ProjectGroup, UUID(group_id))
    if row is None or row.user_id != user.id:
        return None
    if body.name is not None:
        row.name = body.name
    if body.color is not None:
        row.color = body.color
    if body.order is not None:
        row.order = body.order
    await session.commit()
    await session.refresh(row)
    await sse_emitter.emit(user.id, EVENT_PROJECT_GROUP_UPDATED, ProjectGroupResponse.model_validate(row).model_dump(mode="json"))
    return row


@router.delete("/{group_id}")
async def delete_project_group(
    group_id: str,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> bool:
    from datetime import UTC, datetime

    from uuid import UUID

    row = await session.get(ProjectGroup, UUID(group_id))
    if row is None or row.user_id != user.id:
        return False
    row.deleted_at = datetime.now(UTC)
    await session.commit()
    await sse_emitter.emit(user.id, EVENT_PROJECT_GROUP_DELETED, {"id": str(group_id)})
    return True
