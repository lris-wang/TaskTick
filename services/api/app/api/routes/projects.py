from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_team_member, get_current_user
from app.database import get_session
from app.events import EVENT_PROJECT_CREATED, EVENT_PROJECT_DELETED, EVENT_PROJECT_UPDATED, sse_emitter
from app.models import Project, TeamMember, User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["Projects"])


async def _can_access_project(project: Project, user: User, session: AsyncSession) -> bool:
    """Check if user owns the project or is a team member of the project team."""
    if project.user_id == user.id:
        return True
    if project.team_id is not None:
        result = await session.execute(
            select(TeamMember).where(
                TeamMember.team_id == project.team_id,
                TeamMember.user_id == user.id,
            )
        )
        return result.scalar_one_or_none() is not None
    return False


async def _get_user_team_ids(user_id: UUID, session: AsyncSession) -> list[UUID]:
    """Get all team IDs that the user is a member of."""
    result = await session.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == user_id)
    )
    return list(result.scalars().all())


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[Project]:
    # Get user's personal projects + team projects
    team_ids = await _get_user_team_ids(user.id, session)
    stmt = select(Project).where(
        Project.deleted_at.is_(None),
        (Project.user_id == user.id) | (Project.team_id.in_(team_ids) if team_ids else False),
    ).order_by(Project.created_at.asc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Project:
    # If creating for a team, validate membership
    if body.team_id is not None:
        member = await get_current_team_member(body.team_id, user, session)
        if member.role not in ("owner", "admin", "member"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")

    project = Project(
        user_id=user.id,
        name=body.name,
        color=body.color,
        team_id=body.team_id,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    await sse_emitter.emit(user.id, EVENT_PROJECT_CREATED, {
        "id": str(project.id), "name": project.name, "color": project.color,
        "team_id": str(project.team_id) if project.team_id else None,
        "created_at": project.created_at.isoformat(), "updated_at": project.updated_at.isoformat(),
    })
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Project:
    row = await session.get(Project, project_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    if not await _can_access_project(row, user, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    return row


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Project:
    row = await session.get(Project, project_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    if not await _can_access_project(row, user, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    # If moving to a team or changing team, validate membership
    new_team_id = body.team_id if body.team_id is not None else row.team_id
    if new_team_id is not None:
        member = await get_current_team_member(new_team_id, user, session)
        if member.role not in ("owner", "admin", "member"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    await sse_emitter.emit(user.id, EVENT_PROJECT_UPDATED, {
        "id": str(row.id), "name": row.name, "color": row.color,
        "updated_at": row.updated_at.isoformat(),
    })
    return row


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(Project, project_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    if not await _can_access_project(row, user, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    row.deleted_at = datetime.now(UTC)
    await session.commit()
    await sse_emitter.emit(user.id, EVENT_PROJECT_DELETED, {"id": str(project_id)})
