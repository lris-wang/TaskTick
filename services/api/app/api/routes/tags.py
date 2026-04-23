from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_team_member, get_current_user
from app.database import get_session
from app.events import EVENT_TAG_CREATED, EVENT_TAG_DELETED, EVENT_TAG_UPDATED, sse_emitter
from app.models import Tag, TeamMember, User
from app.schemas.tag import TagCreate, TagResponse, TagUpdate

router = APIRouter(prefix="/tags", tags=["Tags"])


async def _can_access_tag(tag: Tag, user: User, session: AsyncSession) -> bool:
    """Check if user owns the tag or is a team member of the tag team."""
    if tag.user_id == user.id:
        return True
    if tag.team_id is not None:
        result = await session.execute(
            select(TeamMember).where(
                TeamMember.team_id == tag.team_id,
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


@router.get("", response_model=list[TagResponse])
async def list_tags(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[Tag]:
    # Get user's personal tags + team tags
    team_ids = await _get_user_team_ids(user.id, session)
    stmt = select(Tag).where(
        Tag.deleted_at.is_(None),
        (Tag.user_id == user.id) | (Tag.team_id.in_(team_ids) if team_ids else False),
    ).order_by(Tag.created_at.asc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: TagCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Tag:
    # If creating for a team, validate membership
    if body.team_id is not None:
        member = await get_current_team_member(body.team_id, user, session)
        if member.role not in ("owner", "admin", "member"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")

    tag = Tag(
        user_id=user.id,
        name=body.name,
        color=body.color,
        team_id=body.team_id,
    )
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    await sse_emitter.emit(user.id, EVENT_TAG_CREATED, {
        "id": str(tag.id), "name": tag.name, "color": tag.color,
        "team_id": str(tag.team_id) if tag.team_id else None,
        "created_at": tag.created_at.isoformat(), "updated_at": tag.updated_at.isoformat(),
    })
    return tag


@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(
    tag_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Tag:
    row = await session.get(Tag, tag_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="标签不存在")
    if not await _can_access_tag(row, user, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="标签不存在")
    return row


@router.patch("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: UUID,
    body: TagUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Tag:
    row = await session.get(Tag, tag_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="标签不存在")
    if not await _can_access_tag(row, user, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="标签不存在")

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
    await sse_emitter.emit(user.id, EVENT_TAG_UPDATED, {
        "id": str(row.id), "name": row.name, "color": row.color,
        "updated_at": row.updated_at.isoformat(),
    })
    return row


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(Tag, tag_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="标签不存在")
    if not await _can_access_tag(row, user, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="标签不存在")
    row.deleted_at = datetime.now(UTC)
    await session.commit()
    await sse_emitter.emit(user.id, EVENT_TAG_DELETED, {"id": str(tag_id)})
